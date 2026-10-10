# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The host page's tools, on the runtime's side (LOOP D-10).

The page runs `host_<name>` and `host_context`: the agent is handed them as
frontend tools (an AG-UI run's `tools`, an `ExternalToolset`), and a call of
one comes back to the page as a deferred call — `before_tool_execute` never
sees it. So the runtime decides what it shows: a function its rules leave to
the person (no rule naming it, or *Leave it to me*) is not given to the
model, and the page decides the rest by the same rule (`hostFrontendTools`).
"""

from typing import Any, List, Optional

import pytest
from pydantic_ai import Agent
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.tools import DeferredToolRequests, ToolDefinition
from pydantic_ai.toolsets import ExternalToolset

from agent_runtimes.loop.apps.enforcement import AppRulesCapability
from agent_runtimes.loop.apps.host_user import host_tools
from agent_runtimes.types import AppSpec

TICKET = "host_open_ticket"


def app(
    behaviour: Optional[str] = None, context: Optional[List[str]] = None
) -> AppSpec:
    return AppSpec.model_validate(
        {
            "id": "desk",
            "name": "Desk",
            "kind": "chat",
            "agent": "support-agent",
            "deployment": {
                "embedded": {
                    "mode": "bubble",
                    "host": {
                        "context": context or [],
                        "functions": [
                            {
                                "name": "open_ticket",
                                "description": "Open a ticket in the helpdesk",
                                "parameters": {
                                    "type": "object",
                                    "properties": {"title": {"type": "string"}},
                                },
                            }
                        ],
                    },
                }
            },
            "rules": (
                [
                    {
                        "action": "Open a ticket",
                        "applies_to": [TICKET],
                        "behaviour": behaviour,
                    }
                ]
                if behaviour
                else []
            ),
        }
    )


def page_tools(*names: str) -> ExternalToolset:
    """What the page hands the run: its tools, which it runs itself."""
    return ExternalToolset(
        [
            ToolDefinition(
                name=name,
                parameters_json_schema={"type": "object", "properties": {}},
            )
            for name in names
        ]
    )


class Run:
    """A run whose model calls the ticket tool when it is shown it."""

    def __init__(self, spec: AppSpec) -> None:
        self.shown: List[List[str]] = []
        self.executed: List[str] = []
        capability = AppRulesCapability(app=spec, known_mcp_tools=lambda: set())
        original = capability.before_tool_execute

        async def before(ctx: Any, **kwargs: Any) -> Any:
            self.executed.append(kwargs["call"].tool_name)
            return await original(ctx, **kwargs)

        capability.before_tool_execute = before  # type: ignore[method-assign]

        def model(messages: list, info: AgentInfo) -> ModelResponse:
            names = [tool.name for tool in info.function_tools]
            self.shown.append(names)
            if TICKET in names and len(messages) == 1:
                return ModelResponse(parts=[ToolCallPart(TICKET, {"title": "Help"})])
            return ModelResponse(parts=[TextPart("No ticket.")])

        self.agent = Agent(
            FunctionModel(model),
            capabilities=[capability],
            output_type=[str, DeferredToolRequests],
        )

    async def __call__(self, *names: str) -> Any:
        result = await self.agent.run("Open a ticket", toolsets=[page_tools(*names)])
        return result.output


@pytest.mark.asyncio
@pytest.mark.parametrize("behaviour", ["do_it", "if_asked", "ask_first"])
async def test_a_function_a_rule_lets_is_shown_and_handed_to_the_page(
    behaviour: str,
) -> None:
    run = Run(app(behaviour))
    output = await run(TICKET)
    assert run.shown[0] == [TICKET]
    assert isinstance(output, DeferredToolRequests)
    assert [call.tool_name for call in output.calls] == [TICKET]
    # The runtime never runs it, so its own hook never sees the call: the
    # page decides it by the same rule.
    assert run.executed == []


@pytest.mark.asyncio
@pytest.mark.parametrize("behaviour", [None, "leave_to_me"])
async def test_a_function_left_to_the_person_is_never_shown(
    behaviour: Optional[str],
) -> None:
    run = Run(app(behaviour))
    output = await run(TICKET)
    assert run.shown[0] == []
    assert output == "No ticket."


def test_the_rule_naming_a_function_decides_it() -> None:
    for behaviour in ("do_it", "if_asked", "ask_first", "leave_to_me"):
        capability = AppRulesCapability(app=app(behaviour), known_mcp_tools=set)
        decided = capability.decide(TICKET, {"title": "Help"}).decision
        assert decided.behaviour == behaviour
        assert decided.rule == "Open a ticket"
    unruled = AppRulesCapability(app=app(), known_mcp_tools=set)
    assert unruled.decide(TICKET, {}).decision.behaviour == "leave_to_me"


@pytest.mark.asyncio
async def test_what_the_page_passes_is_read_only_when_its_appspec_lists_it() -> None:
    listed = AppRulesCapability(app=app("do_it", ["user"]), known_mcp_tools=set)
    assert listed.given("host_context")
    assert listed.decide("host_context", {}).decision.behaviour == "do_it"
    unlisted = AppRulesCapability(app=app("do_it"), known_mcp_tools=set)
    assert not unlisted.given("host_context")


@pytest.mark.asyncio
async def test_a_host_tool_its_appspec_does_not_name_is_not_shown() -> None:
    run = Run(app("do_it"))
    await run(TICKET, "host_delete_account")
    assert run.shown[0] == [TICKET]
    assert host_tools(app("do_it")) == frozenset({TICKET})
    assert host_tools(app("do_it", ["page"])) == frozenset({TICKET, "host_context"})
