# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The record of an application, written for every session (LOOP R-07).

What the runtime saw the application do — a session starting, each tool
call, the rule that decided it, each check that did not let it pass, the
answer — is sent to ai-agents (`/api/ai-agents/v1/apps/records`), which keeps
the living instances of applications. Only what the application's
`record.include` names is kept, for as long as its `record.keep_for` says.

A session is a conversation when the run names one, a run otherwise. The
record is sent after each run, with the token the run was made with; a
record that cannot be sent is logged, and never fails the run.
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
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    ToolCallPart,
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
}

#: The session the current run belongs to.
_SESSION: contextvars.ContextVar[str] = contextvars.ContextVar(
    "loop_app_session", default=""
)

Send = Callable[[Dict[str, Any]], Awaitable[None]]


def keep_days_of(app: AppSpec) -> int:
    """How many days the record is kept, from `record.keep_for`.

    Read from agentspecs, not from the generated `retention_days`, which is a
    plain field there and says a year whatever `keep_for` says.
    """
    try:
        from agentspecs.apps import retention_days

        return int(retention_days(app.record.keep_for))
    except Exception:  # noqa: BLE001 - an unreadable retention keeps the default
        return 365


def _short(value: Any, limit: int = 500) -> str:
    return redact(str(value))[:limit]


async def send_to_ai_agents(body: Dict[str, Any]) -> None:
    """Send a session's entries to ai-agents, with the token of the run."""
    import httpx

    try:
        from agent_runtimes.context.identities import get_request_user_jwt

        token = get_request_user_jwt()
    except Exception:  # noqa: BLE001 - no request context: the runtime's token
        token = None
    token = token or os.environ.get("DATALAYER_USER_TOKEN")
    if not token:
        logger.info("The record of %s is not sent: no token.", body.get("app_uid"))
        return
    from datalayer_core.utils.urls import DatalayerURLs

    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        logger.info("The record of %s is not sent: no ai-agents.", body.get("app_uid"))
        return
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{url.rstrip('/')}/api/ai-agents/v1/apps/records",
            json=body,
            headers={"Authorization": f"Bearer {token}"},
        )
        if response.status_code >= 300:
            logger.warning(
                "The record of %s was refused (%s): %s",
                body.get("app_uid"),
                response.status_code,
                response.text[:200],
            )


@dataclass
class AppRecorder:
    """The entries of an application's sessions, kept until they are sent."""

    app: AppSpec
    #: The application as the platform knows it (its `app` item); its id otherwise.
    app_uid: str = ""
    deployment_uid: str = ""
    version: int = 0
    send: Send = send_to_ai_agents

    _pending: Dict[str, List[Dict[str, Any]]] = field(default_factory=dict, init=False)
    _started: Set[str] = field(default_factory=set, init=False)

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

    def start(self, session: str) -> None:
        _SESSION.set(session)
        if session not in self._started:
            self._started.add(session)
            self.add(
                "session", f"A session of {self.app.name} started", {"app": self.app.id}
            )

    async def flush(self, session: str) -> None:
        entries = self._pending.pop(session, [])
        if not entries:
            return
        body = {
            "app_uid": self.app_uid or self.app.id,
            "session_uid": session,
            "deployment_uid": self.deployment_uid,
            "version": self.version,
            "keep_days": keep_days_of(self.app),
            "entries": entries,
        }
        try:
            await self.send(body)
        except Exception as error:  # noqa: BLE001 - a record is never worth a run
            logger.warning("The record of %s was not sent: %s", body["app_uid"], error)

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

    async def before_run(self, ctx: RunContext[Any]) -> None:
        session = str(ctx.conversation_id or ctx.run_id or "run")
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
        self, ctx: RunContext[Any], summary: str, payload: Dict[str, Any]
    ) -> None:
        """Add the run's last entry and send its session, once."""
        session = self._sessions.pop(self._key(ctx), None)
        self._answers.pop(self._key(ctx), None)
        if session is None:
            return
        _SESSION.set(session)
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
                    self._close(ctx, _short(answer, 300), {"length": len(answer)})
                )
                # Held until done: a task nothing refers to may be collected.
                self._sending.add(task)
                task.add_done_callback(self._sending.discard)
            close = getattr(stream, "aclose", None)
            if close is not None:
                await close()

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        output = getattr(result, "output", "")
        await self._close(ctx, _short(output, 300), {"length": len(str(output))})
        return result

    async def on_run_error(self, ctx: RunContext[Any], *, error: BaseException) -> Any:
        # A run a rule or a check stopped is recorded too: that is when it matters.
        await self._close(
            ctx, f"Stopped: {_short(error, 300)}", {"error": type(error).__name__}
        )
        raise error


__all__ = ["AppRecordCapability", "AppRecorder", "INCLUDED_BY", "send_to_ai_agents"]
