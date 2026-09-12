# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The credential a delegation hands its worker, for the run (ORCHESTRATOR.md, O1-17).

The control plane puts the execution's token beside the model budget; the
worker takes it out of the message before anything keeps the message, holds it
for the run, and reaches the Datalayer MCP gateway with it instead of with the
process's key. A run a restarted runtime owes has lost it, and fails.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from pydantic_ai.mcp import MCPToolset

from agent_runtimes.context.delegation import WITHHELD, hold, release, take_credential, was_delegated
from agent_runtimes.mcp import datalayer_gateway
from agent_runtimes.mcp.datalayer_gateway import toolsets_for_the_run
from agent_runtimes.orchestration.budget import delegation_meta
from agent_runtimes.protocol_state.a2a import DurableStorage
from agent_runtimes.protocol_state.store import SqliteProtocolStateStore
from agent_runtimes.tests.orchestration_records import an_execution

TOKEN = "eyJhbGciOiJIUzI1NiJ9.the-executions-token.signature"
BUDGET = {"inputTokens": 5}


class TestTheDelegationCarriesIt:
    def test_under_datalayer_beside_the_budget(self) -> None:
        meta = delegation_meta(an_execution(), credential=TOKEN)
        assert meta is not None and meta["datalayer"]["credential"] == TOKEN

    def test_no_credential_and_no_budget_is_nothing(self) -> None:
        assert delegation_meta(an_execution()) is None


class TestTheWorkerTakesItOut:
    def test_out_of_the_metadata_in_place_leaving_that_one_was_sent(self) -> None:
        meta: dict[str, Any] = {"datalayer": {"credential": TOKEN, "budget": BUDGET}}
        assert take_credential(meta) == TOKEN
        assert meta == {"datalayer": {"credential": WITHHELD, "budget": BUDGET}}
        assert was_delegated(meta)

    @pytest.mark.parametrize(
        "meta",
        (
            None,
            {},
            {"datalayer": {}},
            {"datalayer": {"credential": ""}},
            {"datalayer": {"credential": WITHHELD}},
            {"datalayer": "credential"},
        ),
    )
    def test_a_delegation_with_none_carries_none(self, meta: Any) -> None:
        assert take_credential(meta) is None

    def test_a_delegation_without_one_was_not_delegated_one(self) -> None:
        assert not was_delegated({"datalayer": {"budget": BUDGET}}) and not was_delegated(None)

    def test_held_for_its_run_and_forgotten_once_taken(self) -> None:
        hold("task-held", TOKEN)
        assert release("task-held") == TOKEN
        assert release("task-held") is None


def _delegated_message() -> dict[str, Any]:
    return {
        "role": "user",
        "parts": [{"text": "Profile the notebook"}],
        "message_id": "m-1",
        "context_id": "c1",
        "metadata": {"datalayer": {"credential": TOKEN, "budget": BUDGET}},
    }


def _storage(tmp_path: Any) -> DurableStorage:
    return DurableStorage(SqliteProtocolStateStore(tmp_path / "state.sqlite"), "agent-1")


def _nothing_kept(tmp_path: Any) -> None:
    for path in tmp_path.iterdir():
        assert TOKEN.encode() not in path.read_bytes(), path.name


@pytest.mark.asyncio
async def test_a_submitted_task_keeps_no_credential(tmp_path: Any) -> None:
    """Not in the task, not in the file: the run takes it from process memory."""
    storage = _storage(tmp_path)
    task = await storage.submit_task("c1", _delegated_message())  # type: ignore[arg-type]
    kept = await storage.load_task(task["id"])
    assert TOKEN not in json.dumps(kept)
    assert kept["history"][0]["metadata"] == {"datalayer": {"credential": WITHHELD, "budget": BUDGET}}
    _nothing_kept(tmp_path)
    assert release(task["id"]) == TOKEN


def _worker_agent(seen: dict[str, Any]) -> Any:
    from agent_runtimes.adapters.base import BaseAgent, StreamEvent
    from agent_runtimes.context.identities import get_request_user_jwt

    class Worker(BaseAgent):
        async def run(self, prompt: str, context: Any) -> Any:  # pragma: no cover
            raise NotImplementedError

        async def stream(self, prompt: str, context: Any):  # type: ignore[override]
            seen["user_token"] = context.metadata.get("user_token")
            seen["jwt"] = get_request_user_jwt()
            yield StreamEvent(type="output", data="done")
            yield StreamEvent(type="done", data=None)

        def get_tools(self) -> list[Any]:
            return []

        @property
        def name(self) -> str:
            return "worker"

        @property
        def description(self) -> str:
            return "An orchestration worker"

        @property
        def version(self) -> str:
            return "0.0.0"

    return Worker()


async def _run(storage: DurableStorage, agent: Any, task_id: str, message: dict[str, Any]) -> None:
    from fasta2a.broker import InMemoryBroker

    from agent_runtimes.transports.a2a import A2AWorker

    broker = InMemoryBroker()
    worker = A2AWorker(broker=broker, storage=storage, agent=agent)
    params = {"id": task_id, "context_id": "c1", "message": message}
    async with broker, worker.run():
        async with broker.event_bus.subscribe(task_id) as receive:
            await broker.run_task(params)  # type: ignore[arg-type]
            async for _event in receive:
                pass


