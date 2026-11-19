# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tools the page runs: what a visitor may call, what a turn is, when a turn stops.

A tool of the page (an AG-UI frontend tool of the run, or of the spec's
frontend tool sets and header) only changes the screen of whoever is looking:
a visitor without an account calls it as anybody does, while a tool of the
server under the same name is still refused. A run that only carries what the
page's tools answered, for the calls the run before asked of it, is part of
the same turn: a visitor's turns count the person's messages, not the
continuations. The same page tool failing twice in a turn ends that turn in a
sentence, for everybody.

Through the real routes, the real AG-UI models and the capability that
enforces an application's rules.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator, Dict, Iterator, List, Optional

import pytest
from ag_ui.core import (
    AssistantMessage,
    FunctionCall,
    RunAgentInput,
    Tool,
    ToolCall,
    ToolMessage,
    UserMessage,
)
from fastapi.testclient import TestClient
from pydantic_ai import Agent, RunContext
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, FunctionModel
from pydantic_ai.models.test import TestModel
from pydantic_ai.tools import ToolDefinition
from pydantic_ai.usage import RunUsage

from agent_runtimes.apps import plugins, principal, visitors
from agent_runtimes.apps.agent import app_capabilities
from agent_runtimes.apps.enforcement import AppRuleBlockedError, AppRulesCapability
from agent_runtimes.apps.loading import load_app
from agent_runtimes.apps.page_tools import (
    FAILED_TWICE,
    leave_run_frontend_tools,
    page_tools_of,
    use_run_frontend_tools,
)
from agent_runtimes.apps.record import AppRecorder, keep_agent_recorder
from agent_runtimes.apps.visitors import use_turn_token
from agent_runtimes.routes import agents
from agent_runtimes.routes.agui import register_agui_agent
from agent_runtimes.tests.test_app_sessions import (
    ASSISTANT,
    Runtime,
    answer_of,
    as_,
    events_of,
    remote,  # noqa: F401  (the fixture, registered under its own name)
    runtime,  # noqa: F401  (the fixture, registered under its own name)
)
from agent_runtimes.tests.test_app_visitors import (  # noqa: F401
    AGUI,
    as_visitor,
    visitors_runtime,
)
from agent_runtimes.types import AppSpec

#: The Shopper's header tool, as the page declares it with every run.
HEADER = Tool(
    name="set_shop_header",
    description="Set the basket shown in the chat's title bar.",
    parameters={
        "type": "object",
        "properties": {"basket": {"type": "object"}},
    },
)


# --- what a visitor may call --------------------------------------------------------


def _ctx() -> RunContext[Any]:
    return RunContext(deps=None, model=TestModel(), usage=RunUsage())


def _call(
    rules: AppRulesCapability, name: str, kind: str = "external"
) -> Dict[str, Any]:
    """A call the model makes, through the capability, in a visitor's turn."""
    args = {"basket": {"value": 2, "label": "$39.98"}}

    async def in_a_visitors_turn() -> Dict[str, Any]:
        use_turn_token("visitor-token")
        return await rules.before_tool_execute(
            _ctx(),
            call=ToolCallPart(name, args),
            tool_def=ToolDefinition(name=name, kind=kind),  # type: ignore[arg-type]
            args=args,
        )

    return asyncio.run(in_a_visitors_turn())


def test_a_visitor_calls_a_tool_the_run_declares_for_its_page() -> None:
    rules = AppRulesCapability(app=load_app(ASSISTANT))
    token = use_run_frontend_tools([HEADER.name])
    try:
        assert _call(rules, "set_shop_header") == {
            "basket": {"value": 2, "label": "$39.98"}
        }
    finally:
        leave_run_frontend_tools(token)


def test_a_tool_of_the_server_under_a_page_tools_name_is_refused() -> None:
    rules = AppRulesCapability(app=load_app(ASSISTANT))
    # Declared by the run, but the tool called runs on the server: the name
    # the model calls exempts nothing.
    token = use_run_frontend_tools([HEADER.name])
    try:
        with pytest.raises(AppRuleBlockedError, match="Without an account"):
            _call(rules, "set_shop_header", kind="function")
    finally:
        leave_run_frontend_tools(token)
    # Run by the page but declared by neither the run nor the spec: refused.
    with pytest.raises(AppRuleBlockedError, match="Without an account"):
        _call(rules, "set_shop_header")


def test_a_visitor_calls_a_tool_of_the_specs_frontend_tool_sets() -> None:
    # The Shopper's agent brings the notices; nothing declared by the run.
    rules = AppRulesCapability(
        app=load_app({**ASSISTANT, "agent": "worker-shopper:0.0.1"})
    )
    assert _call(rules, "show_notice") == {"basket": {"value": 2, "label": "$39.98"}}


