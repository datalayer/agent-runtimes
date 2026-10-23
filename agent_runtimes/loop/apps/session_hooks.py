# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ``session.hook`` point and its first two hooks (MH-F06): the audit
rows in the record, and an OTEL span per operation.

Every operation of the session — open, resume, swap, clone, export, import,
end — runs its hooks first (:func:`fire`), each given the session and the
operation's facts; a hook that refuses stops the operation with its sentence
(:class:`~agent_runtimes.plugins.points.HookRefused`), and one that raises
anything else stops it too, saying which hook raised — never swallowed.

The **audit hook** writes the session's audit rows (MH-30) through the
recorder: ``swapped``, ``cloned`` (on both sessions), ``exported``,
``imported``; ``paused`` and ``ended`` are the session's own and written by
it. The **OTEL hook** opens a span under the session's trace through the
runtime's own tracer (``otel/tracer.py``) — ``session.swap``,
``session.clone``, … with the session's uid and the operation's facts as
attributes — which is what the platform counts swaps, clones, exports and
imports per application from (§6: the MVP's metrics). IAM's sharing check
is a third hook later (MH-P11).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional

from agent_runtimes.plugins.points import (
    HOOK_EVENTS,
    SESSION_HOOKS,
    HookRefused,
    run_hook,
)

logger = logging.getLogger(__name__)


class HookFailed(Exception):
    """A hook raised something that is not a refusal: the operation does not run, and says which hook."""

    def __init__(self, hook: str, event: str, error: BaseException):
        super().__init__(
            f"The hook {hook} refused on_{event} by failing: {type(error).__name__}: {error}"
        )
        self.hook = hook
        self.event = event
        self.error = error


def _attributes(facts: Mapping[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for key, value in facts.items():
        if value is None:
            continue
        if isinstance(value, (str, bool, int, float)):
            out[f"session.{key}"] = value
        else:
            out[f"session.{key}"] = json.dumps(value, default=str)[:1000]
    return out


@dataclass
class AuditHook:
    """The audit rows of §6 in the record, through the session's recorder."""

    name: str = "audit"

    def on_swap(self, session: Any, facts: Mapping[str, Any]) -> None:
        recorder = getattr(session, "recorder", None)
        if recorder is None:
            return
        session.recorder.start(session.uid, facts=session.facts())
        session.recorder.swapped(
            session.uid,
            from_agent=str(facts.get("from_agent") or ""),
            to_agent=str(facts.get("to_agent") or ""),
            from_harness=facts.get("from_harness"),
            to_harness=facts.get("to_harness"),
            at_turn=int(facts.get("at_turn") or 0),
            said=str(facts.get("said") or ""),
            carried=dict(facts.get("carried") or {}),
            dropped=dict(facts.get("dropped") or {}),
        )

    def on_clone(self, session: Any, facts: Mapping[str, Any]) -> None:
        # On the source: `to`; the clone's own `from` is written as it opens.
        recorder = getattr(session, "recorder", None)
        if recorder is None or not facts.get("to"):
            return
        session.recorder.start(session.uid, facts=session.facts())
        session.recorder.cloned(
            session.uid,
            target=str(facts.get("to") or ""),
            at_turn=int(facts.get("at_turn") or 0),
        )

    def on_export(self, session: Any, facts: Mapping[str, Any]) -> None:
        recorder = getattr(session, "recorder", None)
        if recorder is None:
            return
        recorder.start(session.uid, facts=session.facts())
        recorder.exported(
            session.uid,
            by=str(facts.get("by") or ""),
            entries=int(facts.get("entries") or 0),
            redactions=int(facts.get("redactions") or 0),
            digest=str(facts.get("digest") or ""),
        )

    def on_import(self, session: Any, facts: Mapping[str, Any]) -> None:
        recorder = getattr(session, "recorder", None)
        if recorder is None:
            return
        session.recorder.start(session.uid, facts=session.facts())
        session.recorder.imported(
            session.uid,
            digest=str(facts.get("digest") or ""),
            exported_at=str(facts.get("exported_at") or ""),
            exported_by=str(facts.get("exported_by") or ""),
            redactions=int(facts.get("redactions") or 0),
            file_version=int(facts.get("file_version") or 0),
            current_version=int(facts.get("current_version") or 0),
            source_uid=str(facts.get("source_uid") or ""),
        )


@dataclass
class OtelHook:
    """A span per operation under the session's trace, through the runtime's tracer."""

    name: str = "otel"
    spans: Optional[List[Dict[str, Any]]] = None
    """What was opened, kept when a test asks (``spans=[]``)."""

    def _span(self, event: str, session: Any, facts: Mapping[str, Any]) -> None:
        from agent_runtimes.otel.tracer import get_tracer

        attributes = {"session.operation": event, **_attributes(facts)}
        with get_tracer(agent_id=str(getattr(session, "agent_id", "") or "")).span(
            f"session.{event}", attributes, session_id=str(session.uid)
        ) as span:
            if self.spans is not None:
                self.spans.append(
                    {
                        "name": f"session.{event}",
                        "session": str(session.uid),
                        **attributes,
                    }
                )
            if span is not None and hasattr(span, "add_event"):
                span.add_event(f"session.{event}")

    def on_open(self, session: Any, facts: Mapping[str, Any]) -> None:
        self._span("open", session, facts)

    def on_resume(self, session: Any, facts: Mapping[str, Any]) -> None:
        self._span("resume", session, facts)

    def on_swap(self, session: Any, facts: Mapping[str, Any]) -> None:
        self._span("swap", session, facts)

    def on_clone(self, session: Any, facts: Mapping[str, Any]) -> None:
        self._span("clone", session, facts)

    def on_export(self, session: Any, facts: Mapping[str, Any]) -> None:
        self._span("export", session, facts)

    def on_import(self, session: Any, facts: Mapping[str, Any]) -> None:
        self._span("import", session, facts)

    def on_end(self, session: Any, facts: Mapping[str, Any]) -> None:
        self._span("end", session, facts)


#: The two built-in hooks.
AUDIT_HOOK = AuditHook()
OTEL_HOOK = OtelHook()


def hooks(platform: Any = None) -> List[Any]:
    """The hooks contributed, in order."""
    from agent_runtimes.plugins.host import accepted, session_platform

    return [c.value for c in accepted(session_platform(platform), SESSION_HOOKS)]


async def fire(
    event: str, session: Any, facts: Mapping[str, Any], platform: Any = None
) -> None:
    """Run every hook's ``on_<event>`` before the operation.

    Raises
    ------
    HookRefused
        When a hook refuses, with its sentence and status.
    HookFailed
        When a hook raises anything else: the operation does not run.
    """
    if event not in HOOK_EVENTS:
        raise ValueError(
            f"There is no session operation {event!r}: one of {', '.join(HOOK_EVENTS)}."
        )
    for hook in hooks(platform):
        try:
            await run_hook(hook, event, session, facts)
        except HookRefused:
            raise
        except Exception as error:  # noqa: BLE001 - said, never swallowed
            raise HookFailed(
                str(getattr(hook, "name", type(hook).__name__)), event, error
            ) from error


__all__ = [
    "AUDIT_HOOK",
    "OTEL_HOOK",
    "AuditHook",
    "HookFailed",
    "OtelHook",
    "fire",
    "hooks",
]
