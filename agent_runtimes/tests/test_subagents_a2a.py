# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for delegation to separate agents over A2A, and for serving one."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest
from pydantic_ai import Agent
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.toolsets import FunctionToolset

from agent_runtimes.subagents import (
    A2ARemoteAgent,
    A2ARemoteTarget,
    SubagentDefinition,
    SubagentsCapability,
    build_subagents_capability,
)
from agent_runtimes.subagents import capability as capability_module
from agent_runtimes.subagents.a2a import (
    RelayOutcome,
    agent_name_for,
    local_agent_runtimes_url,
    relay_stream,
    resolve_launch,
    spec_id_of,
)
from agent_runtimes.types import A2ASubagentConfig, SubAgentsConfig, SubAgentspecConfig


def _remote(name: str = "researcher") -> SubagentDefinition:
    return SubagentDefinition(
        name=name,
        description="Facts, over A2A",
        a2a=A2ARemoteTarget(spec_id="example-a2a-researcher"),
    )


class TestDefinitions:
    def test_a_target_needs_somewhere_to_reach(self) -> None:
        with pytest.raises(ValueError):
            A2ARemoteTarget()

    def test_the_spec_id_drops_the_version(self) -> None:
        assert spec_id_of("example-a2a-researcher:0.0.1") == "example-a2a-researcher"
        assert spec_id_of("example-a2a-researcher") == "example-a2a-researcher"
        # A team's seat has a colon that is no version (O2-09).
        assert spec_id_of("team:jupyter/reviewer") == "team:jupyter/reviewer"
        assert spec_id_of(None) is None

    def test_the_launched_agent_name_is_a_slug(self) -> None:
        assert agent_name_for("Jupyter Writer") == "a2a-jupyter-writer"

    def test_a_config_with_a2a_makes_a_remote_definition(self) -> None:
        cfg = SubAgentsConfig(
            subagents=[
                SubAgentspecConfig(
                    name="researcher",
                    description="Facts",
                    ref="example-a2a-researcher:0.0.1",
                    a2a=A2ASubagentConfig(launch="local"),
                )
            ],
            include_general_purpose=False,
        )
        cap = build_subagents_capability(cfg, default_model="openai:gpt-4.1")
        assert cap is not None
        assert "researcher" in cap._remotes
        assert "researcher" not in cap._agents
        target = cap._remotes["researcher"].a2a
        assert target is not None
        assert target.spec_id == "example-a2a-researcher"
        assert target.launch == "local"
        instructions = cap.get_instructions()
        assert instructions is not None
        assert "researcher" in instructions
        assert "A2A" in instructions
        assert isinstance(cap.get_toolset(), FunctionToolset)

    def test_a_remote_with_neither_url_nor_ref_is_skipped(self) -> None:
        cfg = SubAgentsConfig(
            subagents=[
                SubAgentspecConfig(
                    name="ghost", description="Nowhere", a2a=A2ASubagentConfig()
                )
            ],
            include_general_purpose=False,
        )
        assert build_subagents_capability(cfg, default_model="openai:gpt-4.1") is None

    def test_a_remote_needs_no_model(self) -> None:
        cap = SubagentsCapability(
            subagents=[_remote()], default_model=None, include_general_purpose=False
        )
        assert cap.get_toolset() is not None


