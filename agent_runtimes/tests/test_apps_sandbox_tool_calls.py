# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What the model's code calls through the MCP proxy, on a deployment's runtime.

The sandbox shares the pod's loopback and holds no secret, so nothing it sends
says who it is, and the code in it is the model's. An application's rules decide
the tools the code *names*: code that names nothing is let run, and may then
post to `/api/v1/mcp/proxy/<server>/tools/<tool>` itself. So on such a runtime
that route answers only while code the agent was let run is running, and every
call takes the path a tool call of the agent takes, in that run.

An agent of pydantic-ai runs here with the rules on it, and its `execute_code`
posts to the proxy as the generated bindings do.

Launch the tests:

```
$ pytest agent_runtimes/tests/test_apps_sandbox_tool_calls.py -v
```
"""

from __future__ import annotations

import asyncio
import contextvars
from typing import Any, Callable, Dict, Iterator, List, Optional, Sequence

import httpx
import jwt
import pytest
from fastapi import FastAPI
from pydantic_ai import Agent
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agent_runtimes.apps import principal
from agent_runtimes.apps.enforcement import AppRuleBlockedError, AppRulesCapability
from agent_runtimes.apps.principal import forget_runtime_proof, give_runtime_proof
from agent_runtimes.apps.rules import Decision
from agent_runtimes.apps.visitors import (
    OwnRoutesOnly,
    enter_visitor_run,
    leave_visitor_run,
)
from agent_runtimes.routes import mcp_proxy
from agent_runtimes.types import AppSpec

SEND = "/api/v1/mcp/proxy/google-workspace/tools/send_gmail_message"
READ = "/api/v1/mcp/proxy/google-workspace/tools/search_gmail_messages"


def _proof() -> str:
    return jwt.encode(
        {"sub": "runtime-1", "deployment_uid": "dep-1"},
        "signed-by-the-platform",
        algorithm="HS256",
    )


class Server:
    """A running MCP server, keeping what reached it."""

    def __init__(self) -> None:
        self.called: List[tuple[str, Dict[str, Any]]] = []

    async def direct_call_tool(self, tool: str, arguments: Dict[str, Any]) -> Any:
        self.called.append((tool, arguments))
        return {"content": [{"type": "text", "text": "done"}], "is_error": False}


class Lifecycle:
    def __init__(self, server: Server) -> None:
        self.instance = type("Instance", (), {"pydantic_server": server})()

    def get_running_server(self, name: str, is_config: bool = False) -> Any:
        return self.instance if name == "google-workspace" else None

    def get_all_running_servers(self) -> List[Any]:
        return []


@pytest.fixture()
def server(monkeypatch: pytest.MonkeyPatch) -> Iterator[Server]:
    running = Server()
    monkeypatch.setattr(
        mcp_proxy, "get_mcp_lifecycle_manager", lambda: Lifecycle(running)
    )
    monkeypatch.setattr(principal, "_keep_from_this_user", lambda: None)
    forget_runtime_proof()
    give_runtime_proof(_proof(), "the-pods-secret")
    yield running
    forget_runtime_proof()


def _sandbox() -> httpx.AsyncClient:
    """What the bindings post from: the pod's loopback, with no secret."""
    runtime = FastAPI()
    runtime.include_router(mcp_proxy.router, prefix="/api/v1")
    gated = OwnRoutesOnly(runtime)
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=gated, client=("127.0.0.1", 50000)),
        base_url="http://127.0.0.1:8765",
    )


def _app(**changes: Any) -> AppSpec:
    return AppSpec.model_validate(
        {
            "id": "desk",
            "name": "Desk",
            "kind": "chat",
            "agent": "cog-crawler:0.0.1",
            "connections": [{"server": "google-workspace", "access": "write"}],
            "permissions": {"computer": {"shell": True}},
            **changes,
        }
    )


class Person:
    """Who is asked, and how they answer."""

    def __init__(self, approves: bool = True) -> None:
        self.approves = approves
        self.asked: List[str] = []

    async def __call__(
        self, tool: str, args: Dict[str, Any], decision: Decision
    ) -> None:
        self.asked.append(tool)
        if not self.approves:
            raise AppRuleBlockedError(decision)


def _rules(person: Person, app: Optional[AppSpec] = None) -> AppRulesCapability:
    return AppRulesCapability(
        app=app or _app(),
        ask=person,
        known_mcp_tools=lambda: {
            "google-workspace__send_gmail_message",
            "google-workspace__search_gmail_messages",
        },
    )


