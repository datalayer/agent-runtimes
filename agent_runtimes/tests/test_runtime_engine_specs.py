# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`runtime_engine`: what runs and hosts an agent, `datalayer` or `kagent`.

Every agent of the catalogue states it, on the line after `harness`; the
generator refuses a spec that names none, names another, or asks kagent to
run a harness other than pydantic-ai.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from agent_runtimes.specs.agents import get_agent_spec, list_agentspecs
from agent_runtimes.specs.cogs import list_cogs
from agent_runtimes.types import Agentspec

REPO = Path(__file__).resolve().parents[2]
CODEGEN = REPO / "scripts" / "codegen"
AGENTS_DIR = REPO / "agentspecs" / "agentspecs" / "agents"


def _clone_or_skip() -> Path:
    if not (AGENTS_DIR.parent / "runtime_engines.py").is_file():
        pytest.skip(
            "the agentspecs clone beside this one, with runtime_engines, is not here"
        )
    return AGENTS_DIR


class TestTheCatalogue:
    def test_every_agent_names_its_engine(self) -> None:
        specs = list_agentspecs()
        assert specs
        assert {spec.runtime_engine for spec in specs} <= {
            "datalayer",
            "kagent",
            "agentcore",
        }

    def test_the_kagent_example_runs_on_kagent_with_pydantic_ai(self) -> None:
        spec = get_agent_spec("example-kagent")
        assert spec is not None
        assert (spec.runtime_engine, spec.harness) == ("kagent", "pydantic-ai")
        assert [s.id for s in list_agentspecs() if s.runtime_engine == "kagent"] == [
            "example-kagent"
        ]

    def test_the_agent_it_is_modelled_on_runs_on_datalayer(self) -> None:
        spec = get_agent_spec("example-simple")
        assert spec is not None and spec.runtime_engine == "datalayer"

    def test_a_cog_keeps_the_engine_of_the_agent_it_extends(self) -> None:
        for cog in list_cogs():
            assert cog.spec.runtime_engine in ("datalayer", "kagent", "agentcore")

    def test_the_generated_engines_are_the_yaml_ones(self) -> None:
        agents_dir = _clone_or_skip()
        generated = {spec.id: spec for spec in list_agentspecs()}
        for path in agents_dir.glob("*.yaml"):
            raw = yaml.safe_load(path.read_text())
            spec = generated.get(raw["id"])
            if spec is not None:
                assert spec.runtime_engine == raw["runtime_engine"], raw["id"]

    def test_the_engine_is_on_the_line_after_the_harness(self) -> None:
        agents_dir = _clone_or_skip()
        for path in agents_dir.glob("*.yaml"):
            lines = path.read_text().splitlines()
            harness = [i for i, line in enumerate(lines) if line.startswith("harness:")]
            assert len(harness) == 1, path.name
            assert lines[harness[0] + 1].startswith("runtime_engine: "), path.name


class TestTheModel:
    def test_defaults_to_datalayer(self) -> None:
        spec = Agentspec(id="a", name="A", description="d")
        assert spec.runtime_engine == "datalayer"
        assert spec.model_dump(by_alias=True)["runtimeEngine"] == "datalayer"

    def test_takes_kagent_under_either_spelling(self) -> None:
        assert (
            Agentspec(
                id="a", name="A", description="d", runtime_engine="kagent"
            ).runtime_engine
            == "kagent"
        )
        assert (
            Agentspec(
                id="a", name="A", description="d", runtimeEngine="kagent"
            ).runtime_engine
            == "kagent"
        )

    def test_takes_agentcore(self) -> None:
        spec = Agentspec(id="a", name="A", description="d", runtimeEngine="agentcore")
        assert spec.runtime_engine == "agentcore"

    def test_refuses_any_other_engine(self) -> None:
        with pytest.raises(ValidationError, match="runtimeEngine|runtime_engine"):
            Agentspec(id="a", name="A", description="d", runtime_engine="lambda")


class TestTheGenerator:
    @pytest.fixture()
    def check(self):
        agents_dir = _clone_or_skip()
        sys.path.insert(0, str(CODEGEN))
        try:
            from generate_agents import check_runtime_engines
        finally:
            sys.path.remove(str(CODEGEN))
        return lambda spec: check_runtime_engines([("", spec)], agents_dir)

    def test_passes_a_stated_engine(self, check) -> None:
        check({"id": "a", "harness": "pydantic-ai", "runtime_engine": "datalayer"})
        check({"id": "a", "harness": "pydantic-ai", "runtime_engine": "kagent"})
        check({"id": "a", "harness": "pydantic-ai", "runtime_engine": "agentcore"})
        check({"id": "a", "harness": "codex", "runtime_engine": "datalayer"})

    def test_refuses_a_spec_that_names_none(self, check) -> None:
        with pytest.raises(
            SystemExit,
            match="a: names no runtime_engine: one of datalayer, kagent, agentcore",
        ):
            check({"id": "a", "harness": "pydantic-ai"})

    def test_refuses_an_unknown_engine(self, check) -> None:
        with pytest.raises(
            SystemExit, match="there is no runtime_engine named 'lambda'"
        ):
            check({"id": "a", "harness": "pydantic-ai", "runtime_engine": "lambda"})

    def test_refuses_kagent_on_another_harness(self, check) -> None:
        with pytest.raises(
            SystemExit,
            match="the runtime_engine 'kagent' runs the harness pydantic-ai, not 'codex'",
        ):
            check({"id": "a", "harness": "codex", "runtime_engine": "kagent"})

    def test_refuses_agentcore_on_another_harness(self, check) -> None:
        with pytest.raises(
            SystemExit,
            match="the runtime_engine 'agentcore' runs the harness pydantic-ai, not 'claude-code'",
        ):
            check({"id": "a", "harness": "claude-code", "runtime_engine": "agentcore"})


class TestTheStewardOnAgentCore:
    def test_the_aws_steward_is_the_one_agent_on_agentcore(self) -> None:
        on_agentcore = [
            s.id for s in list_agentspecs() if s.runtime_engine == "agentcore"
        ]
        assert on_agentcore == ["worker-steward-aws"]
        spec = get_agent_spec("worker-steward-aws")
        assert spec is not None and spec.harness == "pydantic-ai"
