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
from typing import Any, AsyncIterator, Dict, Iterator, List, Optional, Tuple

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
    ROUNDS_A_MESSAGE,
    TOO_MANY_ROUNDS,
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
            tool_def=ToolDefinition(name=name, kind=kind),
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


# --- what the model sees of its turn ------------------------------------------------

QUOTE = "quote_basket"

#: The Shopper's own quote, a tool of the server that only reads.
SHOPPER = {
    **ASSISTANT,
    "tools": [
        {
            "name": QUOTE,
            "description": "Price the basket at the shop.",
            "does": ["read"],
        }
    ],
}


class ShopperModel:
    """The Shopper as it looped: it prices the basket whenever it cannot see
    its quote, shows it in the title bar, and answers once it sees both.
    """

    def __init__(self) -> None:
        self.quotes = 0
        self.headers = 0

    async def stream(
        self, messages: List[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[Any]:
        def returns(message: ModelMessage) -> List[str]:
            return [
                part.tool_name
                for part in (message.parts if isinstance(message, ModelRequest) else [])
                if isinstance(part, ToolReturnPart)
            ]

        last = returns(messages[-1])
        if QUOTE in last and HEADER.name not in last:
            self.headers += 1
            yield {
                0: DeltaToolCall(
                    name=HEADER.name,
                    json_args=json.dumps({"basket": {"value": 2, "label": "$39.98"}}),
                    tool_call_id=f"header-{self.headers}",
                )
            }
            return
        if any(QUOTE in returns(message) for message in messages):
            yield "The basket: a pan and a knife, $39.98."
            return
        self.quotes += 1
        yield {
            0: DeltaToolCall(
                name=QUOTE,
                json_args=json.dumps({"items": ["pan", "knife"]}),
                tool_call_id=f"quote-{self.quotes}",
            )
        }

    def __call__(self, messages: List[ModelMessage], info: AgentInfo) -> Any:
        raise AssertionError("The chat streams.")


def make_shopper(runtime: Runtime) -> ShopperModel:
    """The example's agent with the Shopper's quote, on the model that looped."""
    from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter
    from agent_runtimes.transports import AGUITransport

    agent_id = "notes-assistant"
    app = load_app(SHOPPER)
    plugins.register_app(app)
    recorder = AppRecorder(
        app=app, app_uid="", deployment_uid="", version=0, send=runtime.send
    )
    model = ShopperModel()

    async def quote_basket(items: List[str]) -> Dict[str, Any]:
        """Price the basket at the shop."""
        return {"items": items, "total": "$39.98"}

    agent = Agent(
        FunctionModel(model, stream_function=model.stream),
        tools=[quote_basket],
        capabilities=app_capabilities(app, recorder=recorder, agent_id=agent_id),
    )
    register_agui_agent(
        agent_id,
        AGUITransport(PydanticAIAdapter(agent, agent_id=agent_id), agent_id=agent_id),
    )
    agents._agentspecs[agent_id] = {
        "app_spec": SHOPPER,
        "app_instance": {"visitor_app": "notes-assistant"},
    }
    keep_agent_recorder(agent_id, recorder)
    runtime.models[agent_id] = model  # type: ignore[assignment]
    return model


def server_calls(events: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """The calls of the server's tools a run made, as the chat keeps them."""
    calls: Dict[str, Dict[str, str]] = {}
    for event in events:
        kind, call = event.get("type"), str(event.get("toolCallId") or "")
        if kind == "TOOL_CALL_START" and event.get("toolCallName") != HEADER.name:
            calls[call] = {"id": call, "name": str(event["toolCallName"]), "args": ""}
        elif kind == "TOOL_CALL_ARGS" and call in calls:
            calls[call]["args"] += str(event.get("delta") or "")
        elif kind == "TOOL_CALL_RESULT" and call in calls:
            calls[call]["content"] = str(event.get("content"))
    return list(calls.values())


def continued(
    header: str, done: List[Dict[str, str]], content: Optional[str] = None
) -> List[Any]:
    """The continuation the chat sends: the run's calls, the server's and the
    page's, then their results, the server's as the run gave them.
    """
    page = answered(header)
    return [
        AssistantMessage(
            id=f"a-{header}",
            tool_calls=[
                *(
                    ToolCall(
                        id=call["id"],
                        function=FunctionCall(
                            name=call["name"], arguments=call["args"]
                        ),
                    )
                    for call in done
                ),
                *page[0].tool_calls,
            ],
        ),
        *(
            ToolMessage(
                id=f"t-{call['id']}",
                tool_call_id=call["id"],
                content=call["content"] if content is None else content,
            )
            for call in done
        ),
        page[1],
    ]


def _first_run(client: TestClient, thread: str) -> Tuple[Any, str, List[Any]]:
    asked = UserMessage(id="u1", content="Put a pan and a knife in a basket.")
    events = events_of(
        client.post(
            AGUI,
            headers=as_visitor("tab-ada-0001"),
            json=run_of(thread, "r1", [asked]),
        )
    )
    (header,) = asked_of_the_page(events)
    return asked, header, server_calls(events)


def test_a_continuation_without_the_runs_server_calls_loops(
    runtime: Runtime, visitors_runtime: TestClient
) -> None:
    model = make_shopper(runtime)
    asked, header, done = _first_run(visitors_runtime, "thread-loops")
    assert [call["name"] for call in done] == [QUOTE]
    # What the chat sent before: the page's call alone. The model cannot see
    # its quote, prices again, and asks the page again.
    again = events_of(
        visitors_runtime.post(
            AGUI,
            headers=as_visitor("tab-ada-0001"),
            json=run_of("thread-loops", "r2", [asked, *answered(header)]),
        )
    )
    assert asked_of_the_page(again) == ["header-2"]
    assert (model.quotes, model.headers) == (2, 2)


def test_a_continuation_with_the_runs_server_calls_answers_in_the_same_turn(
    runtime: Runtime, visitors_runtime: TestClient
) -> None:
    model = make_shopper(runtime)
    asked, header, done = _first_run(visitors_runtime, "thread-sees")
    said = events_of(
        visitors_runtime.post(
            AGUI,
            headers=as_visitor("tab-ada-0001"),
            json=run_of("thread-sees", "r2", [asked, *continued(header, done)]),
        )
    )
    assert asked_of_the_page(said) == []
    assert answer_of(said) == "The basket: a pan and a knife, $39.98."
    assert (model.quotes, model.headers) == (1, 1)
    # The same turn: one taken, for the message.
    assert visitors.TURNS._taken["tab-ada-0001"] == 1


def test_server_results_the_runtime_did_not_give_take_a_turn(
    runtime: Runtime, visitors_runtime: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(visitors.TURNS_ENV, "10")
    make_shopper(runtime)
    asked, header, done = _first_run(visitors_runtime, "thread-changed")
    # A server result changed on the way back: a turn.
    events_of(
        visitors_runtime.post(
            AGUI,
            headers=as_visitor("tab-ada-0001"),
            json=run_of(
                "thread-changed",
                "r2",
                [asked, *continued(header, done, content='{"total": "$0.00"}')],
            ),
        )
    )
    assert visitors.TURNS._taken["tab-ada-0001"] == 2
    asked, header, _ = _first_run(visitors_runtime, "thread-made-up")
    # A server call the run never made: a turn.
    made_up = [{"id": "quote-made-up", "name": QUOTE, "args": "{}", "content": "{}"}]
    events_of(
        visitors_runtime.post(
            AGUI,
            headers=as_visitor("tab-ada-0001"),
            json=run_of("thread-made-up", "r2", [asked, *continued(header, made_up)]),
        )
    )
    assert visitors.TURNS._taken["tab-ada-0001"] == 4


# --- how many rounds of the page's tools a message takes ---------------------------


class LoopingModel:
    """A model that calls the page's header tool again whatever it answered."""

    def __init__(self) -> None:
        self.calls = 0

    async def stream(
        self, messages: List[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[Any]:
        self.calls += 1
        yield {
            0: DeltaToolCall(
                name=HEADER.name,
                json_args=json.dumps({"basket": {"value": self.calls}}),
                tool_call_id=f"loop-{self.calls}",
            )
        }

    def __call__(self, messages: List[ModelMessage], info: AgentInfo) -> Any:
        raise AssertionError("The chat streams.")


DECK_CREATE = Tool(
    name="deck_create",
    description="Start a new deck in the page under a title.",
    parameters={"type": "object", "properties": {"title": {"type": "string"}}},
)
DECK_ADD_SLIDES = Tool(
    name="deck_add_slides",
    description="Add several slides at once, in order.",
    parameters={"type": "object", "properties": {"slides": {"type": "array"}}},
)


class DeckModel:
    """The Marketer laying a ten-slide deck out: the deck, then its outline
    in one call, then a word on what it holds.
    """

    def __init__(self) -> None:
        self.calls: List[str] = []

    async def stream(
        self, messages: List[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[Any]:
        done = [
            part.tool_name
            for message in messages
            for part in (message.parts if isinstance(message, ModelRequest) else [])
            if isinstance(part, ToolReturnPart)
        ]
        if "deck_add_slides" in done:
            yield "The deck holds ten slides; Present shows it full screen."
            return
        name, args = (
            (
                "deck_add_slides",
                {
                    "slides": [
                        {"type": "section", "title": f"Part {n}"} for n in range(1, 11)
                    ]
                },
            )
            if "deck_create" in done
            else ("deck_create", {"title": "Spring launch"})
        )
        self.calls.append(name)
        yield {
            0: DeltaToolCall(
                name=name, json_args=json.dumps(args), tool_call_id=f"{name}-1"
            )
        }

    def __call__(self, messages: List[ModelMessage], info: AgentInfo) -> Any:
        raise AssertionError("The chat streams.")


def make_agent_on(runtime: Runtime, model: Any, instance: Dict[str, Any]) -> Any:
    """The example's agent, as `make_page_agent` makes it, on another model."""
    from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter
    from agent_runtimes.transports import AGUITransport

    agent_id = "notes-assistant"
    app = load_app(ASSISTANT)
    plugins.register_app(app)
    recorder = AppRecorder(
        app=app, app_uid="", deployment_uid="", version=0, send=runtime.send
    )
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
    runtime.models[agent_id] = model
    return model


def page_answers(events: List[Dict[str, Any]], tools: List[str]) -> List[Any]:
    """The continuation the chat sends for the page's calls of a run."""
    calls = {
        str(event["toolCallId"]): {"name": str(event["toolCallName"]), "args": ""}
        for event in events
        if event.get("type") == "TOOL_CALL_START" and event.get("toolCallName") in tools
    }
    for event in events:
        if event.get("type") == "TOOL_CALL_ARGS" and event.get("toolCallId") in calls:
            calls[str(event["toolCallId"])]["args"] += str(event.get("delta") or "")
    return [
        AssistantMessage(
            id=f"a-{'-'.join(calls)}",
            tool_calls=[
                ToolCall(
                    id=call_id,
                    function=FunctionCall(name=call["name"], arguments=call["args"]),
                )
                for call_id, call in calls.items()
            ],
        ),
        *(
            ToolMessage(id=f"t-{call_id}", tool_call_id=call_id, content='{"ok": true}')
            for call_id in calls
        ),
    ]


def test_a_ten_slide_deck_laid_out_in_one_call_takes_two_rounds(
    runtime: Runtime, visitors_runtime: TestClient
) -> None:
    model = make_agent_on(runtime, DeckModel(), {"visitor_app": "notes-assistant"})
    tools = [DECK_CREATE, DECK_ADD_SLIDES]
    names = [tool.name for tool in tools]

    def run(run_id: str, history: List[Any]) -> List[Dict[str, Any]]:
        body = {
            **run_of("thread-deck", run_id, history),
            "tools": [tool.model_dump(mode="json", by_alias=True) for tool in tools],
        }
        return events_of(
            visitors_runtime.post(AGUI, headers=as_visitor("tab-ada-0001"), json=body)
        )

    history: List[Any] = [UserMessage(id="u1", content="A deck of our spring launch.")]
    events = run("r1", history)
    rounds = 0
    while not answer_of(events):
        rounds += 1
        history = [*history, *page_answers(events, names)]
        events = run(f"r{rounds + 1}", history)
    assert rounds == 2
    assert model.calls == ["deck_create", "deck_add_slides"]
    assert (
        answer_of(events) == "The deck holds ten slides; Present shows it full screen."
    )
    assert visitors.TURNS._taken["tab-ada-0001"] == 1


def _rounds(
    client: TestClient, headers: Dict[str, str], thread: str
) -> List[List[Dict[str, Any]]]:
    history: List[Any] = [UserMessage(id="u1", content="Show the basket.")]
    events = events_of(
        client.post(AGUI, headers=headers, json=run_of(thread, "r1", history))
    )
    said = [events]
    for round_ in range(1, ROUNDS_A_MESSAGE + 2):
        history = [*history, *page_answers(events, [HEADER.name])]
        events = events_of(
            client.post(
                AGUI, headers=headers, json=run_of(thread, f"r{round_ + 1}", history)
            )
        )
        said.append(events)
    return said


def test_a_message_takes_ten_rounds_of_page_tools() -> None:
    assert ROUNDS_A_MESSAGE == 10
    assert "in 10 rounds" in TOO_MANY_ROUNDS.format(rounds=ROUNDS_A_MESSAGE, tool="t")


def test_the_eleventh_round_of_page_tools_ends_a_visitors_turn(
    runtime: Runtime, visitors_runtime: TestClient
) -> None:
    model = make_agent_on(runtime, LoopingModel(), {"visitor_app": "notes-assistant"})
    said = _rounds(visitors_runtime, as_visitor("tab-ada-0001"), "thread-rounds-v")
    # The person's run, then ten rounds that each ask the page again: the
    # sixth runs, the eleventh ends the turn.
    assert asked_of_the_page(said[6]) == ["loop-7"]
    assert all(asked_of_the_page(events) for events in said[: ROUNDS_A_MESSAGE + 1])
    assert len(said) == 12
    ended = said[ROUNDS_A_MESSAGE + 1]
    assert asked_of_the_page(ended) == []
    assert answer_of(ended) == TOO_MANY_ROUNDS.format(
        rounds=ROUNDS_A_MESSAGE, tool=HEADER.name
    )
    assert model.calls == ROUNDS_A_MESSAGE + 1
    assert visitors.TURNS._taken["tab-ada-0001"] == 1


def test_the_eleventh_round_of_page_tools_ends_a_signed_in_turn(
    runtime: Runtime, remote: TestClient
) -> None:
    async def token(deployment: str, bearer: str) -> Dict[str, Any]:
        return {"access_token": "p-token", "expires_in": 3600, "principal_uid": "p-7"}

    principal.use_asker(token)
    principal.forget_principal_token("dep-1")
    model = make_agent_on(
        runtime,
        LoopingModel(),
        {"app_uid": "app-1", "deployment_uid": "dep-1", "version": 2},
    )
    said = _rounds(remote, as_("ada"), "thread-rounds-p")
    assert asked_of_the_page(said[6]) == ["loop-7"]
    assert asked_of_the_page(said[ROUNDS_A_MESSAGE]) == [f"loop-{ROUNDS_A_MESSAGE + 1}"]
    assert answer_of(said[ROUNDS_A_MESSAGE + 1]) == TOO_MANY_ROUNDS.format(
        rounds=ROUNDS_A_MESSAGE, tool=HEADER.name
    )
    assert model.calls == ROUNDS_A_MESSAGE + 1


@pytest.fixture(autouse=True)
def _no_turns_left_over() -> Iterator[None]:
    visitors.forget_turns()
    yield
    visitors.forget_turns()
