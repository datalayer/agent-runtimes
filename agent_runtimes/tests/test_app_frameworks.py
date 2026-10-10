# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent of the application's code: a plain function, a LangGraph graph, a
LlamaIndex agent (LOOP P-23).

Each framework is run twice where it is installed: through a small fake that
says the framework's events as the framework says them, and through the
framework's own classes — an agent built by the framework, on a scripted model
— so that the fake is held to what the framework does. Where it is not
installed (CI), the fake runs alone. No network, no model.
"""

from __future__ import annotations

import asyncio
import importlib.util
import sys
import types
import uuid
import warnings
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable, Dict, List, Tuple

import pytest

from agent_runtimes.chat.tux import SessionStats
from agent_runtimes.commands.apps import NEEDS_ATTENTION, validate_file
from agent_runtimes.loop.apps import AppHost, Application, MemoryChannel, Session
from agent_runtimes.loop.apps.build import build
from agent_runtimes.loop.apps.enforcement import AppRuleBlockedError
from agent_runtimes.loop.apps.frameworks import (
    FrameworkAgent,
    FrameworkCallRefused,
    code_agent_problems,
    framework_of,
    missing_framework,
)
from agent_runtimes.loop.apps.loading import AppNotRunnable
from agent_runtimes.loop.apps.record import AppRecorder
from agent_runtimes.loop.apps.session import ALLOW, REFUSE, Delta, Message, Step

pytest.importorskip("agentspecs.apps")

AGENT = "cog-crawler:0.0.1"
ANSWER = "The answer is here"


def installed(module: str) -> bool:
    try:
        return importlib.util.find_spec(module) is not None
    except (ImportError, ValueError):
        return False


def hosted(app: Application) -> Tuple[AppHost, MemoryChannel, List[Dict[str, Any]]]:
    sent: List[Dict[str, Any]] = []

    async def send(body: Dict[str, Any]) -> None:
        sent.append(body)

    channel = MemoryChannel()
    spec = app.spec.model_copy(
        update={
            "record": app.spec.record.model_copy(
                update={
                    "include": [
                        "actions",
                        "decisions",
                        "outputs",
                        "conversations",
                        "approvals",
                    ]
                }
            )
        }
    )
    host = AppHost(app, channel, recorder=AppRecorder(app=spec, send=send))
    return host, channel, sent


def entries(sent: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [entry for body in sent for entry in body["entries"]]


def steps(channel: MemoryChannel) -> List[Step]:
    """The steps that ended, in the order they ended."""
    return [
        event
        for event in channel.events
        if isinstance(event, Step) and event.ended_at is not None
    ]


# --- a plain function ----------------------------------------------------------------


def test_a_plain_function_answers_streamed_and_is_a_step() -> None:
    app = Application(id="echo", kind="chat", agent=AGENT)

    @app.agent
    async def answer(text: str, history: list) -> Any:
        yield "You said "
        yield f"{text}, after {len(history)} messages."

    async def scenario() -> None:
        host, channel, sent = hosted(app)
        session = await host.open()
        await host.message(session, "hello")
        await host.message(session, "again")
        texts = [message.text for message in channel.messages]
        assert texts == [
            "You said hello, after 0 messages.",
            "You said again, after 2 messages.",
        ]
        assert isinstance(session.agent, FrameworkAgent)
        ended = steps(channel)
        assert [(step.name, step.kind, step.parent_id) for step in ended] == [
            ("answer", "run", None),
            ("answer", "run", None),
        ]
        assert ended[0].input == "hello"
        kinds = [entry["kind"] for entry in entries(sent)]
        assert kinds.count("turn") == 2 and kinds.count("step") == 2

    asyncio.run(scenario())


def test_a_framework_agent_is_refused_a_models_settings_in_a_sentence() -> None:
    """``model_settings`` is the application's own agent's (LOOP P-27): a
    framework's model is set in its own code, and saying it here is refused."""
    app = Application(id="echo", kind="chat", agent=AGENT)

    @app.agent
    def answer(text: str) -> str:
        return text

    async def scenario() -> None:
        host, _, _ = hosted(app)
        session = await host.open()
        with pytest.raises(ValueError, match="sets its model in its own code"):
            await session.agent.run("hi", model_settings={"temperature": 0})
        with pytest.raises(ValueError, match="sets its model in its own code"):
            async for _ in session.agent.stream("hi", model_settings={"top_p": 1}):
                pass

    asyncio.run(scenario())


