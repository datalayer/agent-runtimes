# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for the Phase 0 execution store (PLAN_ORCHESTRATOR.md, O0-04).

What is being proved is not that a dictionary can hold a record. It is that
the rules live in one place: the lifecycle decides a state change, an
observation from a worker cannot talk an execution out of a terminal state,
a duplicate delivery finds the first execution, and an event carries the
correlation that makes it placeable in a tree afterwards.

The tests themselves are the port's contract (`orchestration/contract.py`),
so the Solr store of the control plane runs the same ones.
"""

from __future__ import annotations

from agent_runtimes.orchestration.contract import ExecutionStoreContract
from agent_runtimes.orchestration.store import InMemoryExecutionStore


class TestInMemoryExecutionStore(ExecutionStoreContract):
    def make_store(self) -> InMemoryExecutionStore:
        return InMemoryExecutionStore()
