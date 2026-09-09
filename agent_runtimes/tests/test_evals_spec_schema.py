# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An evalset spec means one thing to every tool that reads it.

The CLI, the SDK, the GitHub Action and the UI's import all turn an
``*.evalset.json`` into ``POST /evalsets``. This pins the schema they share
and the body they derive from it (BENCHMARK.md, B0-03), over the reference
fixture the package ships and the example specs beside it.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent_runtimes.evals.spec_schema import (
    EvalsetSpecError,
    evalset_payload_from_spec,
    validate_evalset_spec,
)
from agent_runtimes.evals.remote.evals import load_evalset_spec
from agent_runtimes.mixins.evals import EvalsMixin

FIXTURES = Path(__file__).resolve().parents[1] / "evals" / "fixtures"
REFERENCE = FIXTURES / "data-analysis-agent.evalset.json"
EXAMPLES = Path(__file__).resolve().parents[3] / "tech" / "datalayer" / "examples" / "evals"


def _specs() -> list[Path]:
    paths = [REFERENCE]
    if EXAMPLES.exists():
        paths.extend(sorted(EXAMPLES.glob("*.evalset.json")))
    return paths


@pytest.mark.parametrize("path", _specs(), ids=lambda path: path.name)
def test_every_shipped_spec_validates(path: Path):
    spec = load_evalset_spec(path)
    payload = evalset_payload_from_spec(spec)
    assert payload["name"] == spec["name"]
    assert len(payload["cases"]) == len(spec.get("cases") or [])
    assert set(payload) == {
        "name",
        "description",
        "run_environment",
        "kind",
        "schema",
        "evalset_evaluators",
        "report_evaluators",
        "tags",
        "metadata",
        "cases",
    }


def test_the_reference_fixture_is_the_one_in_the_examples():
    example = EXAMPLES / "data-analysis-agent.evalset.json"
    if not example.exists():
        pytest.skip("the examples checkout is not beside this one")
    assert json.loads(example.read_text()) == json.loads(REFERENCE.read_text())


def test_the_reference_fixture_is_what_the_plan_says():
    spec = json.loads(REFERENCE.read_text())
    assert spec["name"] == "Data Analysis Agent Benchmark"
    assert spec["kind"] == "batch" and spec["run_environment"] == "sdk"
    assert spec["category"] == "data"
    assert spec["metadata"]["agentspec_ids"] == ["jupyter-data-analyst"]
    names = [case["name"] for case in spec["cases"]]
    assert "duplicate-customers" in names and "duplicate-rows" in names
    # Every case can be graded by an evaluator the platform runs.
    for case in spec["cases"]:
        assert {ref["name"] for ref in case["evaluators"]} <= {"contains", "equals_expected", "equals"}


def test_a_bad_spec_names_the_path():
    with pytest.raises(EvalsetSpecError, match=r"cases/1/name"):
        validate_evalset_spec({"name": "x", "cases": [{"name": "ok"}, {"name": ""}]}, source="bad.json")
    with pytest.raises(EvalsetSpecError, match=r"kind"):
        validate_evalset_spec({"name": "x", "kind": "streaming"})
    with pytest.raises(EvalsetSpecError, match=r"\(root\)"):
        validate_evalset_spec({"description": "no name"})


class _Client(EvalsMixin):
    """Captures the body the SDK would send."""

    def __init__(self) -> None:
        self.sent: dict = {}

    def evals_create_eval(self, **kwargs):
        self.sent = kwargs
        return {"evalset": {"id": "evalset-1"}}


def test_the_sdk_sends_the_derived_body_with_overrides():
    spec = json.loads(REFERENCE.read_text())
    client = _Client()
    client.evals_create_eval_from_spec(spec=spec, run_environment="ui", account_uid="org-1")
    body = client.sent
    assert body["name"] == spec["name"]
    assert body["run_environment"] == "ui"
    assert body["kind"] == "batch"
    assert body["cases"] == spec["cases"]
    assert body["account_uid"] == "org-1"
    # Byte for byte the derived body, bar the overrides.
    derived = evalset_payload_from_spec(spec)
    derived["run_environment"] = "ui"
    assert {key: body[key] for key in derived} == derived


def test_the_sdk_refuses_an_invalid_spec_before_any_request():
    client = _Client()
    with pytest.raises(EvalsetSpecError):
        client.evals_create_eval_from_spec(spec={"name": "x", "cases": "not a list"})
    assert client.sent == {}