@pytest.mark.parametrize("flavor", ["sync", "async", "generator"])
def test_a_function_sync_or_async_returning_text_or_yielding(flavor: str) -> None:
    app = Application(id="echo", kind="chat", agent=AGENT)
    if flavor == "sync":

        def answer(text: str) -> str:
            return f"Sync: {text}"

    elif flavor == "async":

        async def answer(text: str) -> str:  # type: ignore[misc]
            return f"Async: {text}"

    else:

        def answer(text: str) -> Any:  # type: ignore[misc]
            yield "Generator: "
            yield text

    app.agent(answer)

    async def scenario() -> str:
        host, channel, _ = hosted(app)
        session = await host.open()
        await host.message(session, "hi")
        return channel.messages[-1].text

    said = asyncio.run(scenario())
    assert (
        said
        == {"sync": "Sync: hi", "async": "Async: hi", "generator": "Generator: hi"}[
            flavor
        ]
    )


def test_a_function_is_given_the_session_and_what_the_code_tells_it() -> None:
    app = Application(id="goal", kind="chat", agent=AGENT)

    @app.agent
    def answer(text: str, session: Session, goal: str = "") -> str:
        session.state["seen"] = text
        return f"{text} toward {goal}"

    @app.message
    async def reply(session: Session, text: str) -> None:
        answered = await session.agent.run(text, goal="clarity")
        await session.send(answered.text.upper())

    async def scenario() -> Tuple[str, Session]:
        host, channel, _ = hosted(app)
        session = await host.open()
        await host.message(session, "hi")
        return channel.messages[-1].text, session

    said, session = asyncio.run(scenario())
    assert said == "HI TOWARD CLARITY"
    assert session.state["seen"] == "hi"


def test_a_function_that_takes_no_context_is_refused_it_in_a_sentence() -> None:
    app = Application(id="goal", kind="chat", agent=AGENT)
    app.agent(lambda text: text, name="echo")

    @app.message
    async def reply(session: Session, text: str) -> None:
        await session.agent.run(text, goal="clarity")

    async def scenario() -> None:
        host, _, _ = hosted(app)
        session = await host.open()
        await host.message(session, "hi")

    with pytest.raises(TypeError, match="takes no 'goal'"):
        asyncio.run(scenario())


def test_a_credential_is_withheld_as_a_function_answers() -> None:
    app = Application(id="leaky", kind="chat", agent=AGENT)
    key = "sk-" + "a" * 40

    @app.agent
    def answer(text: str) -> Any:
        yield "Here is the key: "
        yield key
        yield " — keep it."

    async def scenario() -> Tuple[str, List[str]]:
        host, channel, _ = hosted(app)
        session = await host.open()
        await host.message(session, "the key?")
        pieces = [event.text for event in channel.events if isinstance(event, Delta)]
        return channel.messages[-1].text, pieces

    whole, pieces = asyncio.run(scenario())
    assert key not in whole and key not in "".join(pieces)


def test_an_answer_its_code_refuses_is_not_given() -> None:
    from agent_runtimes.loop.apps.guards import AppCheckBlockedError

    app = Application(id="priced", kind="chat", agent=AGENT)

    @app.agent
    def answer(text: str) -> str:
        return "It costs $40."

    @app.check("answer")
    def no_prices(text: str) -> Any:
        """It never quotes a price."""
        return "It quoted a price." if "$" in text else None

    async def scenario() -> MemoryChannel:
        host, channel, _ = hosted(app)
        session = await host.open()
        with pytest.raises(AppCheckBlockedError, match="quoted a price"):
            await host.message(session, "price?")
        return channel

    channel = asyncio.run(scenario())
    assert channel.messages == []
    assert not any(type(event).__name__ == "Delta" for event in channel.events)
    assert steps(channel)[-1].error


# --- declared, built, validated --------------------------------------------------------


APP_PY = """
from agent_runtimes.loop.apps import Application

app = Application(id="echo", kind="chat", agent="cog-crawler:0.0.1")


@app.agent
def answer(text: str) -> str:
    return text
"""


def test_build_marks_the_agent_of_its_code_and_validation_says_its_rules_see_nothing(
    tmp_path: Path,
) -> None:
    file = tmp_path / "app.py"
    file.write_text(APP_PY)
    built = build(file)
    assert "# loop:code agent function: answer (app.py:7)" in built.text.splitlines()
    report = validate_file(file)
    assert report.verdict == NEEDS_ATTENTION
    assert any(
        "Its agent is a plain function, answer: LOOP sees none of the tools" in note
        for note in report.attention
    )


