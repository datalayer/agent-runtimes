# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Wakes: what an actor does when Agent Substrate resumes it.

A suspended actor is a snapshot of its memory and files. Resumed, the process
carries on from where it was: nothing inside it is told. What Agent Substrate
does on every resume is call the template's ``wakeupProbe`` until it answers
200, and never again while the actor runs. The probe is therefore the wake:
the first probe after a quiet spell is one, the ones right behind it (the
prober polls every millisecond until it is answered) are the same wake.

The quiet spell is measured on both clocks. A restored gVisor sandbox carries
its monotonic clock on from the snapshot, so the suspend is not on it: the
first probe of an actor restored from the golden snapshot comes within
milliseconds, on that clock, of the golden actor's last one. The wall clock
does move across the suspend.

On each wake the hooks run, in the order they were added. The default ones:

- the actor's identity is read again from its ``systemInfo`` volume, and when
  the actor serves a Datalayer runtime, ``DATALAYER_RUNTIME_ID`` is set to the
  runtime's uid, the variable every part of agent-runtimes reads at the time of
  use. An actor restored from the golden snapshot so learns that it is itself,
  not the golden actor;
- when the template projects a trust bundle (the egress gateway's CA beside the
  public roots) and no other CA file is configured, ``SSL_CERT_FILE`` and
  ``REQUESTS_CA_BUNDLE`` name it, for the clients made from then on.

A hook that fails is logged and does not fail the probe: the actor serves, and
the next wake runs the hooks again.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, MutableMapping, Optional

from .identity import ActorIdentity, read_identity

logger = logging.getLogger(__name__)

#: How long without a probe before the next probe is a new wake. The prober
#: retries every millisecond until it is answered; a running actor is never
#: probed. Anything longer than a burst and shorter than a suspend will do.
QUIET_SECONDS = 2.0

#: The variable the runtime's uid is read from across agent-runtimes.
RUNTIME_ID_VARIABLE = "DATALAYER_RUNTIME_ID"

#: The CA variables the HTTP clients (httpx, requests, ssl) read.
CA_VARIABLES = ("SSL_CERT_FILE", "REQUESTS_CA_BUNDLE")

WakeHook = Callable[["Wake"], None]


class Wake:
    """One wake: its count, when it happened, and the identity read for it."""

    def __init__(self, count: int, at: datetime, identity: Optional[ActorIdentity]):
        self.count = count
        self.at = at
        self.identity = identity


class WakeTracker:
    """Tells a wake from the probes that follow it, and runs the hooks.

    Parameters
    ----------
    system_info_dir : str
        Where the actor's metadata files are projected.
    trust_bundle : str
        Where the trust bundle is projected.
    environ : MutableMapping[str, str], optional
        The environment the hooks write; ``os.environ`` when not given.
    clock : Callable[[], float], optional
        The monotonic clock of the quiet spell; ``time.monotonic`` when not given.
    wall_clock : Callable[[], float], optional
        The wall clock of the quiet spell, the one a suspend moves;
        ``time.time`` when not given.
    quiet_seconds : float
        How long without a probe makes the next one a wake.
    """

    def __init__(
        self,
        system_info_dir: str,
        trust_bundle: str,
        *,
        environ: Optional[MutableMapping[str, str]] = None,
        clock: Optional[Callable[[], float]] = None,
        wall_clock: Optional[Callable[[], float]] = None,
        quiet_seconds: float = QUIET_SECONDS,
    ):
        self.system_info_dir = system_info_dir
        self.trust_bundle = trust_bundle
        self._environ = os.environ if environ is None else environ
        self._clock = clock or time.monotonic
        self._wall_clock = wall_clock or time.time
        self._quiet = quiet_seconds
        self._last_probe: Optional[float] = None
        self._last_probe_wall: Optional[float] = None
        self._lock = threading.Lock()
        self._hooks: list[WakeHook] = [self._bind_identity, self._bind_trust_bundle]
        self.wakes = 0
        self.last_wake: Optional[Wake] = None

    def add_hook(self, hook: WakeHook) -> None:
        """Run ``hook`` on every wake, after the hooks already added."""
        self._hooks.append(hook)

    def identity(self) -> Optional[ActorIdentity]:
        """The actor's identity, read now."""
        return read_identity(self.system_info_dir)

    def probe(self) -> bool:
        """Answer a wakeup probe; run the hooks when it starts a wake.

        Returns
        -------
        bool
            Whether this probe was a wake.
        """
        now, wall = self._clock(), self._wall_clock()
        with self._lock:
            woke = (
                self._last_probe is None
                or self._last_probe_wall is None
                or now - self._last_probe > self._quiet
                or abs(wall - self._last_probe_wall) > self._quiet
            )
            self._last_probe, self._last_probe_wall = now, wall
            if not woke:
                return False
            self.wakes += 1
            wake = Wake(self.wakes, datetime.now(timezone.utc), self.identity())
            self.last_wake = wake
            hooks = list(self._hooks)
        for hook in hooks:
            try:
                hook(wake)
            except Exception:
                logger.exception("ate: a wake hook failed (wake %d)", wake.count)
        logger.info(
            "ate: wake %d as %s",
            wake.count,
            f"{wake.identity.atespace}/{wake.identity.name}"
            if wake.identity
            else "no actor",
        )
        return True

    def _bind_identity(self, wake: Wake) -> None:
        runtime_uid = wake.identity.runtime_uid if wake.identity else None
        if runtime_uid:
            self._environ[RUNTIME_ID_VARIABLE] = runtime_uid

    def _bind_trust_bundle(self, wake: Wake) -> None:
        if not Path(self.trust_bundle).is_file():
            return
        for variable in CA_VARIABLES:
            said = self._environ.get(variable)
            if not said or said == self.trust_bundle:
                self._environ[variable] = self.trust_bundle

    def state(self) -> dict[str, object]:
        """The wakes so far, for ``/ate/identity``."""
        last = self.last_wake
        return {
            "wakes": self.wakes,
            "last_wake_at": last.at.isoformat() if last else None,
        }


_tracker: Optional[WakeTracker] = None
_tracker_lock = threading.Lock()


def wake_tracker() -> WakeTracker:
    """The process's tracker, made from the target's settings at first use."""
    global _tracker
    with _tracker_lock:
        if _tracker is None:
            from .settings import ate_settings

            settings = ate_settings()
            _tracker = WakeTracker(settings.system_info_dir, settings.trust_bundle)
        return _tracker


def reset_wake_tracker(tracker: Optional[WakeTracker] = None) -> None:
    """Replace the process's tracker (tests)."""
    global _tracker
    with _tracker_lock:
        _tracker = tracker


__all__ = [
    "CA_VARIABLES",
    "QUIET_SECONDS",
    "RUNTIME_ID_VARIABLE",
    "Wake",
    "WakeTracker",
    "reset_wake_tracker",
    "wake_tracker",
]
