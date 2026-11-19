# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What ``agent-runtimes serve --target ate`` is started with.

An actor's template gives the container its command and literal environment
variables. Agent Substrate routes the actor's traffic to port 80 unless a
client tunnels to another, so the server listens there on every interface.

The environment is part of the golden snapshot every actor of a template
starts from: it says what the template says, the same for every actor. What
differs between actors (who it is, which runtime it serves) is read from the
``systemInfo`` volume by :mod:`.identity`, at each wake.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping, Optional

#: The target's name, on ``serve --target`` and in ``AGENT_RUNTIMES_TARGET``.
TARGET = "ate"

#: Where the target is written for the app the server loads.
TARGET_VARIABLE = "AGENT_RUNTIMES_TARGET"

#: The agentspec the actor serves as ``default``, when the template names one.
SPEC_VARIABLE = "AGENT_SPEC_ID"

#: The port, when the template moves it off 80.
PORT_VARIABLE = "ATE_PORT"

#: Where the template mounts the ``systemInfo`` volume of the actor's metadata.
SYSTEM_INFO_VARIABLE = "ATE_SYSTEM_INFO_DIR"

#: Where the template mounts the projected trust bundle (the egress gateway's
#: CA, beside the public roots).
TRUST_BUNDLE_VARIABLE = "ATE_TRUST_BUNDLE"

#: Every interface: the actor's network is private to its sandbox, reached only
#: through Agent Substrate's router.
HOST = "0.0.0.0"  # nosec B104 - the sandbox's private interface, reached only through the ate router

#: Agent Substrate's default actor port.
DEFAULT_PORT = 80

#: Where the ``systemInfo`` volume is mounted by the rendered template.
DEFAULT_SYSTEM_INFO_DIR = "/run/ate"

#: Where the trust bundle is projected by the rendered template.
DEFAULT_TRUST_BUNDLE = "/run/substrate/certs/ca.pem"

#: The path of the wakeup probe (the template's ``wakeupProbe.httpGet.path``).
WAKEUP_PATH = "/ate/wakeup"

#: The path of the actor's identity.
IDENTITY_PATH = "/ate/identity"


@dataclass(frozen=True)
class AteSettings:
    """Where the server listens, what it serves, where the actor's files are."""

    spec_id: str
    host: str
    port: int
    system_info_dir: str
    trust_bundle: str


def ate_settings(environ: Optional[Mapping[str, str]] = None) -> AteSettings:
    """The settings of an ate actor, read from its environment.

    Parameters
    ----------
    environ : Mapping[str, str], optional
        The environment; ``os.environ`` when not given.

    Returns
    -------
    AteSettings
        The agentspec id (``""`` when the actor starts without an agent), the
        host, the port, the ``systemInfo`` directory and the trust bundle.

    Raises
    ------
    ValueError
        When ``ATE_PORT`` is not a port, in a sentence.
    """
    env = os.environ if environ is None else environ
    spec_id = (env.get(SPEC_VARIABLE) or "").strip()
    said = (env.get(PORT_VARIABLE) or "").strip()
    port = DEFAULT_PORT
    if said:
        if not said.isdigit() or not 0 < int(said) < 65536:
            raise ValueError(
                f"{PORT_VARIABLE} is a port from 1 to 65535, not {said!r}."
            )
        port = int(said)
    return AteSettings(
        spec_id=spec_id,
        host=HOST,
        port=port,
        system_info_dir=(env.get(SYSTEM_INFO_VARIABLE) or "").strip()
        or DEFAULT_SYSTEM_INFO_DIR,
        trust_bundle=(env.get(TRUST_BUNDLE_VARIABLE) or "").strip()
        or DEFAULT_TRUST_BUNDLE,
    )


def is_ate_target(environ: Optional[Mapping[str, str]] = None) -> bool:
    """Whether the server was started with ``--target ate``."""
    env = os.environ if environ is None else environ
    return (env.get(TARGET_VARIABLE) or "").strip() == TARGET


__all__ = [
    "AteSettings",
    "DEFAULT_PORT",
    "DEFAULT_SYSTEM_INFO_DIR",
    "DEFAULT_TRUST_BUNDLE",
    "HOST",
    "IDENTITY_PATH",
    "PORT_VARIABLE",
    "SPEC_VARIABLE",
    "SYSTEM_INFO_VARIABLE",
    "TARGET",
    "TARGET_VARIABLE",
    "TRUST_BUNDLE_VARIABLE",
    "WAKEUP_PATH",
    "ate_settings",
    "is_ate_target",
]
