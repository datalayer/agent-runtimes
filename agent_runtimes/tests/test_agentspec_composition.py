# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for composing and extending agent specs (D29) and subagent refs."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "codegen"))

from compose import (  # noqa: E402
    CompositionError,
    merge_lists,
    merge_spec,
    resolve_all,
    resolve_spec,
)


class TestMergeLists:
    def test_appends_and_deduplicates(self) -> None:
        # The common case is "the parent's tools plus mine".
        assert merge_lists(["a", "b"], ["b", "c"]) == ["a", "b", "c"]

    def test_a_version_does_not_make_it_a_different_entry(self) -> None:
        assert merge_lists(["events:0.0.1"], ["events:9.9.9"]) == ["events:0.0.1"]

    def test_remove_drops_something_the_parent_granted(self) -> None:
        # What a least-privilege specialist needs to be able to say.
        assert merge_lists(["read", "delete"], ["!remove delete"]) == ["read"]

    def test_replace_starts_from_nothing(self) -> None:
        assert merge_lists(["a", "b"], ["!replace", "c"]) == ["c"]


class TestMergeSpec:
    def test_scalars_are_overridden_by_the_child(self) -> None:
        merged = merge_spec({"model": "parent", "icon": "a"}, {"model": "child"})
        assert merged == {"model": "child", "icon": "a"}

    def test_prompts_layer_rather_than_replace(self) -> None:
        merged = merge_spec(
            {"system_prompt": "Base."}, {"system_prompt_append": "And more."}
        )
        assert merged["system_prompt"] == "Base.\n\nAnd more."

        merged = merge_spec(
            {"system_prompt": "Base."}, {"system_prompt_prepend": "First."}
        )
        assert merged["system_prompt"] == "First.\n\nBase."

    def test_keyed_collections_merge_by_key(self) -> None:
        merged = merge_spec(
            {"frontend_render_tools": [{"tool": "a", "renderer": "x"}]},
            {"frontend_render_tools": [{"tool": "a", "renderer": "y"}, {"tool": "b"}]},
        )
        assert merged["frontend_render_tools"] == [
            {"tool": "a", "renderer": "y"},
            {"tool": "b"},
        ]


class TestResolve:
    def _catalogue(self) -> tuple[dict, dict]:
        base = {
            "id": "base",
            "model": "m1",
            "sandbox_variant": "jupyter-server",
            "tools": ["a", "b"],
            "system_prompt": "Base.",
        }
        fragment = {"id": "surfaces", "frontend_tools": ["jupyter-notebook:0.0.1"]}
        return {"base": base}, {"surfaces": fragment}

    def test_inheritance_and_composition_together(self) -> None:
        specs, fragments = self._catalogue()
        child = {
            "id": "child",
            "extends": "base:0.0.1",
            "includes": ["surfaces"],
            "tools": ["!remove b", "c"],
            "system_prompt_append": "Also this.",
        }
        specs["child"] = child

        resolved = resolve_spec(child, specs, fragments)

        assert resolved["model"] == "m1"
        assert resolved["sandbox_variant"] == "jupyter-server"
        assert resolved["tools"] == ["a", "c"]
        assert resolved["frontend_tools"] == ["jupyter-notebook:0.0.1"]
        assert resolved["system_prompt"] == "Base.\n\nAlso this."

    def test_a_versioned_reference_finds_its_parent(self) -> None:
        specs, fragments = self._catalogue()
        child = {"id": "c", "extends": "base:0.0.1"}
        specs["c"] = child

        assert resolve_spec(child, specs, fragments)["model"] == "m1"

    def test_a_cycle_is_refused_by_name(self) -> None:
        specs = {"a": {"id": "a", "extends": "b"}, "b": {"id": "b", "extends": "a"}}

        with pytest.raises(CompositionError, match="Circular"):
            resolve_spec(specs["a"], specs, {})

    def test_too_deep_is_refused(self) -> None:
        specs = {
            "a": {"id": "a", "extends": "b"},
            "b": {"id": "b", "extends": "c"},
            "c": {"id": "c", "extends": "d"},
            "d": {"id": "d"},
        }

        # A spec graph nobody can read is worse than a repeated field.
        with pytest.raises(CompositionError, match="deeper than"):
            resolve_spec(specs["a"], specs, {})

    def test_an_unknown_parent_says_so(self) -> None:
        with pytest.raises(CompositionError, match="not defined"):
            resolve_spec({"id": "a", "extends": "nope"}, {"a": {"id": "a"}}, {})

    def test_specs_that_compose_nothing_are_left_alone(self) -> None:
        plain = {"id": "plain", "model": "m"}
        assert resolve_all([plain]) == [plain]


