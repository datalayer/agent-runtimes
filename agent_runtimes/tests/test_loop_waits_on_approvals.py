# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``loop`` says the approval a run waits on, and waits for its decision.

A tool call that needs a person's approval leaves the run silent until it is
decided. ``loop --prompt`` read that silence as a dead stream after 60 s and
stopped with an empty "Request error" (worker-crawler on r1, 8 November 2026).
Now the AG-UI client keeps a silent run open while an approval is awaited, and
the TUX says the approval, how to decide it, and the decision. ai-agents and
the runtime's stream are faked.
"""

from __future__ import annotations

import asyncio
import io
import json
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from rich.console import Console

from agent_runtimes.chat.tux import CliTux
from agent_runtimes.commands import tool_approvals as approvals_command
from agent_runtimes.transports.clients.ag_ui_client import AGUIClient, AGUIClientError

RUNTIME = "01m6y41j6zyr1bp48q2p2w6ewa"
APPROVAL = {
    "id": "01M6Y475W1Q8ATP6WHNN00ZX3D",
    "status": "pending",
    "tool_name": "skill:datalayer-memory-add",
    "agent_id": "default",
    "runtime_name": RUNTIME,
    "tool_args": {"skill": "datalayer-memory-add"},
}
FINISHED = {"type": "RUN_FINISHED", "threadId": "t", "runId": "r"}


def _silent_then_finished(silence: float) -> httpx.MockTransport:
    """A run that says nothing for ``silence`` seconds, then finishes."""

    async def body() -> AsyncIterator[bytes]:
        await asyncio.sleep(silence)
        yield f"data: {json.dumps(FINISHED)}\n\n".encode()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=body())

    return httpx.MockTransport(handler)


async def _run(client: AGUIClient, **kwargs: Any) -> list[str]:
    client._client = httpx.AsyncClient(transport=_silent_then_finished(0.8))
    return [str(event.type) async for event in client.run("hello", **kwargs)]


def _client() -> AGUIClient:
    client = AGUIClient("http://runtime/api/v1/ag-ui/default/", timeout=0.3)
    client.IDLE_TICK_SECONDS = 0.05
    return client


def test_a_run_waiting_on_an_approval_stays_open() -> None:
    events = asyncio.run(_run(_client(), keep_waiting=lambda: True))

    assert any("RUN_FINISHED" in event for event in events)


def test_a_silence_with_nothing_awaited_still_ends_the_run() -> None:
    with pytest.raises(AGUIClientError, match="said nothing for"):
        asyncio.run(_run(_client(), keep_waiting=lambda: False))


class FakeApprovals:
    """ai-agents: the approval pending for ``pending_polls`` reads, then approved."""

    def __init__(self, base_url: str, token: str, **_: Any) -> None:
        self.pending_polls = FakeApprovals.polls
        FakeApprovals.decided = []

    polls = 2
    decided: list[tuple[str, bool]] = []

    def list(self, **_: Any) -> list[dict[str, Any]]:
        if self.pending_polls > 0:
            self.pending_polls -= 1
            return [dict(APPROVAL), {**APPROVAL, "id": "OTHER", "runtime_name": "another"}]
        return []

    def get(self, approval_id: str) -> dict[str, Any]:
        return {**APPROVAL, "status": "approved"}

    def decide(self, approval_id: str, *, approve: bool, note: Any) -> dict[str, Any]:
        FakeApprovals.decided.append((approval_id, approve))
        return {**APPROVAL, "status": "approved" if approve else "rejected"}


def _tux(monkeypatch: pytest.MonkeyPatch) -> CliTux:
    monkeypatch.setattr(approvals_command, "ApprovalsClient", FakeApprovals)
    monkeypatch.setattr(approvals_command, "_resolve_token", lambda token: "TOKEN")
    monkeypatch.setattr(approvals_command, "_resolve_base_url", lambda url: "https://ai-agents.test")
    tux = CliTux(
        agent_url="http://runtime/api/v1/ag-ui/default/",
        server_url="http://runtime",
        agent_id="default",
        cloud_runtime=RUNTIME,
    )
    tux.scripted = True
    tux.APPROVALS_POLL_SECONDS = 0.05
    tux.console = Console(file=io.StringIO(), width=200, soft_wrap=True)
    tux._stderr_console = Console(file=io.StringIO(), width=200, soft_wrap=True)
    return tux


async def _watch(tux: CliTux) -> list[bool]:
    """Watch until the approval is decided; what was awaited, poll by poll."""
    stop = asyncio.Event()
    task = asyncio.create_task(tux._watch_cloud_approvals(stop))
    seen: list[bool] = []
    for _ in range(40):
        await asyncio.sleep(0.03)
        seen.append(bool(tux._approvals_waiting))
        if seen and seen[-1] is False and True in seen:
            break
    stop.set()
    await task
    return seen


def _said(tux: CliTux) -> str:
    out = tux.status_console.file
    assert isinstance(out, io.StringIO)
    return out.getvalue()


def test_a_prompt_line_says_the_approval_and_waits_for_its_decision(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tux = _tux(monkeypatch)

    seen = asyncio.run(_watch(tux))

    said = _said(tux)
    assert "skill:datalayer-memory-add waits on your approval (01M6Y475W1Q8ATP6WHNN00ZX3D)" in said
    assert "loop tool-approvals approve 01M6Y475W1Q8ATP6WHNN00ZX3D" in said
    assert "loop tool-approvals reject 01M6Y475W1Q8ATP6WHNN00ZX3D" in said
    assert "✓ skill:datalayer-memory-add approved" in said
    # Waited on while pending, no longer once decided; another runtime's is not ours.
    assert True in seen and seen[-1] is False
    assert "OTHER" not in said
    # A prompt line decides nothing itself.
    assert FakeApprovals.decided == []


def test_a_person_at_the_terminal_is_asked_and_the_decision_goes_to_ai_agents(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tux = _tux(monkeypatch)
    tux.scripted = False
    monkeypatch.setattr(tux, "_can_ask", lambda: True)
    monkeypatch.setattr(tux, "_ask_approve", lambda: False)

    asyncio.run(_watch(tux))

    assert FakeApprovals.decided == [("01M6Y475W1Q8ATP6WHNN00ZX3D", False)]
    assert "✗ skill:datalayer-memory-add rejected" in _said(tux)
