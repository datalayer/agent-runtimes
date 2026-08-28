# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for least-privilege frontend tool bundles."""

from __future__ import annotations

from agent_runtimes.specs.agents.agents import AGENTSPECS
from agent_runtimes.specs.toolsets import resolve_allowed_tools, resolve_toolset


class TestResolve:
    def test_all_means_everything_the_toolset_has(self) -> None:
        # The bundle does not know the names, and does not need to.
        assert resolve_toolset("jupyter-notebook") is None

    def test_a_named_bundle_grants_exactly_its_list(self) -> None:
        assert resolve_toolset("jupyter-notebook-read") == ("readCell", "readAllCells")

    def test_a_versioned_reference_resolves(self) -> None:
        assert resolve_toolset("jupyter-notebook-read:0.0.1") == (
            "readCell",
            "readAllCells",
        )

    def test_an_unknown_bundle_grants_nothing_special(self) -> None:
        assert resolve_toolset("does-not-exist") is None

    def test_bundles_union(self) -> None:
        assert resolve_allowed_tools(
            ["jupyter-notebook-read", "jupyter-notebook-propose"]
        ) == ("readCell", "readAllCells", "proposeCellUpdate", "runCell")

    def test_asking_for_everything_wins(self) -> None:
        # Narrowing is opting out; it should not happen by accident.
        assert (
            resolve_allowed_tools(["jupyter-notebook", "jupyter-notebook-read"]) is None
        )


class TestTheSpecialists:
    def test_the_reproducer_cannot_edit(self) -> None:
        allowed = resolve_allowed_tools(
            AGENTSPECS["jupyter-notebook-reproducer"].frontend_tools
        )

        assert allowed == ("readCell", "readAllCells")
        # It reports; it does not repair.
        assert "updateCell" not in (allowed or ())

    def test_the_fixer_proposes_and_cannot_apply(self) -> None:
        allowed = resolve_allowed_tools(AGENTSPECS["jupyter-cell-fixer"].frontend_tools)

        assert "proposeCellUpdate" in (allowed or ())
        assert "updateCell" not in (allowed or ())
        assert "deleteCells" not in (allowed or ())

    def test_the_compactor_may_edit_but_not_delete(self) -> None:
        allowed = resolve_allowed_tools(
            AGENTSPECS["jupyter-notebook-compactor"].frontend_tools
        )

        assert "updateCell" in (allowed or ())
        assert "deleteCells" not in (allowed or ())

    def test_the_base_agent_keeps_everything(self) -> None:
        # The generalist is not narrowed; only the specialists are.
        assert resolve_allowed_tools(AGENTSPECS["loop-base"].frontend_tools) is None

    def test_the_narrowing_survived_composition(self) -> None:
        # The fragment grants the full notebook bundle; `!remove` takes it back.
        assert AGENTSPECS["jupyter-cell-fixer"].frontend_tools == [
            "jupyter-notebook-propose:0.0.1"
        ]
