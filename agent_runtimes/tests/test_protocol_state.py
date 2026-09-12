# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What a runtime keeps of its protocols across restarts (ORCHESTRATOR.md, O1-11).

The store, and where it is; A2A tasks, their context and the work still owed;
ACP sessions and their conversations. Each record is read back by a fresh
object over the same file, the way a restarted process reads it.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from agent_runtimes.adapters.base import AgentContext
from agent_runtimes.protocol_state import acp as sessions
from agent_runtimes.protocol_state.a2a import OWED, DurableBroker, DurableStorage
from agent_runtimes.protocol_state.store import (
    PostgresProtocolStateStore,
    SqliteProtocolStateStore,
    create_protocol_state_store,
)
from agent_runtimes.transports.acp import ACPSession

AGENT_MEMORIES = (
    "DATALAYER_POSTGRESQL_AGENT_MEMORIES_URI",
    "DATALAYER_POSTGRESQL_AGENT_MEMORIES_PASSWORD",
    "DATALAYER_POSTGRESQL_AGENT_MEMORIES_USER",
    "DATALAYER_POSTGRESQL_AGENT_MEMORIES_HOST",
    "DATALAYER_POSTGRESQL_AGENT_MEMORIES_DATABASE",
    "DATALAYER_POSTGRESQL_AGENT_MEMORIES_PORT",
)


@pytest.fixture
def store(tmp_path: Any) -> SqliteProtocolStateStore:
    return SqliteProtocolStateStore(tmp_path / "state.sqlite")


def a_message(message_id: str, text: str = "Profile the notebook") -> dict[str, Any]:
    return {"role": "user", "parts": [{"text": text}], "message_id": message_id}


class TestTheStore:
    @pytest.mark.asyncio
    async def test_a_record_is_kept_replaced_listed_by_prefix_and_deleted(
        self, store: SqliteProtocolStateStore, tmp_path: Any
    ) -> None:
        await store.put("a2a.task", "agent-1/t1", {"state": "submitted"})
        await store.put("a2a.task", "agent-1/t1", {"state": "working"})
        await store.put("a2a.task", "agent-2/t2", {"state": "working"})
        again = SqliteProtocolStateStore(tmp_path / "state.sqlite")
        assert await again.get("a2a.task", "agent-1/t1") == {"state": "working"}
        assert await again.list("a2a.task", prefix="agent-1/") == [{"state": "working"}]
        assert len(await again.list("a2a.task")) == 2
        await again.delete("a2a.task", "agent-1/t1")
        await again.delete("a2a.task", "agent-1/t1")
        assert await store.get("a2a.task", "agent-1/t1") is None

    def test_on_kubernetes_it_is_the_agent_memories_postgres_and_elsewhere_a_file(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Any
    ) -> None:
        for name in (*AGENT_MEMORIES, "KUBERNETES_SERVICE_HOST"):
            monkeypatch.delenv(name, raising=False)
        monkeypatch.setenv("AGENT_RUNTIMES_PROTOCOL_STATE_PATH", str(tmp_path / "local.sqlite"))
        assert isinstance(create_protocol_state_store(), SqliteProtocolStateStore)
        monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "10.0.0.1")
        monkeypatch.setenv("DATALAYER_POSTGRESQL_AGENT_MEMORIES_HOST", "agent-memories.datalayer")
        monkeypatch.setenv("DATALAYER_POSTGRESQL_AGENT_MEMORIES_PASSWORD", "not-a-real-password")
        chosen = create_protocol_state_store()
        assert isinstance(chosen, PostgresProtocolStateStore)
        assert "host=agent-memories.datalayer" in chosen._conninfo


class TestA2ATasks:
    @pytest.mark.asyncio
    async def test_a_task_its_history_and_its_context_outlive_the_storage_that_made_them(
        self, store: SqliteProtocolStateStore
    ) -> None:
        first = DurableStorage(store, "agent-1")
        task = await first.submit_task("ctx-1", a_message("m1"))  # type: ignore[arg-type]
        reply = {"role": "agent", "parts": [{"text": "It profiles cleanly."}], "message_id": "m2"}
        await first.update_task(task["id"], "working", new_messages=[reply])  # type: ignore[list-item]
        await first.update_context("ctx-1", [a_message("m1"), reply])

        again = DurableStorage(store, "agent-1")
        loaded = await again.load_task(task["id"])
        assert loaded is not None and loaded["status"]["state"] == "working"
        assert [message["message_id"] for message in loaded["history"]] == ["m1", "m2"]
        assert await again.load_context("ctx-1") == [a_message("m1"), reply]
        assert await DurableStorage(store, "agent-2").load_task(task["id"]) is None, "one agent's tasks"

    @pytest.mark.asyncio
    async def test_the_work_left_unfinished_is_run_again_and_what_ended_is_not(
        self, store: SqliteProtocolStateStore
    ) -> None:
        storage = DurableStorage(store, "agent-1")
        running = await storage.submit_task("ctx-1", a_message("m1"))  # type: ignore[arg-type]
        finished = await storage.submit_task("ctx-1", a_message("m2"))  # type: ignore[arg-type]

        def run_of(task: Any) -> Any:
            return {"id": task["id"], "context_id": "ctx-1", "message": task["history"][0]}

        first = DurableBroker(store, "agent-1")
        received: list[str] = []
        async with first:
            async def consume() -> None:
                async for operation in first.receive_task_operations():
                    received.append(operation["params"]["id"])
                    if len(received) == 2:
                        return

            consumer = asyncio.create_task(consume())
            await first.run_task(run_of(running))
            await first.run_task(run_of(finished))
            await asyncio.wait_for(consumer, 5)
        assert received == [running["id"], finished["id"]], "each run handed over once"
        await storage.update_task(running["id"], "working")
        await storage.update_task(finished["id"], "completed")

        # The process that replaces this one owes what was left working, and only that.
        second = DurableBroker(store, "agent-1")
        async with second:
            operations = second.receive_task_operations()
            owed = await asyncio.wait_for(operations.__anext__(), 5)
        assert (owed["operation"], owed["params"]["id"]) == ("run", running["id"])
        assert await store.get(OWED, f"agent-1/{finished['id']}") is None


class TestACPSessions:
    @pytest.mark.asyncio
    async def test_a_session_and_its_conversation_outlive_the_process(
        self, store: SqliteProtocolStateStore
    ) -> None:
        session = ACPSession(
            id="sess-1",
            cwd="/work",
            context=AgentContext(session_id="sess-1", user_id="u-1"),
            agent_id="coder",
            metadata={"origin": "test"},
        )
        await sessions.save_session(session, store)
        await sessions.append_turn("sess-1", "user", "Profile the notebook", store)
        await sessions.append_turn("sess-1", "agent", "It profiles cleanly.", store)

        loaded = await sessions.load_session("sess-1", store)
        assert loaded is not None
        assert (loaded.cwd, loaded.agent_id, loaded.context.user_id, loaded.metadata) == (
            "/work",
            "coder",
            "u-1",
            {"origin": "test"},
        )
        assert [(turn["role"], turn["text"]) for turn in await sessions.turns("sess-1", store)] == [
            ("user", "Profile the notebook"),
            ("agent", "It profiles cleanly."),
        ]
        assert (await sessions.set_session_status("sess-1", "disconnected", store)).status == "disconnected"
        assert [one.id for one in await sessions.list_sessions(store)] == ["sess-1"]
        assert await sessions.close_session("sess-1", store) is True
        assert await sessions.load_session("sess-1", store) is None
        assert await sessions.turns("sess-1", store) == []
        assert await sessions.close_session("sess-1", store) is False