@pytest.mark.asyncio
async def test_the_a2a_worker_runs_as_the_delegated_credential(tmp_path: Any) -> None:
    """Taken out of the message at submission, put on the run, and kept nowhere."""
    storage, seen = _storage(tmp_path), {}
    message = _delegated_message()
    task = await storage.submit_task("c1", message)  # type: ignore[arg-type]
    await _run(storage, _worker_agent(seen), task["id"], message)
    assert seen == {"user_token": TOKEN, "jwt": TOKEN}
    assert TOKEN not in json.dumps(await storage.load_task(task["id"]))
    assert TOKEN not in json.dumps(await storage.load_context("c1"))
    _nothing_kept(tmp_path)


@pytest.mark.asyncio
async def test_a_run_whose_credential_did_not_survive_a_restart_fails_unstarted(tmp_path: Any) -> None:
    """Owed after a restart: run as the runtime, it would reach whatever the runtime's key does."""
    storage, seen = _storage(tmp_path), {}
    message = _delegated_message()
    task = await storage.submit_task("c1", message)  # type: ignore[arg-type]
    release(task["id"])  # The process that held it is gone.
    await _run(storage, _worker_agent(seen), task["id"], message)
    assert seen == {}, "the agent never ran"
    assert (await storage.load_task(task["id"]))["status"]["state"] == "failed"


class TestTheGatewayIsReachedAsTheRun:
    def test_the_process_server_gives_way_to_one_holding_the_runs_token(self, monkeypatch: Any) -> None:
        seen: dict[str, Any] = {}

        def client(headers: dict[str, str] | None = None, **kwargs: Any) -> httpx.AsyncClient:
            seen["headers"] = dict(headers or {})
            return httpx.AsyncClient(headers=headers)

        monkeypatch.setattr(datalayer_gateway, "tracing_client", client)
        monkeypatch.setenv("DATALAYER_JUPYTER_MCP_SERVER_URL", "http://localhost:4404/mcp/")
        chart = SimpleNamespace(id="chart")
        process = SimpleNamespace(id="datalayer")
        toolsets = toolsets_for_the_run([chart, process], TOKEN)
        assert toolsets[0] is chart and process not in toolsets
        [gateway] = toolsets[1:]
        assert isinstance(gateway, MCPToolset) and gateway.id == "datalayer"
        assert seen["headers"] == {"Authorization": f"Bearer {TOKEN}"}
        assert datalayer_gateway.gateway_url() == "http://localhost:4404/mcp"

    def test_the_chat_commands_server_gives_way_too(self) -> None:
        command = SimpleNamespace(id="datalayer-jupyter-mcp")
        [gateway] = toolsets_for_the_run([command], TOKEN)
        assert isinstance(gateway, MCPToolset)

    def test_an_agent_not_given_the_gateway_is_not_given_it_by_a_delegation(self) -> None:
        chart = SimpleNamespace(id="chart")
        assert toolsets_for_the_run([chart], TOKEN) == [chart]


class TestTheAdapterBuildsTheRunsToolset:
    """`user_token` is the run's own identity, as the one-shot invoker already sets it."""

    def _adapter(self, monkeypatch: Any, agent: Any) -> Any:
        from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter

        adapter = PydanticAIAdapter(agent, name="test-adapter", agent_id="agent-1")

        async def process_toolsets() -> list[Any]:
            return [SimpleNamespace(id="datalayer")]

        monkeypatch.setattr(adapter, "_get_runtime_toolsets_async", process_toolsets)
        return adapter

    @pytest.mark.asyncio
    async def test_a_run_with_its_own_token_reaches_the_gateway_with_it(self, monkeypatch: Any) -> None:
        from agent_runtimes.adapters.base import AgentContext
        from agent_runtimes.tests.test_pydantic_ai_adapter_model_budget import _Agent

        agent = _Agent()
        await self._adapter(monkeypatch, agent).run("go", AgentContext(session_id="s1", metadata={"user_token": TOKEN}))
        [gateway] = agent.calls[0]["toolsets"]
        assert isinstance(gateway, MCPToolset) and gateway.id == "datalayer"

    @pytest.mark.asyncio
    async def test_a_stream_does_the_same(self, monkeypatch: Any) -> None:
        from agent_runtimes.adapters.base import AgentContext
        from agent_runtimes.tests.test_pydantic_ai_adapter_model_budget import _Agent

        agent = _Agent(raises=RuntimeError("stopped once its toolsets were seen"))
        adapter = self._adapter(monkeypatch, agent)
        [event async for event in adapter.stream("go", AgentContext(session_id="s1", metadata={"user_token": TOKEN}))]
        [gateway] = agent.calls[0]["toolsets"]
        assert isinstance(gateway, MCPToolset)

    @pytest.mark.asyncio
    async def test_a_run_without_one_keeps_the_process_server(self, monkeypatch: Any) -> None:
        from agent_runtimes.adapters.base import AgentContext
        from agent_runtimes.tests.test_pydantic_ai_adapter_model_budget import _Agent

        agent = _Agent()
        await self._adapter(monkeypatch, agent).run("go", AgentContext(session_id="s1"))
        [process] = agent.calls[0]["toolsets"]
        assert process.id == "datalayer" and not isinstance(process, MCPToolset)
