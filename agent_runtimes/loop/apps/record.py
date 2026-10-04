# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The record of an application, written for every session (LOOP R-07).

What the runtime saw the application do — a session starting, each tool
call, the rule that decided it, each check that did not let it pass, the
answer — is sent to ai-agents (`/api/ai-agents/v1/apps/records`), which keeps
the living instances of applications. Only what the application's
`record.include` names is kept, for as long as its `record.keep_for` says.

A session run to test the application (the Evals engine's runs) says so:
the instance names its `purpose`, `test`, and the launch that ran it, and
both are sent with its entries, so that ai-agents reads tests apart from
real use. A session that names no purpose is real use.

A session nobody opened says what woke it (LOOP R-14): the instance, or the
host that ran it, names `woken_by` — ``{"kind": "schedule", ...}`` with the
schedule's details — and it is sent with the entries and written on the
session's first one. A session a person opened names nothing.

A session is a conversation when the run names one, a run otherwise. The
record is sent after each run, with the token the run was made with; a
record that cannot be sent is logged, and never fails the run.

What a person says of a conversation — a thumb up or down, and a comment
(LOOP V-18) — is written to the same record, as a ``feedback`` entry of that
session, by the recorder that recorded it (`recorder_of`); only when the
application's ``record.include`` names ``feedback``. Unlike the rest, it is
sent at once and a failure to send it is said: the person is waiting for it.

What was said — each turn of a conversation, what the person asked and what
it answered — is kept as a ``turn`` entry, under ``conversations``, the
item of ``record.include`` that names it. Each turn says whether the
application let its conversations be used to suggest tests when it was had
(``record.suggest_tests``, LOOP V-16): only a turn kept while it was on may
be sampled into a suggested test, and ai-agents samples no other.
"""

from __future__ import annotations

import asyncio
import contextvars
import logging
import os
from dataclasses import dataclass, field
from typing import Any, AsyncIterable, Awaitable, Callable, Dict, List, Optional, Set

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import (
    AgentStreamEvent,
    FinalResultEvent,
    ModelRequest,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    ToolCallPart,
    UserPromptPart,
)
from pydantic_ai.tools import ToolDefinition

from agent_runtimes.loop.apps.guards import redact
from agent_runtimes.types import AppSpec

logger = logging.getLogger(__name__)

#: What each kind of entry is kept under, in `record.include`.
INCLUDED_BY = {
    "tool_call": "actions",
    "decision": "decisions",
    "check": "checks",
    "approval": "approvals",
    "output": "outputs",
    "feedback": "feedback",
    "turn": "conversations",
}

#: The session the current run belongs to.
_SESSION: contextvars.ContextVar[str] = contextvars.ContextVar(
    "loop_app_session", default=""
)

Send = Callable[[Dict[str, Any]], Awaitable[None]]

#: The recorder of each session this runtime recorded, by session.
_RECORDERS: Dict[str, "AppRecorder"] = {}

#: The recorder of each application's agent on this runtime, by agent id: the
#: one the session API writes a session's start to (LOOP R-04).
_AGENT_RECORDERS: Dict[str, "AppRecorder"] = {}

#: The longest comment kept with a thumb.
COMMENT_LIMIT = 2000

#: The longest question, and the longest answer, a turn keeps.
TURN_LIMIT = 4000


def recorder_of(session: str) -> Optional["AppRecorder"]:
    """The recorder that recorded a session on this runtime, or None."""
    return _RECORDERS.get(session)


def keep_agent_recorder(agent_id: str, recorder: Optional["AppRecorder"]) -> None:
    """Keep the recorder an application's agent was made with; ``None`` forgets it."""
    if recorder is None:
        _AGENT_RECORDERS.pop(agent_id, None)
    else:
        _AGENT_RECORDERS[agent_id] = recorder


def agent_recorder(agent_id: str) -> Optional["AppRecorder"]:
    """The recorder of an application's agent on this runtime, or None."""
    return _AGENT_RECORDERS.get(agent_id)


def keep_days_of(app: AppSpec) -> int:
    """How many days the record is kept, from `record.keep_for`.

    Read from agentspecs, not from the generated `retention_days`, which is a
    plain field there and says a year whatever `keep_for` says.
    """
    from agentspecs.apps import retention_days

    return int(retention_days(app.record.keep_for))


def _short(value: Any, limit: int = 500) -> str:
    return redact(str(value))[:limit]


class RecordNotSent(RuntimeError):
    """A record that did not reach ai-agents, and why, in a sentence."""


async def send_to_ai_agents(body: Dict[str, Any]) -> None:
    """Send a session's entries to ai-agents, with the token of the run.

    Raises
    ------
    RecordNotSent
        When there is no token or no ai-agents to send it to, or ai-agents
        refused it. A run's record is logged and let go (`AppRecorder.flush`);
        a person's feedback is said to them.
    """
    import httpx

    deployment = str(body.get("deployment_uid") or "").strip()
    if deployment:
        # A deployment's record is written by its application's principal,
        # into its owner's record, and by nobody else (LOOP I-03).
        from agent_runtimes.loop.apps.principal import (
            principal_token,
            principal_token_refusal,
        )

        token = principal_token(deployment)
        if not token:
            raise RecordNotSent(
                f"The record of {body.get('app_uid')} is not sent: "
                f"{principal_token_refusal(deployment)}"
            )
    else:
        try:
            from agent_runtimes.context.identities import get_request_user_jwt

            token = get_request_user_jwt()
        except Exception:  # noqa: BLE001 - no request context: the runtime's token
            token = None
        token = token or os.environ.get("DATALAYER_USER_TOKEN")
    if not token:
        raise RecordNotSent(
            f"The record of {body.get('app_uid')} is not sent: no token."
        )
    from datalayer_core.utils.urls import DatalayerURLs

    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        raise RecordNotSent(
            f"The record of {body.get('app_uid')} is not sent: no ai-agents."
        )
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{url.rstrip('/')}/api/ai-agents/v1/apps/records",
            json=body,
            headers={"Authorization": f"Bearer {token}"},
        )
    if response.status_code >= 300:
        raise RecordNotSent(
            f"The record of {body.get('app_uid')} was refused "
            f"({response.status_code}): {response.text[:200]}"
        )
    logger.info(
        "The record of %s sent: %d entries, session %s.",
        body.get("app_uid"),
        len(body.get("entries") or []),
        body.get("session_uid"),
    )


