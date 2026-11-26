# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tools the catalogue classes read run without asking (the user, 26 November 2026).

"Yes, approve read-only by default: tools classed read in the catalogue run
without asking; tools that write or act still ask. People can still turn
approval on per tool." A tool nobody classed, and a tool of a server the
catalogue does not vouch for, ask as before; the agent spec's approval
patterns and the person's word in the tool menu win over the default; and
an always-on runtime's scheduled run, with nobody in the conversation,
follows the same rule.
"""

from __future__ import annotations

from typing import Any, Dict, List, cast

import pytest
from pydantic_ai.messages import ToolCallPart

from agent_runtimes.apps.switches import (
    ConversationSwitches,
    Offered,
    conversation_switches,
)
from agent_runtimes.guardrails import read_only_tools
from agent_runtimes.guardrails.mcp_tools import MCPToolsGuardrailCapability
from agent_runtimes.mcp.catalog_mcp_servers import MCP_SERVER_CATALOG
from agent_runtimes.streams import pubsub
from agent_runtimes.types import MCPServer

AGENT = "agent-read-only"

#: What runs: the catalogue's Overture, Google Workspace and GitHub, as the
#: catalogue reaches them, and a server of somebody's mcp.json.
ENABLED: Dict[str, List[str]] = {
    "overture": ["overture_search_places", "overture_place_details"],
    "google-workspace": ["search_gmail_messages", "send_gmail_message"],
    "github": ["get_me"],
    "my-server": ["lookup"],
}


def _configs() -> Dict[str, Any]:
    return {
        "overture": MCP_SERVER_CATALOG["overture"],
        "google-workspace": MCP_SERVER_CATALOG["google-workspace"],
        "github": MCP_SERVER_CATALOG["github"],
        "my-server": MCPServer(
            id="my-server", name="Mine", url="https://example.com/mcp", is_config=True
        ),
    }


class _Manager:
    def __init__(self) -> None:
        self.asked: List[str] = []

    async def request_and_wait(
        self, tool_name: str, tool_args: Dict[str, Any], tool_call_id: Any = None
    ) -> Dict[str, str]:
        del tool_args, tool_call_id
        self.asked.append(tool_name)
        return {"status": "approved", "id": "a-1", "tool_name": tool_name}


@pytest.fixture
def runtime(monkeypatch: pytest.MonkeyPatch) -> Dict[str, Any]:
    """A runtime running ENABLED, its configs by server, no approval given yet."""
    configs = _configs()
    enabled = {server: list(tools) for server, tools in ENABLED.items()}
    monkeypatch.setattr(
        read_only_tools,
        "_running_config",
        lambda server_id, catalogue_id: configs.get(server_id),
    )
    monkeypatch.setattr(
        pubsub, "_get_agent_mcp_enabled_tools_by_server", lambda agent_id: enabled
    )
    pubsub.purge_agent_stream_state(AGENT)
    yield {"configs": configs, "enabled": enabled}
    pubsub.purge_agent_stream_state(AGENT)


def _guardrail(
    enabled: Dict[str, List[str]], requiring: List[str] | None = None
) -> tuple[MCPToolsGuardrailCapability, _Manager]:
    capability = MCPToolsGuardrailCapability(
        agent_id=AGENT, requiring_approval=list(requiring or [])
    )
    manager = _Manager()
    capability._approval_manager = manager
    names = {tool for tools in enabled.values() for tool in tools}
    cast(Any, capability)._known_mcp_tool_names = lambda: names
    cast(Any, capability)._enabled_tool_names = lambda: names
    return capability, manager


async def _call(capability: MCPToolsGuardrailCapability, tool: str) -> None:
    await capability.before_tool_execute(
        cast(Any, None),
        call=ToolCallPart(tool_name=tool, args={}, tool_call_id="c-1"),
        tool_def=cast(Any, None),
        args={},
    )


async def _from_codemode(
    capability: MCPToolsGuardrailCapability, server: str, tool: str
) -> None:
    code = f"from generated.mcp.{server} import {tool}\nawait {tool}()\n"
    await capability.before_tool_execute(
        cast(Any, None),
        call=ToolCallPart(
            tool_name="execute_code", args={"code": code}, tool_call_id="c-2"
        ),
        tool_def=cast(Any, None),
        args={"code": code},
    )


@pytest.mark.asyncio
async def test_a_read_tool_runs_without_an_approval_request(
    runtime: Dict[str, Any],
) -> None:
    capability, manager = _guardrail(runtime["enabled"])
    await _call(capability, "overture_search_places")
    await _call(capability, "search_gmail_messages")
    await _from_codemode(capability, "overture", "overture_place_details")
    assert manager.asked == []
    assert pubsub.get_agent_read_only_mcp_tools_by_server(AGENT) == {
        "overture": ["overture_place_details", "overture_search_places"],
        "google-workspace": ["search_gmail_messages"],
    }


@pytest.mark.asyncio
async def test_a_tool_that_writes_or_acts_asks(runtime: Dict[str, Any]) -> None:
    capability, manager = _guardrail(runtime["enabled"])
    await _call(capability, "send_gmail_message")
    assert manager.asked == ["send_gmail_message"]


@pytest.mark.asyncio
async def test_a_tool_nobody_classed_asks(runtime: Dict[str, Any]) -> None:
    capability, manager = _guardrail(runtime["enabled"])
    await _call(capability, "get_me")  # GitHub's: in the catalogue, not classed
    await _call(capability, "lookup")  # a server of an mcp.json
    assert manager.asked == ["get_me", "lookup"]


@pytest.mark.asyncio
async def test_a_server_that_only_borrows_a_catalogue_id_asks(
    runtime: Dict[str, Any],
) -> None:
    runtime["configs"]["overture"] = MCPServer(
        id="overture", name="Overture", url="https://elsewhere.example/mcp"
    )
    capability, manager = _guardrail(runtime["enabled"])
    await _call(capability, "overture_search_places")
    assert manager.asked == ["overture_search_places"]
    assert "overture" not in pubsub.get_agent_read_only_mcp_tools_by_server(AGENT)


def test_codemode_names_a_catalogue_server_as_python() -> None:
    assert read_only_tools.catalogue_id_of("google_workspace") == "google-workspace"
    assert read_only_tools.catalogue_id_of("overture:0.0.1") == "overture"
    assert read_only_tools.catalogue_id_of("nobody") is None


@pytest.mark.asyncio
async def test_the_spec_requiring_approval_of_a_read_tool_wins(
    runtime: Dict[str, Any],
) -> None:
    from agent_runtimes.capabilities.factory import build_default_choice_guardrails
    from agent_runtimes.guardrails.tool_approvals import (
        ToolApprovalConfig,
        ToolsGuardrailCapability,
    )

    spec = [
        ToolsGuardrailCapability(
            config=ToolApprovalConfig(
                tools_requiring_approval=["overture_search_places"]
            )
        )
    ]
    built = build_default_choice_guardrails(agent_id=AGENT, capabilities=spec)
    mcp = next(c for c in built if isinstance(c, MCPToolsGuardrailCapability))
    assert mcp.requiring_approval == ["overture_search_places"]
    # Called directly, the spec's own capability asks for it.
    assert spec[0]._get_manager().requires_approval("overture_search_places")
    # From codemode, which that capability sees as execute_code, this one does.
    capability, manager = _guardrail(runtime["enabled"], ["overture_search_places"])
    await _from_codemode(capability, "overture", "overture_search_places")
    await _from_codemode(capability, "overture", "overture_place_details")
    assert manager.asked == ["overture_search_places"]


@pytest.mark.asyncio
async def test_the_persons_toggle_wins_both_ways(
    runtime: Dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _no_snapshot(*_: Any) -> None:
        return None

    monkeypatch.setattr(pubsub, "_push_fresh_snapshot", _no_snapshot)
    await pubsub._handle_mcp_server_tool_approve(
        "overture", "overture_search_places", False, AGENT, None, None
    )
    await pubsub._handle_mcp_server_tool_approve(
        "google-workspace", "send_gmail_message", True, AGENT, None, None
    )
    capability, manager = _guardrail(runtime["enabled"])
    await _call(capability, "overture_search_places")
    await _call(capability, "send_gmail_message")
    await _call(capability, "overture_place_details")
    assert manager.asked == ["overture_search_places"]
    # An approval given inline does not undo the person's word in the menu.
    pubsub.mark_agent_mcp_tool_approved(AGENT, "overture_search_places")
    assert "overture_search_places" not in pubsub.get_agent_approved_mcp_tool_names(
        AGENT
    )
    # Approved again in the menu, it runs without asking again.
    await pubsub._handle_mcp_server_tool_approve(
        "overture", "overture_search_places", True, AGENT, None, None
    )
    assert "overture_search_places" in pubsub.get_agent_approved_mcp_tool_names(AGENT)


def test_a_conversation_turns_approval_on_for_a_read_tool(
    runtime: Dict[str, Any],
) -> None:
    offered = Offered(servers={k: frozenset(v) for k, v in runtime["enabled"].items()})
    switched = ConversationSwitches()
    switched.switch(
        {
            "kind": "tool_approval",
            "server": "overture",
            "tool": "overture_search_places",
            "approved": False,
        },
        offered,
    )
    assert switched.as_dict()["mcp_asked"] == {"overture": ["overture_search_places"]}
    with conversation_switches(AGENT, switched):
        approved = pubsub.get_agent_approved_mcp_tool_names(AGENT)
    assert "overture_search_places" not in approved
    # Its server's other reader still runs without asking.
    assert "overture_place_details" in approved
    # Outside that conversation, the default.
    assert "overture_search_places" in pubsub.get_agent_approved_mcp_tool_names(AGENT)


@pytest.mark.asyncio
async def test_a_scheduled_run_with_nobody_there_follows_the_same_rule(
    runtime: Dict[str, Any],
) -> None:
    from agent_runtimes.apps.switches import in_force

    # An always-on runtime's schedule: no conversation, no stream, no toggle.
    assert in_force(AGENT) is None
    assert AGENT not in pubsub._STREAM_SUBSCRIBERS
    capability, manager = _guardrail(runtime["enabled"])
    await _call(capability, "overture_search_places")
    await _call(capability, "send_gmail_message")
    assert manager.asked == ["send_gmail_message"]


def test_a_name_two_servers_share_runs_only_where_both_approve(
    runtime: Dict[str, Any],
) -> None:
    runtime["enabled"]["my-server"] = ["lookup", "overture_search_places"]
    assert "overture_search_places" not in pubsub.get_agent_approved_mcp_tool_names(
        AGENT
    )
    assert "overture_place_details" in pubsub.get_agent_approved_mcp_tool_names(AGENT)


def test_the_status_says_which_tools_run_without_asking(
    runtime: Dict[str, Any],
) -> None:
    approved = pubsub._get_agent_mcp_approved_tools_by_server(AGENT)
    assert approved["overture"] == ["overture_place_details", "overture_search_places"]
    assert approved["google-workspace"] == ["search_gmail_messages"]
    assert approved["github"] == [] and approved["my-server"] == []
