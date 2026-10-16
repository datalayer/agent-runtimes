# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The harnesses catalogue (SH-01) as agent-runtimes reads it.

An agent program driven over ACP, generated from agentspecs 0.0.100. An
agent spec names one with `harness:` beside `pydantic-ai` and `vercel-ai`;
what the harness cannot honour is refused at load, in a sentence; and an
agent on a catalogue harness is served by the ACP adapter (SHIELD SH-10,
`test_acp_agent.py`), never run on pydantic-ai in its place.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from agent_runtimes.specs.agents import list_agentspecs
from agent_runtimes.specs.harnesses import (
    HARNESS_CATALOGUE,
    get_harness,
    list_harnesses,
)
from agent_runtimes.types import (
    BUILTIN_HARNESSES,
    Agentspec,
    HarnessSpec,
    harness_problems,
)

REPO = Path(__file__).resolve().parents[2]
CODEGEN = REPO / "scripts" / "codegen"


class TestTheHarnessCatalogue:
    def test_holds_the_harnesses_of_decision_4_and_one_framework(self) -> None:
        assert set(HARNESS_CATALOGUE) == {
            "claude-code",
            "codex",
            "gemini-cli",
            "goose",
            "opencode",
            "openhands",
            "fast-agent",
            "custom",
        }
        assert all(isinstance(spec, HarnessSpec) for spec in list_harnesses())

    def test_each_is_launched_pinned_and_registered(self) -> None:
        for spec in list_harnesses():
            if spec.id == "custom":
                assert spec.acp is None and not spec.enabled
                continue
            assert spec.acp is not None and spec.acp.mcp == "lend"
            assert spec.registered.version in " ".join(
                [spec.acp.command, *spec.acp.args, *spec.requires.binaries]
            )
            assert spec.registered.licence_source.startswith("https://")
            assert spec.registered.terms_source.startswith("https://")

    def test_the_register_says_who_may_be_served(self) -> None:
        def harness(harness_id: str) -> HarnessSpec:
            spec = get_harness(harness_id)
            assert spec is not None, harness_id
            return spec

        assert harness("claude-code").terms.served_to_third_parties == "api_key_only"
        assert harness("codex").terms.served_to_third_parties == "api_key_only"
        assert "18 June 2026" in (harness("gemini-cli").terms.tier_restrictions or "")
        assert harness("custom").terms.served_to_third_parties == "organizations_own"

    def test_every_catalogue_agent_names_a_harness_the_catalogue_knows(self) -> None:
        """A built-in one (pydantic-ai, vercel-ai) or a harness of the catalogue
        (agentspecs 0.0.101's example-harness-claude-code names claude-code)."""
        for spec in list_agentspecs():
            assert spec.harness in ("pydantic-ai", "vercel-ai", *HARNESS_CATALOGUE), (
                spec.id
            )


class TestWhatAHarnessCannotHonourIsRefusedAtLoad:
    def test_a_built_in_harness_honours_everything(self) -> None:
        assert (
            harness_problems("pydantic-ai", model="x", subagents=[1], skills=["a"])
            == []
        )

    def test_an_unknown_harness(self) -> None:
        [problem] = harness_problems("nope")
        assert problem.startswith(
            "There is no harness named 'nope': one of pydantic-ai, vercel-ai, "
        )

    def test_custom_in_the_shared_catalogue(self) -> None:
        assert harness_problems("custom") == [
            "The harness 'custom' names no command: an organization's own harness "
            "spec names it, and is never typed into a form."
        ]

    def test_subagents_on_a_harness_with_its_own(self) -> None:
        assert harness_problems("claude-code", model="bedrock:x") == []
        assert harness_problems("claude-code", subagents=[{"id": "a"}]) == [
            "The harness 'claude-code' has its own subagents: drop `subagents:`."
        ]

    def test_a_model_and_skills_on_a_harness_that_takes_none(self, monkeypatch) -> None:
        mute = HARNESS_CATALOGUE["goose"].model_copy(deep=True)
        mute.honours.model = False
        mute.skills.format = "none"
        monkeypatch.setitem(HARNESS_CATALOGUE, "goose", mute)
        assert harness_problems("goose", model="x", skills=["crawl"]) == [
            "The harness 'goose' does not take a model: drop `model:`.",
            "The harness 'goose' reads no skills: drop `skills:`.",
        ]

    def test_an_agent_spec_is_refused_at_load_in_a_sentence(self) -> None:
        with pytest.raises(ValidationError, match="There is no harness named 'nope'"):
            Agentspec(id="a", name="A", harness="nope")
        with pytest.raises(ValidationError, match="has its own subagents"):
            Agentspec(
                id="a",
                name="A",
                harness="claude-code",
                subagents={
                    "agents": [{"id": "helper", "agent_spec_id": "example-blank"}]
                },
            )
        with pytest.raises(ValidationError, match="names no command"):
            Agentspec(id="a", name="A", harness="custom")
        # What the harness honours loads.
        assert (
            Agentspec(
                id="a", name="A", harness="claude-code", model="bedrock:x"
            ).harness
            == "claude-code"
        )


class TestAHarnessAgentIsServedByTheAdapter:
    def test_the_create_route_branches_on_the_harness_and_nothing_falls_back(
        self,
    ) -> None:
        source = (REPO / "agent_runtimes" / "routes" / "agents.py").read_text()
        assert "if harness_id not in BUILTIN_HARNESSES:" in source
        assert "_harness_agent_of(" in source
        assert "not served yet" not in source
        assert BUILTIN_HARNESSES == ("pydantic-ai", "vercel-ai")


class TestTheGenerator:
    def test_refuses_an_agent_asking_what_its_harness_cannot_do(self) -> None:
        sys.path.insert(0, str(CODEGEN))
        import agentspecs
        from generate_agents import check_harnesses, load_harnesses  # noqa: E402

        # The installed package's catalogue: CI has no nested agentspecs clone.
        harnesses = load_harnesses(
            Path(agentspecs.__file__).resolve().parent / "agents"
        )
        assert set(harnesses) == set(HARNESS_CATALOGUE)
        check_harnesses(
            [("", {"id": "ok", "harness": "claude-code", "model": "x"})], harnesses
        )
        with pytest.raises(SystemExit, match="has its own subagents"):
            check_harnesses(
                [("", {"id": "bad", "harness": "codex", "subagents": {"agents": []}})],
                harnesses,
            )
        with pytest.raises(SystemExit, match="no harness named 'nope'"):
            check_harnesses([("", {"id": "bad", "harness": "nope"})], harnesses)
        with pytest.raises(SystemExit, match="names no command"):
            check_harnesses([("", {"id": "bad", "harness": "custom"})], harnesses)
