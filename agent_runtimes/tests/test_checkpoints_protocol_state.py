# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A checkpoint that outlives its process, kept per execution (ORCHESTRATOR.md, O2-05).

Each store here is a fresh object over the same SQLite file, the way a
restarted process — or another process of the same runtime — reads it.
"""

from __future__ import annotations

from typing import Any

import pytest

from agent_runtimes.checkpoints.protocol_state import ProtocolStateCheckpointStore
from agent_runtimes.protocol_state.store import SqliteProtocolStateStore

MESSAGES = [
    {"role": "user", "content": "Profile the notebook"},
    {"role": "assistant", "content": "Reading its cells"},
]


@pytest.fixture
def path(tmp_path: Any) -> Any:
    return tmp_path / "state.sqlite"


def _store(path: Any, scope: str = "exec_1") -> ProtocolStateCheckpointStore:
    return ProtocolStateCheckpointStore(scope, SqliteProtocolStateStore(path))


@pytest.mark.asyncio
async def test_a_checkpoint_is_read_back_by_another_process(path: Any) -> None:
    made = await _store(path).create_checkpoint("paused", turn=2, messages=MESSAGES, metadata={"attempt": "att_1"})
    again = await _store(path).get(made.id)
    assert again is not None
    assert (again.label, again.turn, again.messages, again.metadata) == ("paused", 2, MESSAGES, {"attempt": "att_1"})


@pytest.mark.asyncio
async def test_one_execution_never_reads_anothers(path: Any) -> None:
    mine, other = _store(path, "exec_1"), _store(path, "exec_10")
    made = await mine.create_checkpoint("mine", turn=1, messages=MESSAGES)
    await other.create_checkpoint("theirs", turn=1, messages=MESSAGES)
    assert [checkpoint.label for checkpoint in await mine.list_all()] == ["mine"]
    assert await other.get(made.id) is None


@pytest.mark.asyncio
async def test_newest_first_and_pruned_within_its_own_execution(path: Any) -> None:
    mine, other = _store(path, "exec_1"), _store(path, "exec_2")
    await other.create_checkpoint("theirs", turn=1, messages=MESSAGES)
    for turn in range(1, 5):
        await mine.create_checkpoint(f"turn-{turn}", turn=turn, messages=MESSAGES, max_checkpoints=3)
    assert [checkpoint.label for checkpoint in await mine.list_all()] == ["turn-4", "turn-3", "turn-2"]
    assert [checkpoint.label for checkpoint in await other.list_all()] == ["theirs"]


@pytest.mark.asyncio
async def test_deleting_one_leaves_the_others(path: Any) -> None:
    store = _store(path)
    first = await store.create_checkpoint("first", turn=1, messages=MESSAGES)
    second = await store.create_checkpoint("second", turn=2, messages=MESSAGES)
    await _store(path).delete(first.id)
    assert [checkpoint.id for checkpoint in await store.list_all()] == [second.id]


@pytest.mark.parametrize("scope", ["", "exec/1"])
def test_a_durable_checkpoint_belongs_to_an_execution(scope: str) -> None:
    with pytest.raises(ValueError):
        ProtocolStateCheckpointStore(scope)


def test_the_factory_makes_one_for_an_execution() -> None:
    from agent_runtimes.checkpoints.store import create_checkpoint_store

    store = create_checkpoint_store("protocol_state", scope="exec_1")
    assert isinstance(store, ProtocolStateCheckpointStore) and store.scope == "exec_1"


@pytest.mark.asyncio
async def test_the_middleware_and_the_tools_work_over_it_across_processes(path: Any) -> None:
    """The port is the same, so what the capability snapshots and what the
    model's tools save, list and rewind to are one execution's, whichever
    process of the runtime reads them."""
    from agent_runtimes.checkpoints.config import CheckpointConfig
    from agent_runtimes.checkpoints.middleware import AutoCheckpointMiddleware
    from agent_runtimes.checkpoints.tools import (
        list_checkpoints_tool_fn,
        rewind_to_tool_fn,
        save_checkpoint_tool_fn,
    )

    config = CheckpointConfig(enabled=True, frequency="every_turn", store="protocol_state")
    first = AutoCheckpointMiddleware(config, store=_store(path))
    await first.on_turn_start(MESSAGES[:1])
    await save_checkpoint_tool_fn(first)["function"]("before-modelling")
    await first.on_turn_end(MESSAGES)

    restarted = AutoCheckpointMiddleware(config, store=_store(path))
    listing = await list_checkpoints_tool_fn(restarted)["function"]()
    assert "'before-modelling'" in listing
    [saved] = [checkpoint for checkpoint in await restarted.list_checkpoints() if checkpoint.label == "before-modelling"]
    answer = await rewind_to_tool_fn(restarted)["function"](saved.id, "the plots were wrong")
    assert "Rewinding to 'before-modelling'" in answer
    assert restarted.take_pending_rewind().id == saved.id
