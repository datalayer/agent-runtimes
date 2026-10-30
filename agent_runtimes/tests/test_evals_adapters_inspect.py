# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Inspect AI adapter against the real, pinned Inspect, on its mock model.

The mapping is tested on its own always. What needs Inspect runs when
`DATALAYER_INSPECT_AI_PYTHON` names an interpreter holding the pinned version
and the fixture is checked out beside this repository.
"""

from __future__ import annotations

import io
import json
import os
import subprocess
import tarfile
from pathlib import Path

import pytest

from agent_runtimes.evals.adapters.base import (
    AdapterPlan,
    ExternalDefinition,
    LaunchGrant,
    NormalizedScore,
    RawResult,
    Selection,
    SourceRef,
    Trial,
    blocking,
)
from agent_runtimes.evals.adapters.host import AdapterHost
from agent_runtimes.evals.adapters.inspect_ai import (
    INSPECT_VERSION,
    PYTHON_VARIABLE,
    SANDBOXES_VARIABLE,
    InspectAdapter,
    _failure_stage,
    _with_headline,
    score_as_float,
)
from agent_runtimes.evals.adapters.sandbox import isolation_available
from agent_runtimes.evals.adapters.source import archive_digest

FIXTURE = (
    Path(__file__).resolve().parents[3]
    / ".."
    / "tech"
    / "datalayer"
    / "examples"
    / "evals"
    / "inspect"
)
PYTHON = os.environ.get(PYTHON_VARIABLE, "")

needs_inspect = pytest.mark.skipif(
    not (PYTHON and FIXTURE.exists() and isolation_available()),
    reason=f"{PYTHON_VARIABLE} names no Inspect, the fixture is absent, or no namespaces here",
)


def archive_of(root: Path) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for path in sorted(root.rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts:
                tar.add(path, arcname=path.relative_to(root).as_posix())
    return buffer.getvalue()


@pytest.mark.parametrize(
    "value,expected",
    [
        ("C", 1.0),
        ("I", 0.0),
        ("P", 0.5),
        ("N", 0.0),
        (True, 1.0),
        (False, 0.0),
        (3, 3.0),
        ("0.25", 0.25),
        ("yes", 1.0),
        ("no", 0.0),
        ({"a": 1}, None),
        ([1], None),
        ("maybe", None),
    ],
)
def test_a_value_reads_as_inspect_reads_it(value, expected):
    assert score_as_float(value) == expected


class TestTheHeadline:
    COMMON = {"prompt": "p", "output": "o"}

    def _scores(self, **values):
        return [
            NormalizedScore(name=name, value=value) for name, value in values.items()
        ]

    def test_one_scorers_verdict_is_the_headline(self):
        result = _with_headline(
            self._scores(includes="C"), aggregation={}, common=self.COMMON
        )
        assert (result.status, result.score, result.passed) == ("passed", 1.0, True)

    def test_several_scorers_with_nothing_chosen_have_no_headline(self):
        result = _with_headline(
            self._scores(includes="C", answer_length=16),
            aggregation={},
            common=self.COMMON,
        )
        assert (result.status, result.score, result.passed) == ("review", None, None)
        assert "includes: C" in result.explanation

    def test_a_chosen_scorer_is_the_headline(self):
        result = _with_headline(
            self._scores(includes="I", answer_length=16),
            aggregation={"scorer": "includes"},
            common=self.COMMON,
        )
        assert (result.status, result.score, result.failure_stage) == (
            "failed",
            0.0,
            "scorer",
        )

    def test_a_chosen_mean_is_a_mean_of_what_has_a_number(self):
        result = _with_headline(
            self._scores(a=1.0, b=0.5, c={"x": 1}),
            aggregation={"kind": "mean", "threshold": 0.5},
            common=self.COMMON,
        )
        assert (result.status, result.score) == ("passed", 0.75)

    def test_a_graded_value_with_no_threshold_waits_for_a_person(self):
        result = _with_headline(
            self._scores(quality=0.7), aggregation={}, common=self.COMMON
        )
        assert (result.status, result.score) == ("review", 0.7)

    def test_a_scorer_with_no_number_has_no_headline(self):
        result = _with_headline(
            self._scores(structured={"a": 1}), aggregation={}, common=self.COMMON
        )
        assert (result.status, result.score) == ("review", None)


@pytest.mark.parametrize(
    "traceback,expected",
    [
        (
            'File "/x/inspect_ai/model/_providers/openai.py", line 1',
            ("agent", "model_error"),
        ),
        (
            'File "/x/inspect_ai/util/_sandbox/docker.py"',
            ("infrastructure", "sandbox_error"),
        ),
        ('File "/x/inspect_ai/scorer/_match.py"', ("scorer", "scorer_error")),
        ('File "/x/inspect_ai/tool/_tool_call.py"', ("agent", "tool_error")),
        ('File "/source/mine.py", in solve', ("agent", "solver_error")),
    ],
)
def test_a_failure_is_filed_at_its_stage(traceback, expected):
    assert _failure_stage(traceback) == expected


def _definition(**configuration):
    return ExternalDefinition(
        framework="inspect-ai",
        adapter_version="1",
        framework_version=INSPECT_VERSION,
        source=SourceRef(kind="archive", reference="a" * 64),
        entry_point="tasks.py@t",
        configuration={
            "tasks": [{"entry_point": "tasks.py@t", "solvers": [], "scorers": []}],
            **configuration,
        },
        content_digest="b" * 64,
    )


class TestThePlan:
    def test_a_real_provider_needs_the_network_and_its_key(self):
        adapter = InspectAdapter()
        definition = _definition(models=["anthropic/claude-haiku-4-5"])
        codes = {
            item.code
            for item in blocking(
                adapter.plan(definition, grant=LaunchGrant()).capabilities
            )
        }
        assert codes == {"network_not_granted"}
        codes = {
            item.code
            for item in blocking(
                adapter.plan(
                    definition, grant=LaunchGrant(network="boundary")
                ).capabilities
            )
        }
        assert codes == {"secret_not_granted"}
        plan = adapter.plan(
            definition,
            grant=LaunchGrant(network="boundary", secrets=["ANTHROPIC_API_KEY"]),
        )
        assert blocking(plan.capabilities) == []
        assert plan.policy["secrets"] == ["ANTHROPIC_API_KEY"]
        assert plan.policy["network"] == "boundary"

    def test_the_mock_model_needs_neither(self):
        plan = InspectAdapter().plan(
            _definition(models=["mockllm/model"]), grant=LaunchGrant()
        )
        assert blocking(plan.capabilities) == []
        assert plan.policy["network"] == "none"

    def test_a_provider_it_cannot_hand_a_key_to_is_unsupported(self):
        plan = InspectAdapter().plan(
            _definition(models=["somewhere/model"]), grant=LaunchGrant()
        )
        assert [item.code for item in blocking(plan.capabilities)] == [
            "provider_unknown"
        ]

    def test_a_tool_runs_once_the_launch_approves_it(self):
        adapter = InspectAdapter()
        definition = _definition(tools=["add"])
        assert [
            item.code
            for item in blocking(
                adapter.plan(definition, grant=LaunchGrant()).capabilities
            )
        ] == ["tool_not_approved"]
        plan = adapter.plan(definition, grant=LaunchGrant(tools=["add"]))
        assert blocking(plan.capabilities) == []
        assert plan.resolved_configuration["approved_tools"] == ["add"]

    def test_the_reproduction_is_pinned_and_holds_no_secret(self):
        plan = InspectAdapter().plan(
            _definition(
                models=["anthropic/claude-haiku-4-5"], task_args={"mock": False}
            ),
            grant=LaunchGrant(network="boundary", secrets=["ANTHROPIC_API_KEY"]),
        )
        assert f"pip install inspect-ai=={INSPECT_VERSION}" in plan.reproduction
        assert (
            "ANTHROPIC_API_KEY=<secret:ANTHROPIC_API_KEY> inspect eval tasks.py@t --model anthropic/claude-haiku-4-5"
            in plan.reproduction
        )
        assert "mock=false" in plan.reproduction

    @pytest.mark.parametrize(
        "task,code",
        [
            ({"sandbox": {"type": "docker", "config": None}}, "sandbox_unavailable"),
            ({"sample_sandboxes": ["k8s"]}, "sandbox_unavailable"),
            ({"epochs": 3}, "epochs_unsupported"),
            ({"approval": True}, "approval_policy"),
            ({"dataset": {"dynamic": True}}, "dynamic_dataset"),
            ({"dataset": {"shuffled": True}, "implicit_ids": 2}, "unstable_ids"),
        ],
    )
    def test_what_cannot_run_faithfully_is_unsupported(self, task, code):
        definition = _definition(tasks=[{"entry_point": "tasks.py@t", **task}])
        assert [
            item.code
            for item in blocking(
                InspectAdapter().plan(definition, grant=LaunchGrant()).capabilities
            )
        ] == [code]

    def test_a_deployment_may_provide_a_sandbox_type(self, monkeypatch):
        monkeypatch.setenv(SANDBOXES_VARIABLE, "docker")
        definition = _definition(
            tasks=[
                {
                    "entry_point": "tasks.py@t",
                    "sandbox": {"type": "docker", "config": None},
                }
            ]
        )
        assert (
            blocking(
                InspectAdapter().plan(definition, grant=LaunchGrant()).capabilities
            )
            == []
        )

    def test_a_missing_requirement_is_unsupported(self):
        plan = InspectAdapter().plan(
            _definition(missing=["scipy>=2"]), grant=LaunchGrant()
        )
        assert [item.code for item in blocking(plan.capabilities)] == [
            "dependency_missing"
        ]


def _plan(**update):
    return AdapterPlan(
        framework="inspect-ai",
        adapter_version="1",
        framework_version=INSPECT_VERSION,
        environment="x",
        policy={},
        capabilities=[],
        **update,
    )


class TestAFailedLog:
    TRIAL = Trial(case_id="c", native_id="s1")

    def test_no_log_is_an_infrastructure_failure(self):
        result = InspectAdapter().normalize_result(
            self.TRIAL, RawResult(returncode=1, stderr="boom"), plan=_plan()
        )
        assert (result.status, result.failure_stage, result.failure_mode) == (
            "failed",
            "infrastructure",
            "no_eval_log",
        )

    def test_a_log_of_another_inspect_is_refused(self):
        log = {"eval": {"packages": {"inspect_ai": "0.0.1"}}}
        with pytest.raises(ValueError):
            InspectAdapter().normalize_result(
                self.TRIAL, RawResult(returncode=0, payload={"log": log}), plan=_plan()
            )

    def test_a_sample_that_errored_keeps_its_stage(self):
        log = {
            "eval": {"packages": {"inspect_ai": INSPECT_VERSION}},
            "status": "success",
            "samples": [
                {
                    "id": "s1",
                    "epoch": 1,
                    "input": "x",
                    "error": {
                        "message": "401",
                        "traceback": 'File "/x/inspect_ai/model/_providers/openai.py"',
                    },
                }
            ],
        }
        result = InspectAdapter().normalize_result(
            self.TRIAL, RawResult(returncode=0, payload={"log": log}), plan=_plan()
        )
        assert (
            result.status,
            result.failure_stage,
            result.failure_mode,
            result.explanation,
        ) == ("failed", "agent", "model_error", "401")

    def test_a_sample_at_its_limit_says_which(self):
        log = {
            "eval": {"packages": {"inspect_ai": INSPECT_VERSION}},
            "samples": [{"id": "s1", "limit": {"type": "message", "limit": 5}}],
        }
        result = InspectAdapter().normalize_result(
            self.TRIAL, RawResult(returncode=0, payload={"log": log}), plan=_plan()
        )
        assert result.failure_mode == "limit_message"


@needs_inspect
class TestTheRealInspect:
    @pytest.fixture(scope="class")
    def world(self, tmp_path_factory):
        host = AdapterHost(tmp_path_factory.mktemp("inspect-host"))
        data = archive_of(FIXTURE)
        digest = archive_digest(data)
        host.put_source(digest, data)
        inspection = host.inspect("inspect-ai", digest)
        return {"host": host, "digest": digest, "inspection": inspection}

    def _imported(self, world, **selection):
        return InspectAdapter().import_definition(
            world["inspection"],
            selection=Selection(entry_points=["tasks.py@arithmetic"], **selection),
            source=SourceRef(kind="archive", reference=world["digest"]),
        )

    def _run_all(self, world, grant=LaunchGrant(tools=["add"]), **selection):
        imported = self._imported(world, **selection)
        plan = InspectAdapter().plan(imported.external_definition, grant=grant)
        results = {}
        for case in imported.cases:
            marks = case["metadata"]["external"]
            trial = Trial(
                case_id=case["id"],
                native_id=marks["native_id"],
                entry_point=marks["entry_point"],
                configuration={"subject": {}},
            )
            results[marks["native_id"]] = world["host"].execute(
                "inspect-ai", world["digest"], plan=plan, trial=trial, secrets={}
            )
        return results

    def test_discovery_finds_the_tasks_and_runs_no_sample(self, world):
        inspection = world["inspection"]
        assert set(inspection.entry_points) == {
            "tasks.py@arithmetic",
            "docker_task.py@arithmetic_in_docker",
        }
        assert inspection.framework_version == INSPECT_VERSION
        ours = [
            case
            for case in inspection.cases
            if case.entry_point == "tasks.py@arithmetic"
        ]
        assert sorted(case.native_id for case in ours) == [
            "sum-large",
            "sum-small",
            "sum-wrong-target",
        ]
        assert inspection.tools == ["add", "bash"]
        names = {
            item.component.split(":", 1)[1]
            for item in inspection.capabilities
            if item.kind == "solver"
        }
        assert {"ask_to_use_the_tool", "use_tools", "generate"} <= {
            name.rsplit("/", 1)[-1] for name in names
        }
        assert {"includes", "answer_length"} <= {
            item.component.split(":")[-1].rsplit("/", 1)[-1]
            for item in inspection.capabilities
            if item.kind == "scorer"
        }

    def test_the_docker_task_is_unsupported_by_name_and_the_other_is_not(self, world):
        refused = blocking(world["inspection"].capabilities)
        assert [(item.code, item.component) for item in refused] == [
            (
                "sandbox_unavailable",
                "docker_task.py@arithmetic_in_docker:sandbox:docker",
            )
        ]
        assert "docker" in refused[0].reason
        imported = self._imported(world)
        plan = InspectAdapter().plan(
            imported.external_definition, grant=LaunchGrant(tools=["add"])
        )
        assert blocking(plan.capabilities) == []

    def test_an_unapproved_tool_stops_the_launch(self, world):
        imported = self._imported(world)
        plan = InspectAdapter().plan(imported.external_definition, grant=LaunchGrant())
        assert [item.component for item in blocking(plan.capabilities)] == ["tool:add"]

    def test_it_matches_a_local_pinned_run_sample_for_sample_and_scorer_for_scorer(
        self, world, tmp_path
    ):
        """The same task, outside any sandbox, by Inspect's own CLI."""
        inspect_cli = str(Path(PYTHON).with_name("inspect"))
        subprocess.run(
            [
                inspect_cli,
                "eval",
                str(FIXTURE / "tasks.py") + "@arithmetic",
                "--log-dir",
                str(tmp_path),
                "--log-format",
                "json",
                "--display",
                "none",
            ],
            check=True,
            capture_output=True,
            timeout=120,
            cwd=tmp_path,
        )
        [path] = tmp_path.glob("*.json")
        local = json.loads(path.read_text())
        expected = {
            str(sample["id"]): {
                name: entry["value"] for name, entry in sample["scores"].items()
            }
            for sample in local["samples"]
        }
        answers = {
            str(sample["id"]): sample["output"]["completion"]
            for sample in local["samples"]
        }
        results = self._run_all(world)
        assert set(results) == set(expected)
        for native, result in results.items():
            assert {score.name: score.value for score in result.scores} == expected[
                native
            ]
            assert result.output == answers[native]

    def test_every_scorer_stays_and_no_headline_is_invented(self, world):
        results = self._run_all(world)
        for result in results.values():
            assert result.status == "review"
            assert result.score is None
            assert result.passed is None
            assert [score.name for score in result.scores] == [
                "includes",
                "answer_length",
            ]

    def test_a_chosen_scorer_gives_a_verdict(self, world):
        results = self._run_all(world, aggregation={"scorer": "includes"})
        assert {native: result.status for native, result in results.items()} == {
            "sum-small": "passed",
            "sum-large": "passed",
            "sum-wrong-target": "failed",
        }
        assert results["sum-wrong-target"].failure_mode == "wrong_answer"

    def test_the_tool_call_is_on_the_trajectory_and_usage_is_counted(self, world):
        result = self._run_all(world)["sum-large"]
        assert [step["role"] for step in result.trajectory][-3:] == [
            "assistant",
            "tool",
            "assistant",
        ]
        assert result.trajectory[-3]["tool_calls"][0]["function"] == "add"
        assert result.trajectory[-2]["text"] == "42"
        assert result.usage["total_tokens"] > 0

    def test_the_complete_eval_log_is_retained(self, world):
        result = self._run_all(world)["sum-large"]
        [artifact] = result.artifacts
        log = json.loads(artifact.content)
        assert log["status"] == "success"
        assert log["eval"]["packages"]["inspect_ai"] == INSPECT_VERSION
        assert [sample["id"] for sample in log["samples"]] == ["sum-large"]
        assert log["samples"][0]["events"]

    def test_a_tool_the_launch_did_not_approve_is_rejected_at_run_time(self, world):
        imported = self._imported(world)
        plan = InspectAdapter().plan(imported.external_definition, grant=LaunchGrant())
        marks = imported.cases[0]["metadata"]["external"]
        trial = Trial(
            case_id="c",
            native_id=marks["native_id"],
            entry_point=marks["entry_point"],
            configuration={"subject": {}},
        )
        result = world["host"].execute(
            "inspect-ai", world["digest"], plan=plan, trial=trial, secrets={}
        )
        tool = next(step for step in result.trajectory if step["role"] == "tool")
        assert tool.get("error")

    def test_a_project_of_its_own_runs_without_the_adapter_knowing_it(self, world):
        """The custom solver, tool, scorer and metric are the fixture's: their
        names appear nowhere in this package."""
        package = Path(__file__).resolve().parents[1] / "evals" / "adapters"
        for name in ("ask_to_use_the_tool", "answer_length", "longest"):
            assert not any(name in path.read_text() for path in package.glob("*.py"))
        result = self._run_all(world)["sum-small"]
        assert {score.name for score in result.scores} >= {"answer_length"}

    def test_a_missing_extension_blocks_inspection_not_a_task(self, tmp_path):
        (tmp_path / "broken.py").write_text(
            "from inspect_ai import Task, task\nfrom not_installed_anywhere import thing\n\n@task\ndef broken():\n    return Task()\n"
        )
        host = AdapterHost(tmp_path / "host")
        data = archive_of(tmp_path)
        digest = archive_digest(data)
        host.put_source(digest, data)
        with pytest.raises(ValueError, match="not_installed_anywhere"):
            host.inspect("inspect-ai", digest)
