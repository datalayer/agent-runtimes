# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What a step shows while it runs: an output written as it comes (LOOP
P-31), and each tool call of the agent a step of its own, in this process
(P-33) — through a `MemoryChannel`, the terminal, and the session API's
AG-UI stream. And the blank agent this process builds (P-32).
"""

import io
import json
from typing import Any, Dict, List

import pytest
from pydantic_ai import Agent
from rich.console import Console

from agent_runtimes.loop.apps import (
    AppHost,
    Application,
    MemoryChannel,
    Step,
    StepDelta,
    sessions,
)
from agent_runtimes.loop.apps.agent import local_agent
from agent_runtimes.loop.apps.callers import Caller
from agent_runtimes.loop.apps.enforcement import AppRuleBlockedError
from agent_runtimes.loop.apps.record import AppRecorder
from agent_runtimes.loop.apps.scaffold import BLANK_PYTHON_AGENT
from agent_runtimes.loop.apps.terminal import TerminalChannel
from agent_runtimes.tests.test_app_own_code import desk, hosted
from agent_runtimes.tests.test_apps_guards import scripted

pytest.importorskip("agentspecs.apps")


def ended(channel: MemoryChannel) -> List[Step]:
    return [e for e in channel.events if isinstance(e, Step) and e.ended_at]


# --- a step that streams (P-31) -----------------------------------------------------


def writer() -> Application:
    app = Application(id="sql-writer", kind="chat", agent=BLANK_PYTHON_AGENT)

    @app.message
    async def main(session: Any, text: str) -> None:
        async with session.step("chain", kind="run"):
            async with session.step("gen_query", kind="tool", input=text) as step:
                written = await step.stream(session.agent.stream(text))
                step.output = written.strip("`").strip()
        await session.send(step.output)

    return app


async def test_a_step_writes_its_output_as_the_model_writes_it() -> None:
    channel = MemoryChannel()
    host = AppHost(
        writer(),
        channel,
        agent=lambda spec: Agent(
            scripted(["`SELECT *", " FROM orders", " WHERE order_id = 1003`"])
        ),
    )
    session = await host.open()
    await host.message(session, "Where is order 1003?")
    started = next(e for e in channel.events if isinstance(e, Step))
    gen = next(
        e
        for e in channel.events
        if isinstance(e, Step) and e.name == "gen_query" and not e.ended_at
    )
    pieces = [e for e in channel.events if isinstance(e, StepDelta)]
    # Piece by piece, in the step, between its start and its end.
    assert len(pieces) > 1
    assert "".join(p.text for p in pieces) == (
        "`SELECT * FROM orders WHERE order_id = 1003`"
    )
    assert {p.step_id for p in pieces} == {gen.id} and gen.parent_id == started.id
    order = channel.events.index
    end = next(e for e in ended(channel) if e.name == "gen_query")
    assert order(gen) < order(pieces[0]) < order(pieces[-1]) < order(end)
    # It ends with the output its code set, whole.
    assert end.output == "SELECT * FROM orders WHERE order_id = 1003"
    assert channel.messages[-1].text == end.output


async def test_a_step_streams_text_only_and_writes_on() -> None:
    app = Application(id="streams", kind="chat", agent=BLANK_PYTHON_AGENT)
    channel = MemoryChannel()
    host = AppHost(app, channel, agent=lambda spec: Agent(scripted("x")))
    session = await host.open()
    async with session.step("Counting") as step:
        assert await step.stream(["one", "", " two"]) == "one two"
        assert await step.stream(" three") == " three"
    assert ended(channel)[-1].output == "one two three"
    with pytest.raises(
        ValueError, match="A step streams text: its output is already dict"
    ):
        async with session.step("Reading") as step:
            step.output = {"rows": 3}
            await step.stream("more")
    assert ended(channel)[-1].error.startswith("A step streams text")


async def test_the_session_api_says_the_step_again_with_what_it_wrote_so_far() -> None:
    application = writer()
    app = application.spec
    live = sessions.LiveSession(
        uid="session-0031",
        agent_id="sql-writer",
        app=app,
        instance={},
        opened_by=Caller(kind="person", uid="ada"),
        acts_as={"kind": "person", "uid": "ada"},
        recorder=AppRecorder(app=app, send=lambda body: _nothing()),
    )
    live.host = AppHost(application, live, recorder=live.recorder)
    live.session = await live.host.open(id=live.uid)
    queue = live._open_stream()
    async with live.session.step("gen_query", kind="tool", input="q") as step:
        await step.stream(["SELECT", " 1"])
    events: List[Dict[str, Any]] = []
    while not queue.empty():
        chunk = queue.get_nowait()
        assert chunk is not None
        events.extend(
            json.loads(line[len("data:") :])
            for line in chunk.splitlines()
            if line.startswith("data:")
        )
    said = [
        (e["value"]["output"], e["value"]["ended_at"] is not None)
        for e in events
        if e["type"] == "CUSTOM" and e["name"] == sessions.LOOP_STEP
    ]
    # Running, then running with each piece added, then ended: one row, in place.
    assert said == [
        (None, False),
        ("SELECT", False),
        ("SELECT 1", False),
        ("SELECT 1", True),
    ]
    assert [e["type"] for e in events].count("STEP_STARTED") == 1


async def _nothing() -> None:
    return None


async def test_the_terminal_writes_a_step_as_it_comes() -> None:
    out = io.StringIO()
    channel = TerminalChannel(
        Console(file=out, force_terminal=False, width=100), app_name="Writer"
    )
    host = AppHost(
        writer(),
        channel,
        agent=lambda spec: Agent(scripted(["SELECT 1", " FROM orders"])),
    )
    session = await host.open()
    await host.message(session, "Count")
    lines = out.getvalue().splitlines()
    assert "  ◦ gen_query…" in lines
    assert "    SELECT 1 FROM orders" in lines
    assert lines.index("  ◦ gen_query…") < lines.index("    SELECT 1 FROM orders")


# --- a tool call as a step, in this process (P-33) ------------------------------------


async def test_each_tool_call_of_the_agent_is_a_tool_step_nested_where_it_was_called() -> (
    None
):
    host, channel, _ = hosted(
        desk(),
        ("lookup_order", {"number": "42"}),
        "Order 42 has shipped.",
    )
    session = await host.open()
    async with session.step("Looking", kind="run") as outer:
        answer = await session.agent.run("Where is order 42?")
        outer.output = answer.text
    [call, looking] = ended(channel)
    assert (call.name, call.kind, call.input, call.output, call.error) == (
        "lookup_order",
        "tool",
        {"number": "42"},
        {"number": "42", "status": "shipped"},
        "",
    )
    assert call.parent_id == looking.id
    # Started when the model made it, ended with its result.
    first = next(e for e in channel.events if isinstance(e, Step) and e.id == call.id)
    assert first.ended_at is None and first.output is None


async def test_a_call_the_person_refuses_ends_its_step_saying_why() -> None:
    host, channel, _ = hosted(
        desk(),
        ("refund", {"number": "42", "amount": 10}),
        "Not refunded.",
    )
    session = await host.open()
    channel.reply("Refuse")
    with pytest.raises(AppRuleBlockedError):
        await session.agent.run("Refund it.")
    started = [e for e in channel.events if isinstance(e, Step) and not e.ended_at]
    [refused] = ended(channel)
    assert [s.name for s in started] == ["refund"]
    # Shown before the person was asked about it, then ended with the refusal.
    assert refused.name == "refund" and refused.error
    assert refused.input == {"number": "42", "amount": 10}


async def test_a_streamed_answer_shows_its_tool_calls_too() -> None:
    host, channel, _ = hosted(
        desk(),
        ("lookup_order", {"number": "7"}),
        ["Order 7 ", "has shipped."],
    )
    session = await host.open()
    await session.stream(session.agent.stream("Where is order 7?"))
    [call] = ended(channel)
    assert (call.name, call.output) == (
        "lookup_order",
        {"number": "7", "status": "shipped"},
    )
    assert channel.messages[-1].text == "Order 7 has shipped."


# --- a blank agent this process builds (P-32) -----------------------------------------


def test_the_blank_agent_is_built_here_and_says_only_the_applications_words() -> None:
    from agent_runtimes.specs.agents import get_agent_spec

    spec = get_agent_spec(BLANK_PYTHON_AGENT)
    assert spec is not None
    assert (spec.system_prompt, spec.skills, spec.backend_tools, spec.mcp_servers) == (
        None,
        [],
        [],
        [],
    )
    app = Application(
        id="echo-desk",
        kind="chat",
        agent=BLANK_PYTHON_AGENT,
        instructions="You are Echo Desk. You repeat what you are told.",
    )
    agent = local_agent(app.spec)
    assert [i.instruction for i in agent._instructions] == [
        "You are Echo Desk. You repeat what you are told."
    ]


async def test_on_a_runtime_a_tool_call_of_the_codes_agent_reaches_the_chat_as_a_step() -> (
    None
):
    """The agent a runtime made (``agent_maker``), called by the code: each
    call is said on the session API's stream as ``loop.step`` (LOOP P-33)."""
    from agent_runtimes.loop.apps.agent import AppAgent

    application = Application(id="order-desk", kind="chat", agent=BLANK_PYTHON_AGENT)

    @application.message
    async def main(session: Any, text: str) -> None:
        await session.send((await session.agent.run(text)).text)

    def made(session: Any) -> AppAgent:
        agent: Agent = Agent(
            scripted(("lookup_order", {"number": "42"}), "Order 42 has shipped.")
        )

        @agent.tool_plain
        def lookup_order(number: str) -> dict:
            return {"number": number, "status": "shipped"}

        return AppAgent(app=session.app, agent=agent, session_id=session.id)

    app = application.spec
    live = sessions.LiveSession(
        uid="session-0033",
        agent_id="order-desk",
        app=app,
        instance={},
        opened_by=Caller(kind="person", uid="ada"),
        acts_as={"kind": "person", "uid": "ada"},
        recorder=AppRecorder(app=app, send=lambda body: _nothing()),
    )
    live.host = AppHost(application, live, recorder=live.recorder, agent_maker=made)
    live.session = await live.host.open(id=live.uid)
    queue = live._open_stream()
    await live.host.message(live.session, "Where is order 42?")
    events: List[Dict[str, Any]] = []
    while not queue.empty():
        chunk = queue.get_nowait()
        assert chunk is not None
        events.extend(
            json.loads(line[len("data:") :])
            for line in chunk.splitlines()
            if line.startswith("data:")
        )
    steps = [
        e["value"]
        for e in events
        if e["type"] == "CUSTOM" and e["name"] == sessions.LOOP_STEP
    ]
    assert [(s["name"], s["kind"], s["ended_at"] is not None) for s in steps] == [
        ("lookup_order", "tool", False),
        ("lookup_order", "tool", True),
    ]
    assert steps[1]["input"] == {"number": "42"}
    assert steps[1]["output"] == {"number": "42", "status": "shipped"}