class TestLaunch:
    def test_auto_is_local_outside_a_runtime(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("DATALAYER_RUNTIME_ID", raising=False)
        assert resolve_launch("auto") == "local"
        assert resolve_launch(None) == "local"

    def test_auto_is_cloud_inside_a_runtime(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DATALAYER_RUNTIME_ID", "01ABC")
        assert resolve_launch("auto") == "cloud"
        assert resolve_launch("local") == "local"

    def test_the_local_url_follows_the_server_port(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("AGENT_RUNTIMES_URL", raising=False)
        monkeypatch.setenv("AGENT_RUNTIMES_HOST", "0.0.0.0")
        monkeypatch.setenv("AGENT_RUNTIMES_PORT", "9123")
        assert local_agent_runtimes_url() == "http://127.0.0.1:9123"


async def _responses(items: list[dict[str, Any]]):
    for item in items:
        yield item


def _status(state: str, message: dict[str, Any] | None = None) -> dict[str, Any]:
    status: dict[str, Any] = {"state": state}
    if message is not None:
        status["message"] = message
    return {
        "jsonrpc": "2.0",
        "id": "1",
        "result": {
            "status_update": {"task_id": "t1", "context_id": "c1", "status": status}
        },
    }


def _artifact(text: str, *, append: bool, last: bool) -> dict[str, Any]:
    return {
        "jsonrpc": "2.0",
        "id": "1",
        "result": {
            "artifact_update": {
                "task_id": "t1",
                "context_id": "c1",
                "artifact": {"artifact_id": "a1", "parts": [{"text": text}]},
                "append": append,
                "last_chunk": last,
            }
        },
    }


class TestRelay:
    @pytest.mark.asyncio
    async def test_a2a_events_become_subagent_phases(self) -> None:
        emitted: list[tuple[str, dict[str, Any]]] = []

        def emit(phase: str, **payload: Any) -> None:
            emitted.append((phase, payload))

        responses = [
            {
                "jsonrpc": "2.0",
                "id": "1",
                "result": {
                    "task": {
                        "id": "t1",
                        "context_id": "c1",
                        "status": {"state": "submitted"},
                    }
                },
            },
            _status("working"),
            _artifact("Hel", append=True, last=False),
            _status(
                "working",
                {
                    "role": "agent",
                    "message_id": "m1",
                    "parts": [
                        {
                            "data": {
                                "tool_call": {"name": "search", "arguments": {"q": "x"}}
                            }
                        }
                    ],
                },
            ),
            _status(
                "working",
                {
                    "role": "agent",
                    "message_id": "m2",
                    "parts": [
                        {"data": {"tool_result": {"name": "search", "result": "found"}}}
                    ],
                },
            ),
            _artifact("lo", append=True, last=False),
            _artifact("Hello", append=False, last=True),
            _status("completed"),
            # Past the terminal state: never read.
            _status("working"),
        ]
        outcome = await relay_stream(_responses(responses), emit)

        assert outcome.task_id == "t1"
        assert outcome.state == "completed"
        assert outcome.streamed == "Hello"
        assert outcome.final == "Hello"
        assert outcome.output == "Hello"
        assert [phase for phase, _ in emitted] == [
            "status",
            "status",
            "text",
            "tool_call",
            "status",
            "tool_result",
            "status",
            "text",
            "status",
        ]
        assert emitted[0][1] == {"taskId": "t1", "state": "submitted"}
        assert emitted[3][1] == {"toolName": "search", "toolArgs": {"q": "x"}}
        assert emitted[5][1] == {"toolName": "search", "result": "found"}

    @pytest.mark.asyncio
    async def test_a_jsonrpc_error_is_raised(self) -> None:
        responses = [
            {
                "jsonrpc": "2.0",
                "id": "1",
                "error": {"code": -32001, "message": "Task not found"},
            }
        ]
        with pytest.raises(RuntimeError, match="Task not found"):
            await relay_stream(_responses(responses), lambda *_a, **_k: None)

    @pytest.mark.asyncio
    async def test_a_final_status_keeps_its_metadata(self) -> None:
        """O1-07: which limit of a delegated model budget stopped the remote
        run travels on the final status, and reaches whoever follows it."""
        meta = {
            "datalayer": {
                "error": {
                    "code": "budget_exhausted",
                    "details": {"budget": "model", "limit": "output_tokens"},
                }
            }
        }
        emitted: list[tuple[str, dict[str, Any]]] = []
        responses = [
            _status("working"),
            _status(
                "failed",
                {
                    "role": "agent",
                    "message_id": "m9",
                    "parts": [{"text": "Exceeded the output_tokens_limit of 100"}],
                    "metadata": meta,
                },
            ),
        ]
        outcome = await relay_stream(
            _responses(responses),
            lambda phase, **payload: emitted.append((phase, payload)),
        )

        assert outcome.state == "failed" and outcome.metadata == meta
        assert outcome.detail == "Exceeded the output_tokens_limit of 100"
        assert emitted[-1][0] == "status"
        assert emitted[-1][1]["state"] == "failed"
        assert emitted[-1][1]["metadata"] == meta

    def test_the_output_prefers_the_whole_artifact(self) -> None:
        assert RelayOutcome(streamed="partial", final="whole").output == "whole"
        assert RelayOutcome(streamed="partial").output == "partial"


class TestDelegation:
    @pytest.mark.asyncio
    async def test_delegating_launches_once_and_says_it_is_a2a(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        launches: list[tuple[str, str | None]] = []

        async def fake_ensure(
            name: str, description: str, target: A2ARemoteTarget
        ) -> A2ARemoteAgent:
            launches.append((name, target.spec_id))
            return A2ARemoteAgent(
                name=name,
                url="http://127.0.0.1:8765/api/v1/a2a/agents/a2a-researcher",
                launch="local",
                card={"name": "Example A2A Researcher", "version": "1.0.0"},
            )

        async def fake_relay(
            remote: A2ARemoteAgent, task: str, *, context_id: str, emit: Any
        ) -> str:
            emit("text", text=f"notes about {task}")
            return f"notes about {task}"

        monkeypatch.setattr(capability_module, "ensure_remote_agent", fake_ensure)
        monkeypatch.setattr(capability_module, "relay_a2a_task", fake_relay)

        emitted: list[dict[str, Any]] = []
        from agent_runtimes import streams

        original = streams.enqueue_stream_message
        streams.enqueue_stream_message = lambda agent_id, message: emitted.append(  # type: ignore[assignment]
            message.payload
        )
        try:
            cap = SubagentsCapability(
                subagents=[_remote()],
                default_model=None,
                include_general_purpose=False,
                agent_id="parent",
            )
            calls = {"n": 0}

            def parent_model(
                messages: list[ModelMessage], info: AgentInfo
            ) -> ModelResponse:
                calls["n"] += 1
                if calls["n"] <= 2:
                    return ModelResponse(
                        parts=[
                            ToolCallPart(
                                tool_name="delegate_task",
                                args={
                                    "subagent_name": "researcher",
                                    "task": f"topic {calls['n']}",
                                },
                            )
                        ]
                    )
                return ModelResponse(parts=[TextPart(content="done")])

            agent = Agent(FunctionModel(parent_model), capabilities=[cap])
            result = await agent.run("research twice")
        finally:
            streams.enqueue_stream_message = original

        assert result.output == "done"
        # Launched on the first delegation, reused on the second.
        assert launches == [("researcher", "example-a2a-researcher")]
        assert [event["phase"] for event in emitted] == [
            "start", "status", "status", "text", "end",
            "start", "status", "text", "end",
        ]  # fmt: skip
        start = emitted[0]
        assert start["transport"] == "a2a"
        assert start["launch"] == "auto"
        assert start["task"] == "topic 1"
        ready = emitted[2]
        assert ready["state"] == "ready"
        assert ready["url"].endswith("/a2a-researcher")
        assert ready["agentCard"]["name"] == "Example A2A Researcher"
        end = emitted[4]
        assert end["transport"] == "a2a"
        assert end["output"] == "notes about topic 1"
        assert all(event["subagentName"] == "researcher" for event in emitted)


class TestStop:
    @pytest.mark.asyncio
    async def test_a_stopped_parent_run_says_so_on_the_transcript(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        async def fake_ensure(
            name: str, description: str, target: A2ARemoteTarget
        ) -> A2ARemoteAgent:
            return A2ARemoteAgent(
                name=name,
                url="http://127.0.0.1:8765/api/v1/a2a/agents/a2a-researcher",
                launch="local",
            )

        async def fake_relay(
            remote: A2ARemoteAgent, task: str, *, context_id: str, emit: Any
        ) -> str:
            emit("text", text="half an ans")
            raise asyncio.CancelledError()

        monkeypatch.setattr(capability_module, "ensure_remote_agent", fake_ensure)
        monkeypatch.setattr(capability_module, "relay_a2a_task", fake_relay)
        emitted: list[dict[str, Any]] = []
        from agent_runtimes import streams

        original = streams.enqueue_stream_message
        streams.enqueue_stream_message = lambda agent_id, message: emitted.append(  # type: ignore[assignment]
            message.payload
        )
        try:
            cap = SubagentsCapability(
                subagents=[_remote()],
                default_model=None,
                include_general_purpose=False,
                agent_id="parent",
            )
            toolset = cap.get_toolset()
            assert toolset is not None
            tool = toolset.tools["delegate_task"]
            ctx = type("Ctx", (), {"tool_call_id": "call-9", "usage": None})()
            with pytest.raises(asyncio.CancelledError):
                await tool.function(ctx, "researcher", "look it up")
        finally:
            streams.enqueue_stream_message = original

        last = emitted[-1]
        assert last["phase"] == "error"
        assert last["error"] == "Stopped."
        assert last["transport"] == "a2a"
        assert last["toolCallId"] == "call-9"

    @pytest.mark.asyncio
    async def test_a_cancelled_relay_tells_the_remote_to_stop(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import fasta2a.client as a2a_client

        from agent_runtimes.subagents import a2a as a2a_module

        class FakeClient:
            def __init__(self, *args: Any, **kwargs: Any) -> None:
                pass

            async def stream_message(self, message: Any):
                yield {
                    "jsonrpc": "2.0",
                    "id": "1",
                    "result": {
                        "task": {
                            "id": "t-42",
                            "context_id": "c",
                            "status": {"state": "submitted"},
                        }
                    },
                }
                raise asyncio.CancelledError()

        cancelled: list[tuple[str, str | None]] = []

        async def fake_cancel(remote: A2ARemoteAgent, task_id: str | None) -> None:
            cancelled.append((remote.url, task_id))

        monkeypatch.setattr(a2a_client, "A2AClient", FakeClient)
        monkeypatch.setattr(a2a_module, "cancel_remote_task", fake_cancel)
        remote = A2ARemoteAgent(
            name="researcher",
            url="http://127.0.0.1:8765/api/v1/a2a/agents/a2a-researcher",
            launch="local",
        )
        with pytest.raises(asyncio.CancelledError):
            await a2a_module.relay_a2a_task(
                remote, "look", context_id="c", emit=lambda *a, **k: None
            )
        assert cancelled == [(remote.url, "t-42")]

    def test_the_terminate_url_is_known_for_our_own_agents_only(self) -> None:
        ours = A2ARemoteAgent(
            name="r",
            url="http://127.0.0.1:8765/api/v1/a2a/agents/a2a-researcher",
            launch="local",
        )
        assert ours.terminate_url == "http://127.0.0.1:8765/api/v1/a2a/terminate"
        theirs = A2ARemoteAgent(
            name="r", url="https://agents.example.com/reviewer", launch="remote"
        )
        assert theirs.terminate_url is None


class TestEnsureAgent:
    class _Response:
        def __init__(self, status: int, payload: Any) -> None:
            self.status_code = status
            self._payload = payload
            self.content = b"x"
            self.text = ""

        def json(self) -> Any:
            return self._payload

    def test_an_agent_on_the_wanted_transport_is_kept(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from agent_runtimes.client import agent_client

        calls: list[tuple[str, str]] = []
        listing = {
            "agents": [
                {"id": "a2a-researcher", "name": "a2a-researcher", "protocol": "a2a"}
            ]
        }
        monkeypatch.setattr(
            agent_client.requests, "get", lambda url, **kw: self._Response(200, listing)
        )
        monkeypatch.setattr(
            agent_client.requests,
            "delete",
            lambda url, **kw: calls.append(("delete", url)),
        )
        monkeypatch.setattr(
            agent_client.requests, "post", lambda url, **kw: calls.append(("post", url))
        )

        agent_id = agent_client.ensure_local_agent(
            base_url="http://127.0.0.1:8765/",
            agent_name="a2a-researcher",
            token="",
            agent_spec_id="example-a2a-researcher",
            transport="a2a",
        )
        assert agent_id == "a2a-researcher"
        assert calls == []

    def test_an_agent_on_another_transport_is_replaced(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from agent_runtimes.client import agent_client

        calls: list[tuple[str, str]] = []
        listing = {
            "agents": [
                {
                    "id": "a2a-researcher",
                    "name": "a2a-researcher",
                    "protocol": "vercel-ai",
                }
            ]
        }
        monkeypatch.setattr(
            agent_client.requests, "get", lambda url, **kw: self._Response(200, listing)
        )

        def delete(url: str, **kw: Any) -> None:
            calls.append(("delete", url))

        def post(url: str, **kw: Any) -> Any:
            calls.append(("post", url))
            assert kw["json"]["transport"] == "a2a"
            return self._Response(200, {"id": "a2a-researcher"})

        monkeypatch.setattr(agent_client.requests, "delete", delete)
        monkeypatch.setattr(agent_client.requests, "post", post)

        agent_id = agent_client.ensure_local_agent(
            base_url="http://127.0.0.1:8765",
            agent_name="a2a-researcher",
            token="tok",
            agent_spec_id="example-a2a-researcher",
            transport="a2a",
        )
        assert agent_id == "a2a-researcher"
        assert calls == [
            ("delete", "http://127.0.0.1:8765/api/v1/agents/a2a-researcher"),
            ("post", "http://127.0.0.1:8765/api/v1/agents"),
        ]


class TestWorker:
    @staticmethod
    def _fake_agent(events_factory: Any, seen: list[tuple[str, Any]]) -> Any:
        from agent_runtimes.adapters.base import BaseAgent

        class FakeAgent(BaseAgent):
            async def run(self, prompt: str, context: Any) -> Any:  # pragma: no cover
                raise NotImplementedError

            async def stream(self, prompt: str, context: Any):
                seen.append((prompt, context))
                for event in events_factory():
                    yield event

            def get_tools(self) -> list[Any]:
                return []

            @property
            def name(self) -> str:
                return "fake"

            @property
            def description(self) -> str:
                return "A fake agent"

            @property
            def version(self) -> str:
                return "0.0.0"

        return FakeAgent()

    @staticmethod
    async def _run_through_the_broker(
        agent: Any, message: dict[str, Any]
    ) -> tuple[list[Any], Any, str]:
        """Submit a task the way FastA2A does — worker loop, broker, event bus — and collect its stream."""
        from fasta2a.broker import InMemoryBroker
        from fasta2a.storage import InMemoryStorage

        from agent_runtimes.transports.a2a import A2AWorker

        storage: InMemoryStorage[Any] = InMemoryStorage()
        broker = InMemoryBroker()
        worker = A2AWorker(broker=broker, storage=storage, agent=agent)
        task = await storage.submit_task("c1", message)  # type: ignore[arg-type]
        params = {
            "id": task["id"],
            "context_id": "c1",
            "message": message,
            "metadata": {"a2a.activated_extensions": ["urn:x"]},
        }
        events: list[Any] = []
        async with broker, worker.run():
            async with broker.event_bus.subscribe(task["id"]) as receive:
                await broker.run_task(params)  # type: ignore[arg-type]
                async for event in receive:
                    events.append(event)
        return events, storage, task["id"]

    @pytest.mark.asyncio
    async def test_the_worker_streams_the_adapter_and_completes_the_task(self) -> None:
        from agent_runtimes.adapters.base import StreamEvent, ToolCall

        seen: list[tuple[str, Any]] = []
        agent = self._fake_agent(
            lambda: [
                StreamEvent(type="text", data="Hel"),
                StreamEvent(
                    type="tool_call",
                    data=ToolCall(id="c1", name="search", arguments={"q": "x"}),
                ),
                StreamEvent(
                    type="tool_result",
                    data={"tool_call_id": "c1", "name": "search", "result": "found"},
                ),
                StreamEvent(type="text", data="lo"),
                StreamEvent(type="output", data="Hello"),
                StreamEvent(type="done", data=None),
            ],
            seen,
        )
        message = {
            "role": "user",
            "parts": [{"text": "hi there"}],
            "message_id": "m1",
            "context_id": "c1",
        }
        events, storage, task_id = await self._run_through_the_broker(agent, message)

        kinds = [
            "artifact"
            if "artifact_update" in event
            else event["status_update"]["status"]["state"]
            for event in events
        ]
        # The stream ended on its own: fasta2a published `completed` after the run.
        assert kinds == [
            "working",
            "artifact",
            "working",
            "working",
            "artifact",
            "artifact",
            "completed",
        ]
        chunks = [
            event["artifact_update"] for event in events if "artifact_update" in event
        ]
        assert [c["artifact"]["parts"][0]["text"] for c in chunks] == [
            "Hel",
            "lo",
            "Hello",
        ]
        assert [c["append"] for c in chunks] == [True, True, False]
        assert chunks[-1]["last_chunk"] is True
        tool_messages = [
            event["status_update"]["status"]["message"]["parts"][0]["data"]
            for event in events
            if "status_update" in event
            and "message" in event["status_update"]["status"]
        ]
        assert tool_messages[0]["tool_call"]["name"] == "search"
        assert tool_messages[1]["tool_result"]["result"] == "found"

        stored = await storage.load_task(task_id)
        assert stored is not None
        assert stored["status"]["state"] == "completed"
        assert stored["artifacts"][0]["parts"][0]["text"] == "Hello"
        context = await storage.load_context("c1")
        assert context is not None
        assert [m["role"] for m in context] == ["user", "agent"]

        prompt, agent_context = seen[0]
        assert prompt == "hi there"
        assert agent_context.session_id == "c1"
        assert agent_context.metadata["a2a"]["activated_extensions"] == ["urn:x"]

    @pytest.mark.asyncio
    async def test_a_failing_run_ends_the_stream_with_the_reason(self) -> None:
        from agent_runtimes.adapters.base import StreamEvent

        agent = self._fake_agent(
            lambda: [
                StreamEvent(type="text", data="Star"),
                StreamEvent(type="error", data="model went away"),
            ],
            [],
        )
        message = {
            "role": "user",
            "parts": [{"text": "hi"}],
            "message_id": "m2",
            "context_id": "c1",
        }
        events, storage, task_id = await self._run_through_the_broker(agent, message)

        final = events[-1]["status_update"]["status"]
        assert final["state"] == "failed"
        assert final["message"]["parts"][0]["text"] == "RuntimeError: model went away"
        # One failed status, not one from the worker and another from the base.
        assert [
            e["status_update"]["status"]["state"]
            for e in events
            if "status_update" in e
        ] == [
            "working",
            "failed",
        ]
        stored = await storage.load_task(task_id)
        assert stored is not None and stored["status"]["state"] == "failed"

    @pytest.mark.asyncio
    async def test_a_run_its_delegated_budget_stopped_says_which_limit(self) -> None:
        """O1-07: the budget the message carries reaches the run, and a limit
        reached comes back on the failed status, where the budget came from."""
        from agent_runtimes.adapters.base import StreamEvent
        from agent_runtimes.guardrails.model_budget import (
            ModelBudgetReached,
            refusal_meta,
        )

        said = ModelBudgetReached(
            "Exceeded the output_tokens_limit of 100 (output_tokens=150)",
            "output_tokens",
        )
        seen: list = []
        agent = self._fake_agent(
            lambda: [
                StreamEvent(type="text", data="Star"),
                StreamEvent(type="error", data=said),
            ],
            seen,
        )
        message = {
            "role": "user",
            "parts": [{"text": "hi"}],
            "message_id": "m3",
            "context_id": "c1",
            "metadata": {"datalayer": {"budget": {"outputTokens": 100}}},
        }
        events, storage, task_id = await self._run_through_the_broker(agent, message)

        _, agent_context = seen[0]
        assert agent_context.metadata["budget"] == {"outputTokens": 100}
        final = events[-1]["status_update"]["status"]
        assert final["state"] == "failed"
        assert final["message"]["metadata"] == refusal_meta(said)

    @pytest.mark.asyncio
    async def test_a_terminated_task_ends_canceled(self) -> None:
        from fasta2a.broker import InMemoryBroker
        from fasta2a.storage import InMemoryStorage

        from agent_runtimes.adapters.base import StreamEvent
        from agent_runtimes.transports.a2a import A2AWorker, TaskCancellation

        events_registry: dict[str, asyncio.Event] = {}
        cancellation = TaskCancellation(
            register=lambda task_id: events_registry.setdefault(
                task_id, asyncio.Event()
            ),
            unregister=lambda task_id: events_registry.pop(task_id, None) and None,
            cancel=lambda task_id: bool(events_registry[task_id].set()) or True,
        )

        def stream_events():
            yield StreamEvent(type="text", data="Star")
            # Terminated from outside between two chunks.
            for event in events_registry.values():
                event.set()
            yield StreamEvent(type="text", data="t of an answer")
            yield StreamEvent(type="output", data="never sent")

        agent = self._fake_agent(stream_events, [])
        storage: InMemoryStorage[Any] = InMemoryStorage()
        broker = InMemoryBroker()
        worker = A2AWorker(
            broker=broker, storage=storage, agent=agent, cancellation=cancellation
        )
        message = {
            "role": "user",
            "parts": [{"text": "hi"}],
            "message_id": "m3",
            "context_id": "c1",
        }
        task = await storage.submit_task("c1", message)  # type: ignore[arg-type]
        params = {"id": task["id"], "context_id": "c1", "message": message}
        events: list[Any] = []
        async with broker, worker.run():
            async with broker.event_bus.subscribe(task["id"]) as receive:
                await broker.run_task(params)  # type: ignore[arg-type]
                async for event in receive:
                    events.append(event)

        final = events[-1]["status_update"]["status"]
        assert final["state"] == "canceled"
        assert final["message"]["parts"][0]["text"] == "Stopped."
        stored = await storage.load_task(task["id"])
        assert stored is not None and stored["status"]["state"] == "canceled"
        assert events_registry == {}, "the task was unregistered when it ended"
