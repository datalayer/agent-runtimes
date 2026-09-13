# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A gateway-started run recorded as its own execution (ORCHESTRATOR.md, O4-05)."""

from __future__ import annotations

import pytest

from agent_runtimes.orchestration.shadow import (
    close_shadow_execution,
    open_shadow_execution,
    shadow_idempotency_key,
)
from agent_runtimes.orchestration.store import InMemoryExecutionStore
from datalayer_core.orchestration import AgentProtocol, ExecutionState


@pytest.fixture
def store() -> InMemoryExecutionStore:
    return InMemoryExecutionStore()


class TestOpeningAShadow:
    async def test_it_is_a_root_already_running_with_one_open_attempt(self, store):
        execution = await open_shadow_execution(store, tool="execute_cell", task_uid="tsk_abc")
        assert execution.execution_id.startswith("exec_")
        assert execution.root_execution_id == execution.execution_id
        assert execution.parent_execution_id is None
        assert execution.status is ExecutionState.RUNNING
        assert execution.agent.agent_id == "mcp:execute_cell"
        assert execution.agent.capability == "execute_cell"
        assert execution.agent.protocol is AgentProtocol.DATALAYER
        assert "tsk_abc" in execution.objective.goal

        attempts = await store.attempts(execution.execution_id)
        assert len(attempts) == 1
        assert attempts[0].number == 1 and attempts[0].started_at is not None
        assert attempts[0].attempt_id == f"att_{execution.execution_id.removeprefix('exec_')}_1"

    async def test_a_retried_call_finds_the_same_shadow_rather_than_a_second_one(self, store):
        first = await open_shadow_execution(store, tool="execute_cell", task_uid="tsk_retry")
        second = await open_shadow_execution(store, tool="execute_cell", task_uid="tsk_retry")
        assert first.execution_id == second.execution_id
        assert len(await store.attempts(first.execution_id)) == 1

    async def test_two_different_tasks_are_two_different_shadows(self, store):
        one = await open_shadow_execution(store, tool="execute_cell", task_uid="tsk_1")
        other = await open_shadow_execution(store, tool="execute_cell", task_uid="tsk_2")
        assert one.execution_id != other.execution_id

    async def test_the_idempotency_key_is_the_task_uid_scoped_to_shadows(self, store):
        execution = await open_shadow_execution(store, tool="execute_cell", task_uid="tsk_key")
        found = await store.find_by_idempotency_key(shadow_idempotency_key("tsk_key"))
        assert found is not None and found.execution_id == execution.execution_id


class TestClosingAShadow:
    async def test_completed_closes_the_execution_and_its_attempt(self, store):
        execution = await open_shadow_execution(store, tool="execute_cell", task_uid="tsk_ok")
        ended = await close_shadow_execution(store, task_uid="tsk_ok", outcome="completed")
        assert ended is not None
        assert ended.status is ExecutionState.COMPLETED
        [attempt] = await store.attempts(execution.execution_id)
        assert attempt.ended_at is not None and attempt.state is ExecutionState.COMPLETED

    async def test_failed_and_cancelled_map_to_their_own_terminal_states(self, store):
        await open_shadow_execution(store, tool="execute_cell", task_uid="tsk_fail")
        failed = await close_shadow_execution(store, task_uid="tsk_fail", outcome="failed")
        assert failed is not None and failed.status is ExecutionState.FAILED

        await open_shadow_execution(store, tool="execute_cell", task_uid="tsk_cancel")
        cancelled = await close_shadow_execution(store, task_uid="tsk_cancel", outcome="cancelled")
        assert cancelled is not None and cancelled.status is ExecutionState.CANCELLED

    async def test_a_task_uid_naming_no_shadow_answers_none_not_a_failure(self, store):
        # Every task never routed to durable at all — the overwhelming
        # majority of MCP tool calls — names no shadow, and that is the
        # ordinary case, not an error to raise or log.
        assert await close_shadow_execution(store, task_uid="tsk_never_shadowed", outcome="completed") is None

    async def test_closing_twice_is_answered_from_the_terminal_row_it_already_is(self, store):
        await open_shadow_execution(store, tool="execute_cell", task_uid="tsk_twice")
        first = await close_shadow_execution(store, task_uid="tsk_twice", outcome="completed")
        second = await close_shadow_execution(store, task_uid="tsk_twice", outcome="completed")
        assert first is not None and second is not None
        assert first.status is second.status is ExecutionState.COMPLETED