@dataclass
class AppRecorder:
    """The entries of an application's sessions, kept until they are sent."""

    app: AppSpec
    #: The application as the platform knows it (its `app` item); its id otherwise.
    app_uid: str = ""
    deployment_uid: str = ""
    version: int = 0
    #: `test` when the session is run to test the application; real use otherwise.
    purpose: str = ""
    #: The launch that ran it, for a test.
    launch_uid: str = ""
    #: What woke its sessions, when nobody opened them: ``{"kind": "schedule", ...}``.
    woken_by: Dict[str, Any] = field(default_factory=dict)
    send: Send = send_to_ai_agents

    _pending: Dict[str, List[Dict[str, Any]]] = field(default_factory=dict, init=False)
    _started: Set[str] = field(default_factory=set, init=False)
    _woken: Dict[str, Dict[str, Any]] = field(default_factory=dict, init=False)

    def kept(self, kind: str) -> bool:
        if kind == "session":
            return True
        wanted = INCLUDED_BY.get(kind)
        include = {
            str(getattr(item, "value", item)) for item in self.app.record.include
        }
        return wanted in include

    def add(
        self, kind: str, summary: str, payload: Optional[Dict[str, Any]] = None
    ) -> None:
        session = _SESSION.get()
        if not session or not self.kept(kind):
            return
        self._pending.setdefault(session, []).append(
            {"kind": kind, "summary": summary[:2000], "payload": payload or {}}
        )

    def woken(self, session: str) -> Dict[str, Any]:
        """What woke a session: its own, or every session's; empty when a person opened it."""
        return self._woken.get(session) or self.woken_by

    def start(
        self,
        session: str,
        *,
        woken_by: Optional[Dict[str, Any]] = None,
        resumed: bool = False,
    ) -> None:
        """Make ``session`` the one entries are added to, and say it started.

        A session resumed from its record (LOOP R-04) says it resumed, in an
        entry of the same session: its record goes on where it stopped.
        """
        _SESSION.set(session)
        if session not in self._started:
            self._started.add(session)
            _RECORDERS[session] = self
            if woken_by:
                self._woken[session] = dict(woken_by)
            woken = self.woken(session)
            self.add(
                "session",
                f"A session of {self.app.name} "
                + ("resumed" if resumed else "started")
                + (f", woken by its {woken.get('kind')}" if woken else ""),
                {
                    "app": self.app.id,
                    **({"woken_by": woken} if woken else {}),
                    **({"resumed": True} if resumed else {}),
                },
            )

    def _body(self, session: str, entries: List[Dict[str, Any]]) -> Dict[str, Any]:
        """What is sent to ai-agents for a session's entries."""
        return {
            "app_uid": self.app_uid or self.app.id,
            "session_uid": session,
            "deployment_uid": self.deployment_uid,
            "version": self.version,
            "purpose": self.purpose,
            "launch_uid": self.launch_uid,
            "woken_by": self.woken(session),
            "keep_days": keep_days_of(self.app),
            "entries": entries,
        }

    async def flush(self, session: str) -> None:
        entries = self._pending.pop(session, [])
        if not entries:
            return
        body = self._body(session, entries)
        try:
            await self.send(body)
        except Exception as error:  # noqa: BLE001 - a record is never worth a run
            logger.warning("The record of %s was not sent: %s", body["app_uid"], error)

    async def feedback(
        self, session: str, *, liked: bool, comment: str = "", by: str = ""
    ) -> Dict[str, Any]:
        """Write a person's word on a session to the record, and send it now.

        Parameters
        ----------
        session : str
            The session, as this recorder recorded it.
        liked : bool
            The thumb: up or down.
        comment : str
            What they said besides, if anything.
        by : str
            Who said it, as the runtime knows the caller.

        Returns
        -------
        dict
            The entry sent.

        Raises
        ------
        ValueError
            When this recorder did not record the session, or the
            application keeps no feedback.
        """
        if session not in self._started:
            raise ValueError(
                f"No session {session!r} of {self.app.name} was recorded here."
            )
        if not self.kept("feedback"):
            raise ValueError(
                f"{self.app.name} keeps no feedback: its record does not name it."
            )
        said = redact(comment.strip())[:COMMENT_LIMIT]
        entry = {
            "kind": "feedback",
            "summary": (
                ("Liked it" if liked else "Did not like it")
                + (f": {said}" if said else "")
            )[:COMMENT_LIMIT],
            "payload": {"liked": liked, "comment": said, "by": by},
        }
        await self.send(self._body(session, [entry]))
        return entry

    def turned(self, asked: str, answered: str) -> None:
        """Keep a turn of the conversation: what was asked, what it answered.

        Kept under ``conversations``; it says whether the application let its
        conversations suggest tests then (``record.suggest_tests``).
        """
        asked = redact(asked.strip())[:TURN_LIMIT]
        if not asked:
            return
        self.add(
            "turn",
            asked,
            {
                "asked": asked,
                "answered": redact(answered.strip())[:TURN_LIMIT],
                "suggest_tests": bool(self.app.record.suggest_tests),
            },
        )

    # --- what the other capabilities tell it ---------------------------------------

    def decided(self, enforced: Any) -> None:
        decision = getattr(enforced, "decision", enforced)
        self.add(
            "decision",
            f"{getattr(decision, 'tool', '?')}: {getattr(decision, 'behaviour', '?')}",
            {
                "tool": getattr(decision, "tool", ""),
                "behaviour": getattr(decision, "behaviour", ""),
                "because": getattr(decision, "because", ""),
            },
        )

    def checked(self, stage: str, verdict: Any) -> None:
        self.add(
            "check",
            getattr(verdict, "sentence", "") or getattr(verdict, "action", ""),
            {
                "stage": stage,
                "action": getattr(verdict, "action", ""),
                "gate": getattr(verdict, "gate", ""),
            },
        )