def test_a_framework_missing_here_is_refused_naming_its_extra(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setitem(sys.modules, "langgraph", None)
    file = tmp_path / "app.py"
    file.write_text("import langgraph\n" + APP_PY)
    with pytest.raises(AppNotRunnable) as refused:
        build(file)
    assert refused.value.problems == [
        "app.py does not load. It needs LangGraph, which is not installed here: "
        "pip install 'agent-runtimes[langgraph]'."
    ]
    assert "agent-runtimes[llamaindex]" in (
        missing_framework(ModuleNotFoundError(name="llama_index.core")) or ""
    )
    assert missing_framework(ModuleNotFoundError(name="pandas")) is None


def test_what_is_not_an_agent_is_refused() -> None:
    with pytest.raises(TypeError, match="app.agent takes a function"):
        framework_of(42)


def test_an_agent_of_its_code_and_tools_of_its_code_do_not_go_together() -> None:
    app = Application(id="both", kind="chat", agent=AGENT)

    @app.tool(does="read")
    def lookup(number: str) -> str:
        """Look an order up."""
        return number

    with pytest.raises(ValueError, match="brings its own tools"):
        app.agent(lambda text: text)
    other = Application(id="both", kind="chat", agent=AGENT)
    other.agent(lambda text: text, name="echo")
    with pytest.raises(ValueError, match="brings its own tools"):

        @other.tool(does="read")
        def lookup_too(number: str) -> str:
            """Look an order up."""
            return number

    with pytest.raises(ValueError, match="already has an agent of its code"):
        other.agent(lambda text: text)


def test_a_function_has_no_tools_to_say() -> None:
    app = Application(id="echo", kind="chat", agent=AGENT)
    with pytest.raises(ValueError, match="nothing to say tools= of"):
        app.agent(lambda text: text, tools={"search": "read"})


def test_what_loop_gives_an_agent_of_the_catalogue_is_not_given_to_one_of_its_code() -> (
    None
):
    app = Application(id="connected", kind="chat", agent=AGENT)
    app.agent(lambda text: text, name="echo")
    spec = Application(id="connected", kind="chat", agent=AGENT)
    spec.connection("tavily")
    assert app.code_agent is not None
    problems = code_agent_problems(spec.spec, app.code_agent)
    assert problems == [
        "connected has connections, which LOOP gives an agent of the catalogue, "
        "not its agent echo (a plain function): give them to it in its own code, "
        "or leave app.agent out."
    ]
    app.connection("tavily")
    with pytest.raises(AppNotRunnable, match="has connections"):
        app.spec  # noqa: B018


# --- LangChain and LangGraph -----------------------------------------------------------


def _fake_langchain(monkeypatch: pytest.MonkeyPatch) -> type:
    """Stand in for LangChain's callbacks and runnables, as small as LOOP reads them."""

    class BaseCallbackHandler:
        raise_error = False

    class Runnable:
        pass

    callbacks = types.ModuleType("langchain_core.callbacks")
    callbacks.BaseCallbackHandler = BaseCallbackHandler
    runnables = types.ModuleType("langchain_core.runnables")
    runnables.Runnable = Runnable
    core = types.ModuleType("langchain_core")
    for name, module in (
        ("langchain_core", core),
        ("langchain_core.callbacks", callbacks),
        ("langchain_core.runnables", runnables),
    ):
        monkeypatch.setitem(sys.modules, name, module)
    return Runnable


#: A turn of the scripted model: a text, or tool calls as ``[(name, args)]``.
Reply = Any


def fake_graph(
    monkeypatch: pytest.MonkeyPatch,
    tools: Dict[str, Callable[..., str]],
    replies: List[Reply],
) -> Any:
    """A LangGraph prebuilt agent's events (`astream_events`, v2), said by hand.

    As LangGraph runs a tool: its callbacks' ``on_tool_start`` first, in a
    thread of the executor — a handler that raises (``raise_error``) stops
    the tool, and the run — then ``on_tool_start`` and ``on_tool_end`` in
    the stream.
    """
    Runnable = _fake_langchain(monkeypatch)

    class CompiledStateGraph(Runnable):  # type: ignore[misc, valid-type]
        name = "LangGraph"
        checkpointer = None

        def __init__(self) -> None:
            self.nodes = {
                "tools": SimpleNamespace(
                    bound=SimpleNamespace(
                        tools_by_name={
                            name: SimpleNamespace(
                                name=name,
                                description=function.__doc__ or "",
                                args_schema=None,
                                func=function,
                            )
                            for name, function in tools.items()
                        }
                    )
                )
            }
            self.script = list(replies)

        async def astream_events(self, input: Any, config: Any, version: str) -> Any:
            assert version == "v2"
            handler = config["callbacks"][0]
            root = str(uuid.uuid4())
            messages = list(input["messages"])
            yield {
                "event": "on_chain_start",
                "name": "LangGraph",
                "run_id": root,
                "parent_ids": [],
                "data": {"input": input},
            }
            while self.script:
                reply = self.script.pop(0)
                model = str(uuid.uuid4())
                yield {
                    "event": "on_chat_model_start",
                    "name": "Model",
                    "run_id": model,
                    "parent_ids": [root],
                    "data": {},
                }
                text = reply if isinstance(reply, str) else ""
                for word in text.split(" ") if text else []:
                    yield {
                        "event": "on_chat_model_stream",
                        "name": "Model",
                        "run_id": model,
                        "parent_ids": [root],
                        "data": {"chunk": SimpleNamespace(content=word + " ")},
                    }
                calls = [] if isinstance(reply, str) else reply
                yield {
                    "event": "on_chat_model_end",
                    "name": "Model",
                    "run_id": model,
                    "parent_ids": [root],
                    "data": {"output": SimpleNamespace(content=text, tool_calls=calls)},
                }
                messages.append(SimpleNamespace(content=text))
                for name, args in calls:
                    run = str(uuid.uuid4())
                    await asyncio.to_thread(
                        handler.on_tool_start,
                        {"name": name},
                        str(args),
                        run_id=run,
                        inputs=args,
                        name=name,
                    )
                    yield {
                        "event": "on_tool_start",
                        "name": name,
                        "run_id": run,
                        "parent_ids": [root],
                        "data": {"input": args},
                    }
                    out = tools[name](**args)
                    yield {
                        "event": "on_tool_end",
                        "name": name,
                        "run_id": run,
                        "parent_ids": [root],
                        "data": {"output": SimpleNamespace(content=out), "input": args},
                    }
                    messages.append(SimpleNamespace(content=out))
            yield {
                "event": "on_chain_end",
                "name": "LangGraph",
                "run_id": root,
                "parent_ids": [],
                "data": {"output": {"messages": messages}},
            }

    CompiledStateGraph.__module__ = "langgraph.graph.state"
    return CompiledStateGraph()


def real_graph(
    monkeypatch: pytest.MonkeyPatch,
    tools: Dict[str, Callable[..., str]],
    replies: List[Reply],
) -> Any:
    """A LangGraph prebuilt agent, on a chat model that says what it is told."""
    import json

    from langchain_core.language_models import BaseChatModel
    from langchain_core.messages import AIMessage, AIMessageChunk
    from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
    from langchain_core.tools import tool
    from langgraph.prebuilt import create_react_agent

    def message(reply: Reply) -> AIMessage:
        if isinstance(reply, str):
            return AIMessage(content=reply)
        return AIMessage(
            content="",
            tool_calls=[
                {"name": name, "args": args, "id": f"call-{index}"}
                for index, (name, args) in enumerate(reply)
            ],
        )

    class Scripted(BaseChatModel):
        replies: list

        @property
        def _llm_type(self) -> str:
            return "scripted"

        def bind_tools(self, tools: Any, **kwargs: Any) -> Any:
            return self

        def _generate(
            self,
            messages: Any,
            stop: Any = None,
            run_manager: Any = None,
            **kwargs: Any,
        ) -> ChatResult:
            return ChatResult(
                generations=[ChatGeneration(message=message(self.replies.pop(0)))]
            )

        def _stream(
            self,
            messages: Any,
            stop: Any = None,
            run_manager: Any = None,
            **kwargs: Any,
        ) -> Any:
            said = message(self.replies.pop(0))
            if said.tool_calls:
                yield ChatGenerationChunk(
                    message=AIMessageChunk(
                        content="",
                        tool_call_chunks=[
                            {
                                "name": call["name"],
                                "args": json.dumps(call["args"]),
                                "id": call["id"],
                                "index": index,
                            }
                            for index, call in enumerate(said.tool_calls)
                        ],
                    )
                )
                return
            for word in str(said.content).split(" "):
                chunk = ChatGenerationChunk(message=AIMessageChunk(content=word + " "))
                if run_manager:
                    run_manager.on_llm_new_token(word + " ", chunk=chunk)
                yield chunk

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return create_react_agent(
            Scripted(replies=list(replies)),
            [tool(function) for function in tools.values()],
        )


GRAPHS = [
    pytest.param(fake_graph, id="fake"),
    pytest.param(
        real_graph,
        id="langgraph",
        marks=pytest.mark.skipif(
            not installed("langgraph"), reason="LangGraph is not installed"
        ),
    ),
]


def research_tools(ran: List[str]) -> Dict[str, Callable[..., str]]:
    def search(query: str) -> str:
        """Search the web."""
        ran.append(f"search {query}")
        return f"found {query}"

    def send_email(to: str) -> str:
        """Send an email."""
        ran.append(f"send_email {to}")
        return f"sent to {to}"

    return {"search": search, "send_email": send_email}


@pytest.mark.parametrize("make", GRAPHS)
def test_a_langgraph_run_is_steps_and_its_tokens_the_answer(
    make: Callable[..., Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    ran: List[str] = []
    graph = make(
        monkeypatch, research_tools(ran), [[("search", {"query": "x"})], ANSWER]
    )
    app = Application(id="research", kind="chat", agent=AGENT)
    app.agent(graph, name="research", tools={"search": "read", "send_email": "send"})
    assert framework_of(graph) == "langgraph"
    declared = {tool["name"]: tool for tool in app.document["tools"]}
    assert declared["search"]["does"] == ["read"]
    assert declared["search"]["description"].startswith("Search the web.")

    async def scenario() -> Tuple[MemoryChannel, List[Dict[str, Any]]]:
        host, channel, sent = hosted(app)
        session = await host.open()
        await host.message(session, "find x")
        return channel, sent

    channel, sent = asyncio.run(scenario())
    assert ran == ["search x"]
    assert channel.messages[-1].text.strip() == ANSWER
    deltas = [event.text for event in channel.events if isinstance(event, Delta)]
    assert len(deltas) > 1
    ended = steps(channel)
    root = ended[-1]
    assert (root.name, root.kind, root.parent_id) == ("research", "run", None)
    tool = next(step for step in ended if step.kind == "tool")
    assert (tool.name, tool.input, tool.output, tool.parent_id) == (
        "search",
        {"query": "x"},
        "found x",
        root.id,
    )
    assert [step.kind for step in ended].count("model") == 2
    recorded = entries(sent)
    decision = next(entry for entry in recorded if entry["kind"] == "decision")
    assert decision["payload"]["tool"] == "search"
    assert decision["payload"]["behaviour"] == "do_it"
    assert any(entry["kind"] == "tool_call" for entry in recorded)
    assert any(entry["kind"] == "turn" for entry in recorded)


@pytest.mark.parametrize("make", GRAPHS)
@pytest.mark.parametrize("answer", [REFUSE, ALLOW])
def test_a_langgraph_tool_its_rules_ask_of_runs_only_once_allowed(
    make: Callable[..., Any], answer: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    ran: List[str] = []
    graph = make(
        monkeypatch, research_tools(ran), [[("send_email", {"to": "ann"})], "Sent."]
    )
    app = Application(id="mailer", kind="chat", agent=AGENT)
    app.agent(graph, name="mailer", tools={"search": "read", "send_email": "send"})

    async def scenario() -> Tuple[MemoryChannel, List[Dict[str, Any]], Any]:
        host, channel, sent = hosted(app)
        session = await host.open()
        channel.reply(answer)
        try:
            await host.message(session, "mail ann")
        except AppRuleBlockedError as refused:
            return channel, sent, refused
        return channel, sent, None

    channel, sent, refused = asyncio.run(scenario())
    assert len(channel.questions) == 1
    assert "send_email" in channel.questions[0].prompt
    if answer == REFUSE:
        assert ran == []
        assert refused is not None
        assert steps(channel)[-1].error
        assert not any(isinstance(event, Message) for event in channel.events)
    else:
        assert refused is None
        assert ran == ["send_email ann"]
        assert channel.messages[-1].text.strip() == "Sent."
    outcomes = [
        e["payload"]["outcome"] for e in entries(sent) if e["kind"] == "approval"
    ]
    assert outcomes == (["declined"] if answer == REFUSE else ["approved"])


@pytest.mark.parametrize("make", GRAPHS)
def test_a_tool_not_said_is_refused_when_given_and_one_it_lacks_too(
    make: Callable[..., Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    graph = make(monkeypatch, research_tools([]), [ANSWER])
    app = Application(id="research", kind="chat", agent=AGENT)
    with pytest.raises(
        ValueError, match=r"Say what each tool of research does.*'send_email': 'read'"
    ):
        app.agent(graph, name="research", tools={"search": "read"})
    with pytest.raises(ValueError, match="has no tool 'browse'"):
        app.agent(
            graph,
            name="research",
            tools={"search": "read", "send_email": "send", "browse": "read"},
        )
    with pytest.raises(ValueError, match="Say what the tool 'search' does"):
        app.agent(
            graph, name="research", tools={"search": "peek", "send_email": "send"}
        )


# --- LlamaIndex ------------------------------------------------------------------------


def _fake_llama(monkeypatch: pytest.MonkeyPatch) -> Dict[str, Any]:
    """Stand in for LlamaIndex's agents and workflows, as small as LOOP reads them."""

    class Workflow:
        pass

    class BaseWorkflowAgent(Workflow):
        pass

    class AgentWorkflow(Workflow):
        pass

    class Context:
        def __init__(self, workflow: Any) -> None:
            self.workflow = workflow

    workflow = types.ModuleType("llama_index.core.workflow")
    workflow.Workflow = Workflow
    workflow.Context = Context
    agents = types.ModuleType("llama_index.core.agent.workflow")
    agents.BaseWorkflowAgent = BaseWorkflowAgent
    agents.AgentWorkflow = AgentWorkflow
    for name, module in (
        ("llama_index", types.ModuleType("llama_index")),
        ("llama_index.core", types.ModuleType("llama_index.core")),
        ("llama_index.core.agent", types.ModuleType("llama_index.core.agent")),
        ("llama_index.core.agent.workflow", agents),
        ("llama_index.core.workflow", workflow),
    ):
        monkeypatch.setitem(sys.modules, name, module)
    return {"BaseWorkflowAgent": BaseWorkflowAgent, "Workflow": Workflow}


def _event(name: str) -> type:
    return type(name, (SimpleNamespace,), {})


AgentInput, AgentStream, AgentOutput, ToolCall, ToolCallResult, StopEvent = (
    _event(name)
    for name in (
        "AgentInput",
        "AgentStream",
        "AgentOutput",
        "ToolCall",
        "ToolCallResult",
        "StopEvent",
    )
)


def fake_llama_agent(
    monkeypatch: pytest.MonkeyPatch,
    tools: Dict[str, Callable[..., str]],
    replies: List[Reply],
) -> Any:
    """A LlamaIndex ReAct agent's events (`stream_events`), said by hand.

    As LlamaIndex runs a tool: ``ToolCall`` written to the stream, then the
    agent's ``_call_tool`` — which raises out of the run when it refuses —
    then ``ToolCallResult``. Its steps run in tasks of the workflow's.
    """
    base = _fake_llama(monkeypatch)["BaseWorkflowAgent"]

    def as_tool(name: str, function: Callable[..., str]) -> Any:
        metadata = SimpleNamespace(
            get_name=lambda: name,
            description=function.__doc__ or "",
            get_parameters_dict=lambda: {"type": "object", "properties": {}},
        )
        return SimpleNamespace(metadata=metadata, function=function)

    class ReActAgent(base):  # type: ignore[misc, valid-type]
        def __init__(self) -> None:
            self.tools = [as_tool(name, function) for name, function in tools.items()]
            self.script = list(replies)

        async def _call_tool(self, ctx: Any, tool: Any, tool_input: dict) -> Any:
            return SimpleNamespace(content=tool.function(**tool_input), is_error=False)

        def run(self, user_msg: str, ctx: Any = None) -> Any:
            queue: asyncio.Queue = asyncio.Queue()
            agent = self

            async def work() -> Any:
                try:
                    while agent.script:
                        reply = agent.script.pop(0)
                        queue.put_nowait(
                            AgentInput(input=user_msg, current_agent_name="Agent")
                        )
                        text = reply if isinstance(reply, str) else "Thought: a tool."
                        for word in text.split(" "):
                            queue.put_nowait(
                                AgentStream(
                                    delta=word + " ", current_agent_name="Agent"
                                )
                            )
                        calls = [] if isinstance(reply, str) else reply
                        queue.put_nowait(
                            AgentOutput(
                                response=SimpleNamespace(content=text), tool_calls=calls
                            )
                        )
                        for index, (name, args) in enumerate(calls):
                            tool = next(
                                t for t in agent.tools if t.metadata.get_name() == name
                            )
                            queue.put_nowait(
                                ToolCall(
                                    tool_name=name, tool_kwargs=args, tool_id=str(index)
                                )
                            )
                            output = await agent._call_tool(ctx, tool, args)
                            queue.put_nowait(
                                ToolCallResult(
                                    tool_name=name,
                                    tool_kwargs=args,
                                    tool_id=str(index),
                                    tool_output=output,
                                )
                            )
                    final = AgentOutput(
                        response=SimpleNamespace(content=ANSWER), tool_calls=[]
                    )
                    queue.put_nowait(StopEvent(result=final))
                    return final
                finally:
                    queue.put_nowait(None)

            task = asyncio.ensure_future(work())

            class Handler:
                async def stream_events(self) -> Any:
                    while (event := await queue.get()) is not None:
                        yield event

                def __await__(self) -> Any:
                    return task.__await__()

            return Handler()

    ReActAgent.__module__ = "llama_index.core.agent.workflow.react_agent"
    return ReActAgent()


def real_llama_agent(
    monkeypatch: pytest.MonkeyPatch,
    tools: Dict[str, Callable[..., str]],
    replies: List[Reply],
) -> Any:
    """A LlamaIndex ReAct agent, on a model that says what it is told."""
    import json

    from llama_index.core.agent.workflow import ReActAgent
    from llama_index.core.llms import CompletionResponse, CustomLLM, LLMMetadata
    from llama_index.core.llms.callbacks import llm_completion_callback

    def said(reply: Reply) -> str:
        if isinstance(reply, str):
            return (
                f"Thought: I can answer without using any more tools.\nAnswer: {reply}"
            )
        ((name, args),) = reply
        return (
            f"Thought: I need a tool.\nAction: {name}\nAction Input: {json.dumps(args)}"
        )

    class Scripted(CustomLLM):
        replies: list = []

        @property
        def metadata(self) -> LLMMetadata:
            return LLMMetadata(is_chat_model=False)

        @llm_completion_callback()
        def complete(
            self, prompt: str, formatted: bool = False, **kwargs: Any
        ) -> CompletionResponse:
            return CompletionResponse(text=said(self.replies.pop(0)))

        @llm_completion_callback()
        def stream_complete(
            self, prompt: str, formatted: bool = False, **kwargs: Any
        ) -> Any:
            text, so_far = said(self.replies.pop(0)), ""
            for word in text.split(" "):
                so_far += word + " "
                yield CompletionResponse(text=so_far, delta=word + " ")

    return ReActAgent(tools=list(tools.values()), llm=Scripted(replies=list(replies)))


LLAMAS = [
    pytest.param(fake_llama_agent, id="fake"),
    pytest.param(
        real_llama_agent,
        id="llamaindex",
        marks=pytest.mark.skipif(
            not installed("llama_index.core"), reason="LlamaIndex is not installed"
        ),
    ),
]


@pytest.mark.parametrize("make", LLAMAS)
def test_a_llamaindex_agent_run_is_steps_and_its_answer_given_whole(
    make: Callable[..., Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    ran: List[str] = []
    agent = make(
        monkeypatch, research_tools(ran), [[("search", {"query": "x"})], ANSWER]
    )
    app = Application(id="research", kind="chat", agent=AGENT)
    app.agent(agent, name="research", tools={"search": "read", "send_email": "send"})
    assert framework_of(agent) == "llamaindex-agent"

    async def scenario() -> Tuple[MemoryChannel, List[Dict[str, Any]]]:
        host, channel, sent = hosted(app)
        session = await host.open()
        await host.message(session, "find x")
        return channel, sent

    channel, sent = asyncio.run(scenario())
    assert ran == ["search x"]
    assert channel.messages[-1].text.strip() == ANSWER
    ended = steps(channel)
    root = ended[-1]
    assert (root.name, root.kind, root.parent_id) == ("research", "run", None)
    tool = next(step for step in ended if step.kind == "tool")
    assert (tool.name, tool.input, tool.parent_id) == (
        "search",
        {"query": "x"},
        root.id,
    )
    assert "found x" in str(tool.output)
    models = [step for step in ended if step.kind == "model"]
    assert len(models) == 2 and "Thought" in str(models[0].output)
    recorded = entries(sent)
    assert any(
        entry["kind"] == "decision" and entry["payload"]["tool"] == "search"
        for entry in recorded
    )
    assert any(entry["kind"] == "tool_call" for entry in recorded)


@pytest.mark.parametrize("make", LLAMAS)
def test_a_llamaindex_tool_its_rules_ask_of_is_not_run_when_refused(
    make: Callable[..., Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    ran: List[str] = []
    agent = make(
        monkeypatch, research_tools(ran), [[("send_email", {"to": "ann"})], "Sent."]
    )
    app = Application(id="mailer", kind="chat", agent=AGENT)
    app.agent(agent, name="mailer", tools={"search": "read", "send_email": "send"})

    async def scenario() -> MemoryChannel:
        host, channel, _ = hosted(app)
        session = await host.open()
        channel.reply(REFUSE)
        with pytest.raises(AppRuleBlockedError):
            await host.message(session, "mail ann")
        return channel

    channel = asyncio.run(scenario())
    assert ran == []
    assert "send_email" in channel.questions[0].prompt
    assert steps(channel)[-1].error


@pytest.mark.parametrize("make", LLAMAS)
def test_a_llamaindex_agent_given_to_an_application_refuses_tools_outside_a_session(
    make: Callable[..., Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    ran: List[str] = []
    agent = make(
        monkeypatch, research_tools(ran), [[("search", {"query": "x"})], ANSWER]
    )
    app = Application(id="research", kind="chat", agent=AGENT)
    app.agent(agent, name="research", tools={"search": "read", "send_email": "send"})

    async def outside() -> None:
        handler = agent.run(user_msg="find x")
        async for _ in handler.stream_events():
            pass
        await handler

    with pytest.raises(FrameworkCallRefused, match="outside a session"):
        asyncio.run(outside())
    assert ran == []


@pytest.mark.skipif(
    not installed("llama_index.core"), reason="LlamaIndex is not installed"
)
@pytest.mark.parametrize("answer", [REFUSE, ALLOW])
def test_an_agent_workflow_calls_its_agents_tools_decided_once(
    answer: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    from llama_index.core.agent.workflow import AgentWorkflow

    ran: List[str] = []
    react = real_llama_agent(
        monkeypatch, research_tools(ran), [[("send_email", {"to": "ann"})], "Sent."]
    )
    app = Application(id="mailer", kind="chat", agent=AGENT)
    app.agent(
        AgentWorkflow(agents=[react]),
        name="team",
        tools={"search": "read", "send_email": "send"},
    )

    async def scenario() -> MemoryChannel:
        host, channel, _ = hosted(app)
        session = await host.open()
        channel.reply(answer)
        if answer == REFUSE:
            with pytest.raises(AppRuleBlockedError):
                await host.message(session, "mail ann")
        else:
            await host.message(session, "mail ann")
        return channel

    channel = asyncio.run(scenario())
    assert len(channel.questions) == 1
    assert ran == ([] if answer == REFUSE else ["send_email ann"])
    assert [step.kind for step in steps(channel)].count("run") == 1


def test_a_llamaindex_workflow_is_steps_and_validation_says_its_rules_see_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    Workflow = _fake_llama(monkeypatch)["Workflow"]
    Looked = _event("Looked")

    class Report(Workflow):  # type: ignore[misc, valid-type]
        def run(self, user_msg: str) -> Any:
            async def work() -> Any:
                return SimpleNamespace(result=f"Report on {user_msg}")

            task = asyncio.ensure_future(work())

            class Handler:
                async def stream_events(self) -> Any:
                    yield Looked(rows=3)

                def __await__(self) -> Any:
                    return task.__await__()

            return Handler()

    Report.__module__ = "llama_index.core.workflow.workflow"
    app = Application(id="report", kind="chat", agent=AGENT)
    app.agent(Report(), name="report")
    assert app.code_agent is not None and app.code_agent.note()

    async def scenario() -> MemoryChannel:
        host, channel, _ = hosted(app)
        session = await host.open()
        await host.message(session, "sales")
        return channel

    channel = asyncio.run(scenario())
    assert channel.messages[-1].text == "Report on sales"
    assert [(step.name, step.kind) for step in steps(channel)] == [
        ("Looked", "run"),
        ("report", "run"),
    ]


def test_validation_says_nothing_of_an_agent_whose_tool_calls_its_rules_decide(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    graph = fake_graph(monkeypatch, research_tools([]), [ANSWER])
    app = Application(id="research", kind="chat", agent=AGENT)
    app.agent(graph, name="research", tools={"search": "read", "send_email": "send"})
    assert app.code_agent is not None and app.code_agent.note() is None


def test_the_terminal_gives_a_message_to_the_agent_of_its_code() -> None:
    from rich.console import Console

    from agent_runtimes.loop.apps.terminal import AppTux, ask_once

    app = Application(id="echo", kind="chat", agent=AGENT)

    @app.agent
    def answer(text: str) -> str:
        return f"You said {text}"

    console = Console(record=True, width=120)
    asyncio.run(ask_once(app, "hello", console))
    assert "You said hello" in console.export_text()
    sent: List[str] = []

    class Tux(AppTux):
        async def _turn(self, work: Callable[[], Any]) -> None:
            sent.append("code")

    tux = Tux.__new__(Tux)
    tux.application = app
    tux.app_session = Session.__new__(Session)
    tux.stats = SessionStats()
    tux.console = console
    asyncio.run(tux.send_message("hello"))
    assert sent == ["code"]