async def _runs_code(
    rules: AppRulesCapability,
    body: Callable[[httpx.AsyncClient], Any],
    code: str = "print('nothing it names')",
    others: Sequence[Any] = (),
) -> None:
    """A turn whose one tool call is `execute_code`, running ``body`` in the sandbox."""

    async def model(messages: List[Any], info: AgentInfo) -> ModelResponse:
        if len(messages) == 1:
            return ModelResponse(parts=[ToolCallPart("execute_code", {"code": code})])
        return ModelResponse(parts=[TextPart("done")])

    agent = Agent(FunctionModel(model), capabilities=[rules, *others])

    @agent.tool_plain
    async def execute_code(code: str) -> str:
        async with _sandbox() as sandbox:
            await body(sandbox)
        return "ran"

    await agent.run("go")


@pytest.mark.asyncio
async def test_code_that_names_nothing_sends_nothing_unasked(server: Server) -> None:
    """The gap: `execute_code` of code that names no tool is let run, and its
    post reached the server with the rule *ask first* on sending never asked."""
    person = Person(approves=False)
    answers: List[httpx.Response] = []

    async def body(sandbox: httpx.AsyncClient) -> None:
        answers.append(
            await sandbox.post(SEND, json={"arguments": {"to": "a@b.c", "body": "hi"}})
        )

    await _runs_code(_rules(person), body)
    assert server.called == []
    assert person.asked == ["google-workspace__send_gmail_message"]
    assert answers[0].json()["success"] is False


@pytest.mark.asyncio
async def test_a_call_outside_any_code_is_not_answered(server: Server) -> None:
    """What a harness's command, or code left over from an earlier turn, would send."""
    async with _sandbox() as sandbox:
        for answered in (
            await sandbox.post(READ, json={"arguments": {}}),
            await sandbox.get("/api/v1/mcp/proxy/servers"),
            await sandbox.get("/api/v1/mcp/proxy/health"),
        ):
            assert answered.status_code == 404, answered.text
    assert server.called == []


@pytest.mark.asyncio
async def test_a_tool_of_nothing_it_connects_to_is_not_reached(server: Server) -> None:
    person = Person()
    answers: List[httpx.Response] = []

    async def body(sandbox: httpx.AsyncClient) -> None:
        answers.append(await sandbox.post(SEND, json={"arguments": {}}))

    await _runs_code(_rules(person, _app(connections=[])), body)
    assert server.called == []
    assert person.asked == []
    assert answers[0].json()["success"] is False


@pytest.mark.asyncio
async def test_reading_is_done_and_the_person_who_approves_lets_it_through(
    server: Server,
) -> None:
    person = Person()
    answers: List[httpx.Response] = []

    async def body(sandbox: httpx.AsyncClient) -> None:
        answers.append(await sandbox.post(READ, json={"arguments": {"query": "x"}}))
        answers.append(await sandbox.post(SEND, json={"arguments": {"to": "a@b.c"}}))

    await _runs_code(_rules(person), body)
    assert person.asked == ["google-workspace__send_gmail_message"]
    assert [tool for tool, _ in server.called] == [
        "search_gmail_messages",
        "send_gmail_message",
    ]
    assert all(answer.json()["success"] for answer in answers)


@pytest.mark.asyncio
async def test_what_the_person_approved_of_the_code_is_not_asked_again(
    server: Server,
) -> None:
    """Code that names the tool: they were shown it as it was let run."""
    person = Person()

    async def body(sandbox: httpx.AsyncClient) -> None:
        await sandbox.post(SEND, json={"arguments": {"to": "a@b.c"}})
        await sandbox.post(SEND, json={"arguments": {"to": "d@e.f"}})

    await _runs_code(
        _rules(person),
        body,
        code="call_tool('google-workspace__send_gmail_message', {})",
    )
    assert person.asked == ["execute_code"]
    assert len(server.called) == 2


@pytest.mark.asyncio
async def test_what_the_arguments_make_it_do_beyond_what_was_approved_is_asked(
    server: Server,
) -> None:
    """Code showed no arguments: approved to send, it may turn out to forward outside."""
    person = Person()

    async def body(sandbox: httpx.AsyncClient) -> None:
        await sandbox.post(
            SEND, json={"arguments": {"forward_message_id": "m-1", "to": "a@b.c"}}
        )

    await _runs_code(
        _rules(person),
        body,
        code="call_tool('google-workspace__send_gmail_message', {})",
    )
    assert person.asked == ["execute_code", "google-workspace__send_gmail_message"]