@dataclass
class AppRecordCapability(AbstractCapability[Any]):
    """Write the record of an application's sessions.

    Sent when the run ends — and, since a client that has its answer may go
    before the run has ended (the terminal stops its runtime at once, a
    browser closes its tab), as soon as the stream that carried the final
    answer ends, or is cancelled, in a task of its own. Once per run.
    """

    recorder: AppRecorder

    _sessions: Dict[str, str] = field(default_factory=dict, init=False, repr=False)
    _answers: Dict[str, str] = field(default_factory=dict, init=False, repr=False)
    _sending: Set[Any] = field(default_factory=set, init=False, repr=False)

    def _key(self, ctx: RunContext[Any]) -> str:
        return str(ctx.run_id or ctx.conversation_id or "run")

    @staticmethod
    def _asked(ctx: RunContext[Any]) -> str:
        """What the person asked in this run: its prompt, else the last one in its messages."""
        prompt = ctx.prompt
        if prompt is None:
            for message in reversed(ctx.messages or []):
                if not isinstance(message, ModelRequest):
                    continue
                parts = [p for p in message.parts if isinstance(p, UserPromptPart)]
                if parts:
                    prompt = parts[-1].content
                    break
        if isinstance(prompt, str):
            return prompt
        return " ".join(item for item in prompt or [] if isinstance(item, str))

    async def before_run(self, ctx: RunContext[Any]) -> None:
        session = str(ctx.conversation_id or ctx.run_id or "run")
        logger.info("Recording %s, session %s.", self.recorder.app.id, session)
        self._sessions[self._key(ctx)] = session
        self.recorder.start(session)

    async def after_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
        result: Any,
    ) -> Any:
        self.recorder.add(
            "tool_call",
            f"{call.tool_name} called",
            {
                "tool": call.tool_name,
                "arguments": _short(args),
                "result": _short(result, 300),
            },
        )
        return result

    async def _close(
        self,
        ctx: RunContext[Any],
        summary: str,
        payload: Dict[str, Any],
        answered: Optional[str] = None,
    ) -> None:
        """Add the run's last entries and send its session, once.

        A run that answered keeps its turn, what was asked and what it
        answered; one that stopped keeps how it stopped.
        """
        session = self._sessions.pop(self._key(ctx), None)
        self._answers.pop(self._key(ctx), None)
        if session is None:
            return
        _SESSION.set(session)
        if answered is not None and self.recorder.kept("turn"):
            self.recorder.turned(self._asked(ctx), answered)
        self.recorder.add("output", summary, payload)
        await self.recorder.flush(session)

    async def wrap_run_event_stream(
        self, ctx: RunContext[Any], *, stream: AsyncIterable[AgentStreamEvent]
    ) -> AsyncIterable[AgentStreamEvent]:
        key = self._key(ctx)
        cancelled = False
        final = False
        try:
            async for event in stream:
                if isinstance(event, FinalResultEvent):
                    final = True
                if isinstance(event, PartStartEvent) and isinstance(
                    event.part, TextPart
                ):
                    self._answers[key] = event.part.content
                elif isinstance(event, PartDeltaEvent) and isinstance(
                    event.delta, TextPartDelta
                ):
                    self._answers[key] = (
                        self._answers.get(key, "") + event.delta.content_delta
                    )
                yield event
        except (asyncio.CancelledError, GeneratorExit):
            # The client went. A node's stream ending, or failing, is not
            # this: the run goes on, or says how it stopped (`on_run_error`).
            cancelled = True
            raise
        finally:
            # First, before closing what it wraps: closing an MCP server's
            # stream from another task raises (anyio's cancel scope), and
            # nothing after a raise in a `finally` runs.
            if (cancelled or final) and key in self._sessions:
                # The answer is given, or the client went: sent now, in a task
                # of its own, which neither a cancellation nor a client that
                # stops reading at `RUN_FINISHED` (and stops the runtime with
                # it, as the terminal does) takes away.
                answer = self._answers.get(key, "")
                task = asyncio.get_running_loop().create_task(
                    self._close(
                        ctx,
                        _short(answer, 300),
                        {"length": len(answer)},
                        # A client gone before the answer leaves no turn.
                        answered=answer if final else None,
                    )
                )
                # Held until done: a task nothing refers to may be collected.
                self._sending.add(task)
                task.add_done_callback(self._sending.discard)
            close = getattr(stream, "aclose", None)
            if close is not None:
                await close()

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        output = getattr(result, "output", "")
        await self._close(
            ctx, _short(output, 300), {"length": len(str(output))}, answered=str(output)
        )
        return result

    async def on_run_error(self, ctx: RunContext[Any], *, error: BaseException) -> Any:
        # A run a rule or a check stopped is recorded too: that is when it matters.
        await self._close(
            ctx, f"Stopped: {_short(error, 300)}", {"error": type(error).__name__}
        )
        raise error


__all__ = [
    "AppRecordCapability",
    "AppRecorder",
    "COMMENT_LIMIT",
    "INCLUDED_BY",
    "RecordNotSent",
    "TURN_LIMIT",
    "agent_recorder",
    "keep_agent_recorder",
    "recorder_of",
    "send_to_ai_agents",
]
