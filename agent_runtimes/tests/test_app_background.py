# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Background work with nobody present only reads, unless a rule says otherwise (LOOP R-16).

A session woken by a schedule has nobody to ask: what acts on the world —
writing, sending, buying, deleting, publishing — is done, or asked of its
maker, only when a rule of the application's own covers it; by default it is
not done, and the agent is told why. Reading goes on; its own computer is its
own; a session somebody opened is not concerned.
"""

from typing import Any

import pytest
from pydantic_ai.messages import ToolCallPart

from agent_runtimes.loop.apps.agent import app_capabilities
from agent_runtimes.loop.apps.enforcement import (
    UNATTENDED,
    AppRuleBlockedError,
    AppRulesCapability,
    Enforced,
)
from agent_runtimes.loop.apps.record import _SESSION, AppRecorder
from agent_runtimes.loop.apps.rules import Decision
from agent_runtimes.loop.apps.saving import SAVE_TOOL
from agent_runtimes.types import AppSpec


def app(**changes: Any) -> AppSpec:
    data: dict = {
        "id": "digest",
        "name": "Digest",
        "kind": "worker",
        "agent": "cog-crawler:0.0.1",
        "connections": [{"server": "google-workspace", "access": "write"}],
        "permissions": {"spaces": [{"space": "sp-notes", "access": "write"}]},
    }
    data.update(changes)
    return AppSpec.model_validate(data)


SEND_ASKS = [
    {"action": "Send a message", "applies_to": ["send"], "behaviour": "ask_first"}
]
WRITE_DOES = [{"action": "Keep a page", "applies_to": ["write"], "behaviour": "do_it"}]


class Harness:
    def __init__(self, spec: AppSpec, *, nobody: bool = True) -> None:
        self.asked: list[tuple[str, Decision]] = []
        self.recorded: list[Enforced] = []

        async def ask(tool: str, args: dict, decision: Decision) -> None:
            self.asked.append((tool, decision))

        self.capability = AppRulesCapability(
            app=spec,
            ask=ask,
            record=self.recorded.append,
            known_mcp_tools=lambda: {
                "google-workspace__send_gmail_message",
                "google-workspace__search_gmail_messages",
            },
            extra_classes={SAVE_TOOL: ["write"]},
            unattended=lambda: nobody,
        )

    async def call(self, tool: str, args: dict | None = None) -> dict:
        arguments = dict(args or {})
        return await self.capability.before_tool_execute(
            None, call=ToolCallPart(tool, arguments), tool_def=None, args=arguments
        )


@pytest.mark.asyncio
async def test_with_nobody_present_it_reads() -> None:
    harness = Harness(app())
    await harness.call("google-workspace__search_gmail_messages", {"query": "x"})
    assert harness.recorded[-1].decision.behaviour == "do_it"


@pytest.mark.asyncio
async def test_with_nobody_present_it_does_not_act_unless_a_rule_says_so() -> None:
    harness = Harness(app())
    with pytest.raises(AppRuleBlockedError, match="Nobody is here"):
        await harness.call("google-workspace__send_gmail_message", {"to": "a@b.c"})
    assert harness.asked == []
    assert harness.recorded[-1].decision.because == UNATTENDED
    # Nor does it save a page without a rule of its own on writing.
    with pytest.raises(AppRuleBlockedError, match="no rule of its own covers it"):
        await harness.call(SAVE_TOOL, {"title": "t", "content": "c"})


@pytest.mark.asyncio
async def test_a_rule_of_its_own_says_otherwise() -> None:
    asks = Harness(app(rules=SEND_ASKS))
    await asks.call("google-workspace__send_gmail_message", {"to": "a@b.c"})
    # Asked of its maker, as the rule says.
    assert [tool for tool, _ in asks.asked] == ["google-workspace__send_gmail_message"]
    keeps = Harness(app(rules=WRITE_DOES))
    await keeps.call(SAVE_TOOL, {"title": "t", "content": "c"})
    # A page is still shown first (R-24): asked, never done unasked.
    assert keeps.asked[-1][1].behaviour == "ask_first"


@pytest.mark.asyncio
async def test_its_own_computer_is_its_own() -> None:
    harness = Harness(app(permissions={"computer": {"shell": True, "files": True}}))
    await harness.call("execute_code", {"code": "print(1)"})
    await harness.call("write_computer_file", {"path": "a.txt", "content": "x"})
    # Code that names a tool that sends is decided on that tool.
    with pytest.raises(AppRuleBlockedError, match="Nobody is here"):
        await harness.call(
            "execute_code",
            {"code": "call_tool('google-workspace__send_gmail_message', {})"},
        )


@pytest.mark.asyncio
async def test_somebody_present_is_asked_as_always() -> None:
    harness = Harness(app(), nobody=False)
    await harness.call("google-workspace__send_gmail_message", {"to": "a@b.c"})
    assert [tool for tool, _ in harness.asked] == [
        "google-workspace__send_gmail_message"
    ]


def test_a_session_woken_by_a_schedule_has_nobody_present() -> None:
    spec = app()
    recorder = AppRecorder(app=spec, woken_by={})
    [rules, *_] = app_capabilities(spec, recorder=recorder)
    token = _SESSION.set("s-person")
    try:
        assert rules.unattended() is False
        recorder.start("s-tick", woken_by={"kind": "schedule"})
        assert rules.unattended() is True
    finally:
        _SESSION.reset(token)
    woken = AppRecorder(app=spec, woken_by={"kind": "schedule"})
    [rules, *_] = app_capabilities(spec, recorder=woken)
    assert rules.unattended() is True
