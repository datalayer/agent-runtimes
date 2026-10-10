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
from pydantic_ai import Agent
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.tools import ToolDefinition

from agent_runtimes.loop.apps.enforcement import (
    NO_SHELL,
    AppRuleBlockedError,
    AppRulesCapability,
    Enforced,
)
from agent_runtimes.loop.apps.rules import Decision, classes_of, gives
from agent_runtimes.specs.actions import SERVER_ACTIONS
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
async def test_what_the_session_says_of_a_tool_cannot_grant_a_connection() -> None:
    told = Harness(
        TRIAGE,
        extra_classes={
            "tavily_search": ["read"],
            "google-workspace__search_drive_files": ["read"],
            "google-workspace__send_gmail_message": ["read"],
        },
    )
    # Not connected to Tavily: still not reached.
    with pytest.raises(AppRuleBlockedError, match="not connected"):
        await told.call("tavily_search", {})
    # Left out by the connection's `only`: still left out.
    with pytest.raises(AppRuleBlockedError, match="leaves"):
        await told.call("google-workspace__search_drive_files", {})
    # Classed by the catalogue as sending: still asks.
    await told.call("google-workspace__send_gmail_message", {})
    assert told.asked and told.asked[-1][1].behaviour == "ask_first"


@pytest.mark.asyncio
async def test_do_it_if_asked_asks_without_an_approval_given_in_advance() -> None:
    granted = app(
        rules=[{"action": "Send", "applies_to": ["send"], "behaviour": "if_asked"}]
    )
    harness = Harness(granted)
    await harness.call("google-workspace__send_gmail_message", {})
    assert harness.asked and harness.asked[0][1].behaviour == "if_asked"


# --- what a connection gives (LOOP U-15) -----------------------------------------


def _defs(*names: str) -> list[ToolDefinition]:
    return [
        ToolDefinition(name=name, parameters_json_schema={"type": "object"})
        for name in names
    ]


def test_a_read_connection_gives_no_tool_that_writes_anywhere_in_the_catalogue() -> (
    None
):
    # Every tool of every classed server, at both levels: read gives only
    # what only reads; read and write gives everything the connection reaches.
    for server, actions in SERVER_ACTIONS.items():
        reading = app(connections=[{"server": server, "access": "read"}])
        writing = app(connections=[{"server": server, "access": "write"}])
        for name in actions.tools:
            ref = f"{server}.{name}"
            classes = classes_of(ref)
            assert gives(reading, ref) == (
                bool(classes) and set(classes) == {"read"}
            ), ref
            assert gives(writing, ref), ref


def test_a_tool_nobody_classed_is_not_given_by_a_read_connection() -> None:
    # Unknown is taken to write: a read connection to a server nobody
    # classed gives nothing, one that reads and writes gives it to decide.
    assert not gives(
        app(connections=[{"server": "github", "access": "read"}]), "github.create_issue"
    )
    assert gives(
        app(connections=[{"server": "github", "access": "write"}]),
        "github.create_issue",
    )


def test_nothing_is_given_without_a_connection_nor_outside_only() -> None:
    assert not gives(TRIAGE, "tavily.tavily_search")
    assert not gives(TRIAGE, "google-workspace.search_drive_files")
    assert gives(TRIAGE, "google-workspace.send_gmail_message")
    with pytest.raises(ValueError, match="not a tool of a server"):
        gives(TRIAGE, "runtime-echo")


@pytest.mark.asyncio
async def test_the_agent_is_given_only_what_its_connections_give() -> None:
    reading = app(connections=[{"server": "google-workspace", "access": "read"}])
    capability = AppRulesCapability(
        app=reading, known_mcp_tools=lambda: {"tavily_search"}
    )
    offered = _defs(
        "google-workspace__search_gmail_messages",
        "google-workspace__send_gmail_message",
        "google-workspace__get_gmail_attachment_content",
        "google-workspace__a_tool_nobody_classed",
        "tavily_search",
        "execute_code",
        "call_tool",
        "search_tools",
        "runtime_echo",
    )
    given = await capability.prepare_tools(None, offered)
    # Its shell is off: no tool that runs code is given (LOOP R-23).
    assert [tool.name for tool in given] == [
        "google-workspace__search_gmail_messages",
        "call_tool",
        "search_tools",
        "runtime_echo",
    ]


@pytest.mark.asyncio
async def test_a_model_is_never_shown_a_tool_its_connection_does_not_give() -> None:
    seen: list[str] = []

    def model(messages: list, info: AgentInfo) -> ModelResponse:
        seen.extend(tool.name for tool in info.function_tools)
        return ModelResponse(parts=[TextPart("done")])

    agent = Agent(
        FunctionModel(model),
        capabilities=[
            AppRulesCapability(
                app=app(connections=[{"server": "tavily", "access": "read"}]),
                known_mcp_tools=lambda: set(),
            )
        ],
    )

    @agent.tool_plain(name="tavily__tavily_search")
    def search() -> str:
        return "found"

    @agent.tool_plain(name="slack__slack_post_message")
    def send() -> str:
        return "sent"

    await agent.run("hello")
    assert seen == ["tavily__tavily_search"]