class TestGeneratedCatalogue:
    """What the resolver actually produced for the shipped specs."""

    def test_the_specialists_narrowed_what_the_fragment_granted(self) -> None:
        from agent_runtimes.specs.agents.agents import AGENTSPECS

        # The fragment grants the full notebook bundle; each specialist removes
        # it and names the narrow one it actually needs. Both halves of that —
        # the include and the `!remove` — have to survive resolution.
        expected = {
            "jupyter-notebook-compactor": ["jupyter-notebook-edit:0.0.1"],
            "jupyter-cell-fixer": ["jupyter-notebook-propose:0.0.1"],
            "jupyter-notebook-reproducer": ["jupyter-notebook-read:0.0.1"],
        }
        for spec_id, bundles in expected.items():
            assert AGENTSPECS[spec_id].frontend_tools == bundles

    def test_the_specialists_kept_the_fragments_tags(self) -> None:
        from agent_runtimes.specs.agents.agents import AGENTSPECS

        # Removing one list entry must not discard everything else the fragment
        # brought in.
        assert "notebook" in AGENTSPECS["jupyter-cell-fixer"].tags


class TestSubagentRefs:
    def test_a_referenced_specialist_brings_its_own_instructions(self) -> None:
        from types import SimpleNamespace

        from agent_runtimes.subagents.capability import build_subagents_capability

        # A delegating agent names the specialists by reference; each brings
        # its own spec's instructions. Built inline: no shipped spec delegates
        # to these three any more — a teamspec does — and the mechanism is
        # what this checks.
        config = SimpleNamespace(
            subagents=[
                SimpleNamespace(name="NotebookCompactor", description="", instructions="", ref="jupyter-notebook-compactor:0.0.1"),
                SimpleNamespace(name="CellFixer", description="", instructions="", ref="jupyter-cell-fixer:0.0.1"),
                SimpleNamespace(name="NotebookReproducer", description="", instructions="", ref="jupyter-notebook-reproducer:0.0.1"),
            ],
            include_general_purpose=True,
            max_nesting_depth=2,
            default_model=None,
        )
        capability = build_subagents_capability(config, "bedrock:model", agent_id="loop-shell")
        assert capability is not None

        by_name = {d.name: d for d in capability.subagents}
        assert {"NotebookCompactor", "CellFixer", "NotebookReproducer"} <= set(by_name)
        assert "Cell Fixer" in by_name["CellFixer"].instructions

    def test_an_unknown_reference_is_skipped_not_fatal(self) -> None:
        from types import SimpleNamespace

        from agent_runtimes.subagents.capability import build_subagents_capability

        config = SimpleNamespace(
            subagents=[
                SimpleNamespace(
                    name="Ghost",
                    description="Not installed",
                    instructions="",
                    ref="does-not-exist:0.0.1",
                ),
                SimpleNamespace(
                    name="Real", description="Fine", instructions="Do the thing"
                ),
            ],
            include_general_purpose=False,
            default_model=None,
        )

        capability = build_subagents_capability(config, "bedrock:model")

        # A specialist that is not installed costs that subagent, not the agent.
        assert [d.name for d in capability.subagents] == ["Real"]