@pytest.mark.asyncio
async def test_a_visitors_turn_only_reads_from_its_code_whatever_the_rules_say(
    server: Server,
) -> None:
    """The turn's variables reach the proxy's request, which has none of its own."""
    says_do_it = _app(
        rules=[{"action": "Send", "applies_to": ["send"], "behaviour": "do_it"}]
    )
    answers: List[httpx.Response] = []

    async def body(sandbox: httpx.AsyncClient) -> None:
        # A request of its own, as a server gets one: nothing of the turn in it.
        answers.append(
            await asyncio.get_running_loop().create_task(
                sandbox.post(SEND, json={"arguments": {}}),
                context=contextvars.Context(),
            )
        )

    entered = enter_visitor_run("visitor-1")
    try:
        await _runs_code(
            _rules(Person(), says_do_it),
            body,
            code="call_tool('google-workspace__search_gmail_messages', {})",
        )
    finally:
        leave_visitor_run(entered)
    assert server.called == []
    assert "Without an account" in answers[0].json()["error"]


class Stops(AbstractCapability[Any]):
    """Any other capability of the agent that refuses a tool call."""

    async def before_tool_execute(
        self, ctx: Any, *, call: Any, tool_def: Any, args: Any
    ) -> Any:
        if call.tool_name.endswith("search_gmail_messages"):
            raise RuntimeError("A check of the application stopped it.")
        return args


class Hides(AbstractCapability[Any]):
    """Any other capability of the agent that rewrites what a tool answered."""

    async def after_tool_execute(
        self, ctx: Any, *, call: Any, tool_def: Any, args: Any, result: Any
    ) -> Any:
        return "[hidden]" if call.tool_name != "execute_code" else result


@pytest.mark.asyncio
async def test_every_capability_of_the_agent_decides_not_only_its_rules(
    server: Server,
) -> None:
    answers: List[httpx.Response] = []

    async def body(sandbox: httpx.AsyncClient) -> None:
        answers.append(await sandbox.post(READ, json={"arguments": {}}))

    await _runs_code(_rules(Person()), body, others=[Stops()])
    assert server.called == []
    assert answers[0].json()["error"] == "A check of the application stopped it."


@pytest.mark.asyncio
async def test_what_a_capability_leaves_of_the_result_is_what_the_code_reads(
    server: Server,
) -> None:
    answers: List[httpx.Response] = []

    async def body(sandbox: httpx.AsyncClient) -> None:
        answers.append(await sandbox.post(READ, json={"arguments": {}}))

    await _runs_code(_rules(Person()), body, others=[Hides()])
    assert answers[0].json()["result"] == "[hidden]"


@pytest.mark.asyncio
async def test_a_person_who_answers_after_the_code_ended_makes_nothing(
    server: Server,
) -> None:
    """The bindings give up on a call the person left waiting: nothing is made late."""
    asked = asyncio.Event()
    answer = asyncio.Event()
    late: List[Any] = []

    async def slow(tool: str, args: Dict[str, Any], decision: Decision) -> None:
        asked.set()
        await answer.wait()

    async def body(sandbox: httpx.AsyncClient) -> None:
        late.append(asyncio.create_task(sandbox.post(SEND, json={"arguments": {}})))
        await asked.wait()

    rules = _rules(Person())
    rules.ask = slow
    await _runs_code(rules, body)
    answer.set()
    answered = await late[0]
    assert server.called == []
    assert answered.json()["success"] is False


@pytest.mark.asyncio
async def test_two_runs_at_once_only_read(server: Server) -> None:
    """Which run's code posted cannot be told, so no approval can be taken as its."""
    person = Person()
    started = asyncio.Event()
    release = asyncio.Event()
    answers: List[httpx.Response] = []

    async def first(sandbox: httpx.AsyncClient) -> None:
        started.set()
        await release.wait()

    async def second(sandbox: httpx.AsyncClient) -> None:
        await started.wait()
        answers.append(await sandbox.post(SEND, json={"arguments": {}}))
        answers.append(await sandbox.post(READ, json={"arguments": {}}))
        release.set()

    await asyncio.gather(
        _runs_code(_rules(person), first), _runs_code(_rules(person), second)
    )
    assert [answer.json()["success"] for answer in answers] == [False, True]
    assert [tool for tool, _ in server.called] == ["search_gmail_messages"]
    assert person.asked == []


@pytest.mark.asyncio
async def test_a_runtime_of_nobodys_deployment_is_as_it_was(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    running = Server()
    monkeypatch.setattr(
        mcp_proxy, "get_mcp_lifecycle_manager", lambda: Lifecycle(running)
    )
    forget_runtime_proof()
    async with _sandbox() as sandbox:
        answered = await sandbox.post(SEND, json={"arguments": {"to": "a@b.c"}})
    assert answered.json()["success"] is True
    assert len(running.called) == 1
