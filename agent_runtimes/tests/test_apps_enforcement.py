# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's rules, enforced before every tool call (LOOP R-05).

The capability runs before each tool the agent calls: it does the reading,
asks the person before what its rules say to ask about, and refuses what is
left to them — whatever form the call takes: a tool by its runtime name,
`call_tool`, a catalogue tool, or code that names tools.
"""

from typing import Any

import pytest
from pydantic_ai.messages import ToolCallPart

from agent_runtimes.loop.apps.enforcement import (
    NO_SHELL,
    AppRuleBlockedError,
    AppRulesCapability,
    Enforced,
)
from agent_runtimes.loop.apps.rules import Decision
from agent_runtimes.specs.apps import APP_CATALOGUE
from agent_runtimes.types import AppSpec

TRIAGE = APP_CATALOGUE["inbox-triage"]


def app(**changes: Any) -> AppSpec:
    data: dict = {
        "id": "desk",
        "name": "Desk",
        "kind": "chat",
        "agent": "cog-crawler:0.0.1",
        "connections": [{"server": "google-workspace", "access": "write"}],
    }
    data.update(changes)
    return AppSpec.model_validate(data)


class Harness:
    """A capability with a person who answers, and a record of what happened."""

    def __init__(self, spec: AppSpec, *, approve: bool = True, **options: Any) -> None:
        self.asked: list[tuple[str, Decision]] = []
        self.recorded: list[Enforced] = []
        self.approve = approve

        async def ask(tool: str, args: dict, decision: Decision) -> None:
            self.asked.append((tool, decision))
            if not self.approve:
                raise AppRuleBlockedError(decision)

        self.capability = AppRulesCapability(
            app=spec,
            ask=ask,
            record=self.recorded.append,
            known_mcp_tools=lambda: {
                "google-workspace__send_gmail_message",
                "tavily_search",
            },
            **options,
        )

    async def call(self, tool: str, args: dict | None = None) -> dict:
        arguments = dict(args or {})
        return await self.capability.before_tool_execute(
            None,
            call=ToolCallPart(tool, arguments),
            tool_def=None,
            args=arguments,
        )


@pytest.mark.asyncio
async def test_reading_is_done_without_asking() -> None:
    harness = Harness(TRIAGE)
    args = {"query": "is:unread"}
    assert await harness.call("google-workspace__search_gmail_messages", args) == args
    assert harness.asked == []
    assert harness.recorded[0].decision.behaviour == "do_it"


@pytest.mark.asyncio
async def test_sending_asks_the_person_first_and_goes_on_when_they_approve() -> None:
    harness = Harness(TRIAGE)
    await harness.call(
        "google-workspace__send_gmail_message", {"to": "marta@example.com"}
    )
    assert [(tool, decision.rule) for tool, decision in harness.asked] == [
        ("google-workspace__send_gmail_message", "Send a message")
    ]


@pytest.mark.asyncio
async def test_what_the_person_declines_does_not_run() -> None:
    harness = Harness(TRIAGE, approve=False)
    with pytest.raises(AppRuleBlockedError):
        await harness.call("google-workspace__send_gmail_message", {})


@pytest.mark.asyncio
async def test_what_is_left_to_the_person_is_refused_with_its_rule() -> None:
    harness = Harness(TRIAGE)
    with pytest.raises(AppRuleBlockedError, match="Delete anything"):
        await harness.call(
            "google-workspace__modify_gmail_message_labels",
            {"add_label_ids": ["TRASH"]},
        )
    # The same tool, archiving: done.
    await harness.call(
        "google-workspace__modify_gmail_message_labels", {"remove_label_ids": ["INBOX"]}
    )
    assert harness.asked == []
    assert [entry.decision.behaviour for entry in harness.recorded] == [
        "leave_to_me",
        "do_it",
    ]


@pytest.mark.asyncio
async def test_a_bare_tool_name_is_found_on_the_server_that_serves_it() -> None:
    harness = Harness(TRIAGE)
    await harness.call("search_gmail_messages", {})
    assert (
        harness.recorded[-1].decision.tool == "google-workspace.search_gmail_messages"
    )
    # A tool of a server the application is not connected to is not reached.
    with pytest.raises(AppRuleBlockedError, match="not connected"):
        await harness.call("tavily_search", {"query": "x"})


@pytest.mark.asyncio
async def test_call_tool_is_decided_on_the_tool_it_calls_and_its_arguments() -> None:
    harness = Harness(TRIAGE)
    await harness.call(
        "call_tool",
        {"tool_name": "search_gmail_messages", "arguments": {"query": "x"}},
    )
    assert harness.recorded[-1].decision.behaviour == "do_it"
    with pytest.raises(AppRuleBlockedError, match="Delete anything"):
        await harness.call(
            "call_tool",
            {
                "tool_name": "google-workspace__modify_gmail_message_labels",
                "arguments": {"add_label_ids": ["SPAM"]},
            },
        )
    # Without its arguments, a tool is decided for the worst it can do.
    with pytest.raises(AppRuleBlockedError):
        await harness.call("call_tool", {"tool_name": "modify_gmail_message_labels"})


@pytest.mark.asyncio
async def test_code_runs_only_with_the_shell_on() -> None:
    harness = Harness(TRIAGE)
    with pytest.raises(AppRuleBlockedError, match="shell is off"):
        await harness.call("execute_code", {"code": "print(1)"})
    assert harness.recorded[-1].decision.because == NO_SHELL


@pytest.mark.asyncio
async def test_code_is_decided_on_every_tool_it_names_for_the_worst_each_can_do() -> (
    None
):
    shell = {"computer": {"shell": True}}
    reader = Harness(app(permissions=shell))
    # Code that names no tool runs: the shell is on.
    await reader.call("execute_code", {"code": "print(1)"})
    assert reader.recorded[-1].decision.behaviour == "do_it"
    # Code spells a server's name as Python does.
    code = (
        "from generated.mcp.google_workspace import search_gmail_messages\n"
        "search_gmail_messages(query='x')"
    )
    await reader.call("execute_code", {"code": code})
    assert reader.recorded[-1].decision.behaviour == "do_it"
    # Labelling in code can trash: without the arguments, it asks first.
    labels = "call_tool('google-workspace__modify_gmail_message_labels', {})"
    await reader.call("execute_code", {"code": labels})
    assert reader.asked[-1][1].tool == "google-workspace.modify_gmail_message_labels"


@pytest.mark.asyncio
async def test_a_catalogue_tool_is_known_by_its_id_or_its_method() -> None:
    harness = Harness(
        app(
            rules=[
                {"action": "Send", "applies_to": ["send"], "behaviour": "leave_to_me"}
            ]
        )
    )
    with pytest.raises(AppRuleBlockedError, match="Send"):
        await harness.call("runtime-send-mail", {})
    with pytest.raises(AppRuleBlockedError, match="Send"):
        await harness.call("runtime_send_mail", {})
    await harness.call("runtime_echo", {"text": "hi"})
    assert harness.recorded[-1].decision.behaviour == "do_it"


@pytest.mark.asyncio
async def test_looking_for_tools_is_reading() -> None:
    harness = Harness(TRIAGE)
    for tool in ("search_tools", "list_tool_names", "load_skill"):
        await harness.call(tool, {"query": "mail"})
    assert {entry.decision.behaviour for entry in harness.recorded} == {"do_it"}


@pytest.mark.asyncio
async def test_a_tool_nobody_classed_is_left_to_the_person_unless_the_session_says() -> (
    None
):
    harness = Harness(TRIAGE)
    with pytest.raises(AppRuleBlockedError, match="Nobody has said"):
        await harness.call("mystery_tool", {})
    told = Harness(TRIAGE, extra_classes={"mystery_tool": ["read"]})
    await told.call("mystery_tool", {})
    assert told.recorded[-1].decision.behaviour == "do_it"


@pytest.mark.asyncio
async def test_do_it_if_asked_asks_until_grants_are_recorded() -> None:
    granted = app(
        rules=[{"action": "Send", "applies_to": ["send"], "behaviour": "if_asked"}]
    )
    harness = Harness(granted)
    await harness.call("google-workspace__send_gmail_message", {})
    assert harness.asked and harness.asked[0][1].behaviour == "if_asked"