def test_the_page_tools_of_a_spec_are_its_frontend_sets_and_its_headers() -> None:
    app = AppSpec.model_validate(
        {
            **ASSISTANT,
            "agent": "worker-shopper:0.0.1",
            "ui": [
                {"plugin": "chat"},
                {"plugin": "shop-header"},
                {"plugin": "page-deck"},
            ],
        }
    )
    tools = page_tools_of(app)
    assert {"show_notice", "set_shop_header", "deck_add_slide"} <= tools
    assert "pap_read" not in tools


# --- what a turn is -----------------------------------------------------------------


class PageModel:
    """A model that calls the page's header tool, then says what it answered."""

    def __init__(self) -> None:
        self.calls = 0

    async def stream(
        self, messages: List[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[Any]:
        last = messages[-1]
        returned = [
            part
            for part in (last.parts if isinstance(last, ModelRequest) else [])
            if isinstance(part, ToolReturnPart)
        ]
        asked = any(
            isinstance(part, UserPromptPart)
            for part in (last.parts if isinstance(last, ModelRequest) else [])
        )
        if returned and returned[-1].outcome != "failed" and not asked:
            yield f"The page said {returned[-1].content}"
            return
        self.calls += 1
        yield {
            0: DeltaToolCall(
                name=HEADER.name,
                json_args=json.dumps({"basket": {"value": 2}}),
                tool_call_id=f"call-{self.calls}",
            )
        }

    def __call__(self, messages: List[ModelMessage], info: AgentInfo) -> Any:
        raise AssertionError("The chat streams.")


def make_page_agent(runtime: Runtime, instance: Dict[str, Any]) -> PageModel:
    """The example's agent, as `Runtime.make` makes it, on a model that calls the page."""
    from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter
    from agent_runtimes.transports import AGUITransport

    agent_id = "notes-assistant"
    app = load_app(ASSISTANT)
    plugins.register_app(app)
    recorder = AppRecorder(
        app=app, app_uid="", deployment_uid="", version=0, send=runtime.send
    )
    model = PageModel()
    agent = Agent(
        FunctionModel(model, stream_function=model.stream),
        capabilities=app_capabilities(app, recorder=recorder, agent_id=agent_id),
    )
    register_agui_agent(
        agent_id,
        AGUITransport(PydanticAIAdapter(agent, agent_id=agent_id), agent_id=agent_id),
    )
    agents._agentspecs[agent_id] = {"app_spec": ASSISTANT, "app_instance": instance}
    keep_agent_recorder(agent_id, recorder)
    runtime.models[agent_id] = model  # type: ignore[assignment]
    return model


def run_of(thread: str, run: str, messages: List[Any]) -> Dict[str, Any]:
    """An AG-UI run as the chat sends it, the page's header tool declared."""
    return RunAgentInput(
        thread_id=thread,
        run_id=run,
        state=None,
        messages=messages,
        tools=[HEADER],
        context=[],
        forwarded_props=None,
    ).model_dump(mode="json", by_alias=True, exclude_none=True)


def asked_of_the_page(events: List[Dict[str, Any]]) -> List[str]:
    return [
        str(event["toolCallId"])
        for event in events
        if event.get("type") == "TOOL_CALL_START"
        and event.get("toolCallName") == HEADER.name
    ]


def answered(call_id: str, error: Optional[str] = None) -> List[Any]:
    """The page's continuation: its call, and what its tool answered."""
    return [
        AssistantMessage(
            id=f"a-{call_id}",
            tool_calls=[
                ToolCall(
                    id=call_id,
                    function=FunctionCall(
                        name=HEADER.name, arguments=json.dumps({"basket": {"value": 2}})
                    ),
                )
            ],
        ),
        ToolMessage(
            id=f"t-{call_id}",
            tool_call_id=call_id,
            content=json.dumps({"set": ["basket"]}) if error is None else "",
            error=error,
        ),
    ]


def test_what_the_page_answers_is_part_of_the_visitors_turn(
    runtime: Runtime, visitors_runtime: TestClient
) -> None:
    make_page_agent(runtime, {"visitor_app": "notes-assistant"})
    ada = as_visitor("tab-ada-0001")
    thread = "thread-basket"
    asked = UserMessage(id="u1", content="Put a pan and a knife in a basket.")
    first = events_of(
        visitors_runtime.post(AGUI, headers=ada, json=run_of(thread, "r1", [asked]))
    )  # 1 of 3
    (call,) = asked_of_the_page(first)
    # The page answers its tool: the same turn, which takes none.
    history = [asked, *answered(call)]
    said = events_of(
        visitors_runtime.post(AGUI, headers=ada, json=run_of(thread, "r2", history))
    )
    assert answer_of(said) == "The page said {'set': ['basket']}"
    # What the page answered once is not answered again for free.
    events_of(
        visitors_runtime.post(AGUI, headers=ada, json=run_of(thread, "r3", history))
    )  # 2 of 3
    more = [*history, UserMessage(id="u2", content="And a fork.")]
    events_of(
        visitors_runtime.post(AGUI, headers=ada, json=run_of(thread, "r4", more))
    )  # 3 of 3
    refused = visitors_runtime.post(
        AGUI,
        headers=ada,
        json=run_of(thread, "r5", [*more, UserMessage(id="u3", content="More")]),
    )
    assert refused.status_code == 429


def test_a_person_s_message_takes_a_turn_whatever_else_the_run_carries(
    runtime: Runtime, visitors_runtime: TestClient
) -> None:
    make_page_agent(runtime, {"visitor_app": "notes-assistant"})
    ada = as_visitor("tab-ada-0001")
    thread = "thread-carries"
    asked = UserMessage(id="u1", content="A basket, please.")
    (first,) = asked_of_the_page(
        events_of(
            visitors_runtime.post(AGUI, headers=ada, json=run_of(thread, "r1", [asked]))
        )
    )  # 1 of 3
    # What the page answered, and a message after it: a turn.
    with_a_message = [
        asked,
        *answered(first),
        UserMessage(id="u2", content="And a fork."),
    ]
    (second,) = asked_of_the_page(
        events_of(
            visitors_runtime.post(
                AGUI, headers=ada, json=run_of(thread, "r2", with_a_message)
            )
        )
    )  # 2 of 3
    # Results for a call the run before never made: a turn.
    events_of(
        visitors_runtime.post(
            AGUI,
            headers=ada,
            json=run_of(thread, "r3", [*with_a_message, *answered("call-never-made")]),
        )
    )  # 3 of 3
    # The call of r2 is no longer the last run's: a turn, and none is left.
    refused = visitors_runtime.post(
        AGUI,
        headers=ada,
        json=run_of(thread, "r4", [*with_a_message, *answered(second)]),
    )
    assert refused.status_code == 429


# --- when a turn stops --------------------------------------------------------------


def _fails_twice(client: TestClient, headers: Dict[str, str], thread: str) -> None:
    asked = UserMessage(id="u1", content="Show the basket in the title bar.")
    (first,) = asked_of_the_page(
        events_of(
            client.post(AGUI, headers=headers, json=run_of(thread, "r1", [asked]))
        )
    )
    failed_once = [asked, *answered(first, error="Nothing to set: name basket.")]
    # Failed once: the agent is run again, and calls it again.
    (second,) = asked_of_the_page(
        events_of(
            client.post(AGUI, headers=headers, json=run_of(thread, "r2", failed_once))
        )
    )
    # Failed twice: the turn ends in a sentence, and nothing is run again.
    ended = events_of(
        client.post(
            AGUI,
            headers=headers,
            json=run_of(
                thread,
                "r3",
                [*failed_once, *answered(second, error="Nothing to set: name basket.")],
            ),
        )
    )
    assert asked_of_the_page(ended) == []
    assert answer_of(ended) == FAILED_TWICE.format(
        tool=HEADER.name, error="Nothing to set: name basket."
    )
    assert [event["type"] for event in ended][0] == "RUN_STARTED"
    assert [event["type"] for event in ended][-1] == "RUN_FINISHED"


def test_the_same_page_tool_failing_twice_ends_a_visitors_turn(
    runtime: Runtime, visitors_runtime: TestClient
) -> None:
    model = make_page_agent(runtime, {"visitor_app": "notes-assistant"})
    _fails_twice(visitors_runtime, as_visitor("tab-ada-0001"), "thread-fails-v")
    assert model.calls == 2


def test_the_same_page_tool_failing_twice_ends_a_signed_in_turn(
    runtime: Runtime, remote: TestClient
) -> None:
    async def token(deployment: str, bearer: str) -> Dict[str, Any]:
        return {"access_token": "p-token", "expires_in": 3600, "principal_uid": "p-7"}

    # A deployment's session, run as its principal for the person who opened it.
    principal.use_asker(token)
    principal.forget_principal_token("dep-1")
    model = make_page_agent(
        runtime, {"app_uid": "app-1", "deployment_uid": "dep-1", "version": 2}
    )
    _fails_twice(remote, as_("ada"), "thread-fails-p")
    assert model.calls == 2


@pytest.fixture(autouse=True)
def _no_turns_left_over() -> Iterator[None]:
    visitors.forget_turns()
    yield
    visitors.forget_turns()
