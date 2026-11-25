# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`runtime_engine`: what runs and hosts an agent, `datalayer`, `kagent` or `agentcore`.

Every agent of the catalogue states it, on the line after `harness`; the
generator refuses a spec that names none, names another, or asks Kagent or
AWS AgentCore to run a harness other than pydantic-ai. The engines are specs
of `agentspecs/runtime-engines`, generated into
`agent_runtimes.specs.runtime_engines`.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from agent_runtimes.specs.agents import get_agent_spec, list_agentspecs
from agent_runtimes.specs.cogs import list_cogs
from agent_runtimes.specs.runtime_engines import (
    DEFAULT_RUNTIME_ENGINE,
    ENGINE_HARNESSES,
    RUNTIME_ENGINE_CATALOGUE,
    RUNTIME_ENGINES,
    get_runtime_engine,
    list_runtime_engines,
)
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


class TestTheEngines:
    def test_are_datalayer_kagent_and_aws_agentcore_the_default_first(self) -> None:
        assert RUNTIME_ENGINES == ("datalayer", "kagent", "agentcore")
        assert DEFAULT_RUNTIME_ENGINE == "datalayer"
        assert [engine.name for engine in list_runtime_engines()] == [
            "Datalayer",
            "Kagent",
            "AWS AgentCore",
        ]
        assert [engine.position for engine in list_runtime_engines()] == [1, 2, 3]

    def test_run_the_harnesses_their_specs_say(self) -> None:
        assert ENGINE_HARNESSES == {
            "kagent": ("pydantic-ai",),
            "agentcore": ("pydantic-ai",),
        }
        assert RUNTIME_ENGINE_CATALOGUE["datalayer"].harnesses is None
        assert get_runtime_engine("lambda") is None

    def test_are_the_yaml_ones(self) -> None:
        engines_dir = _clone_or_skip().parent / "runtime-engines"
        if not engines_dir.is_dir():
            pytest.skip("the agentspecs clone beside this one has no runtime-engines")
        raw = {
            path.stem: yaml.safe_load(path.read_text())
            for path in engines_dir.glob("*.yaml")
        }
        assert set(raw) == set(RUNTIME_ENGINES)
        for engine in list_runtime_engines():
            assert engine.model_dump() == raw[engine.id], engine.id


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
        with pytest.raises(
            ValidationError,
            match="there is no runtime_engine named 'lambda': one of datalayer, kagent, agentcore",
        ):
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


# -- the published import paths of RUNTIME_ENGINES ------------------------------------------

#: A fresh interpreter for each: what is imported first decides whether a cycle shows.
_OLD_PATHS = (
    "from agent_runtimes.types import RUNTIME_ENGINES as old",
    "from agent_runtimes.types.types import RUNTIME_ENGINES as old",
    "import agent_runtimes.types as t; old = t.RUNTIME_ENGINES",
    "import agent_runtimes.types.types as t; old = t.RUNTIME_ENGINES",
)
_FIRST = (
    "",
    "import agent_runtimes.specs.runtime_engines",
    "import agent_runtimes.types",
)


@pytest.mark.parametrize("old_path", _OLD_PATHS)
@pytest.mark.parametrize("first", _FIRST)
def test_runtime_engines_is_still_imported_from_the_types(
    old_path: str, first: str
) -> None:
    import subprocess

    code = "\n".join(
        [
            first,
            old_path,
            "from agent_runtimes.specs.runtime_engines import RUNTIME_ENGINES",
            "assert old is RUNTIME_ENGINES, old",
            "print(','.join(old))",
        ]
    )
    done = subprocess.run(  # nosec B603: this interpreter, the code above
        [sys.executable, "-c", code], capture_output=True, text=True, timeout=120
    )
    assert done.returncode == 0, done.stderr[-2000:]
    assert done.stdout.strip() == "datalayer,kagent,agentcore"


def test_the_types_still_list_runtime_engines() -> None:
    import agent_runtimes.types as types
    import agent_runtimes.types.types as types_module

    assert "RUNTIME_ENGINES" in types.__all__
    assert "RUNTIME_ENGINES" in dir(types)
    assert "RUNTIME_ENGINES" in dir(types_module)
    with pytest.raises(AttributeError):
        types.NO_SUCH_NAME
    with pytest.raises(AttributeError):
        types_module.NO_SUCH_NAME
