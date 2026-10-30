# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Harbor adapter, the mapping alone and against the real, pinned Harbor.

What needs Harbor runs when `DATALAYER_HARBOR_PYTHON` names an interpreter that
holds the pinned version. The comparison with a local `harbor` run needs Docker.
"""

from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
import tarfile
import threading
import time
from pathlib import Path

import pytest

from agent_runtimes.evals.adapters.base import (
    AdapterPlan,
    ExternalDefinition,
    Inspection,
    LaunchGrant,
    RawResult,
    Selection,
    SourceRef,
    Trial,
    blocking,
)
from agent_runtimes.evals.adapters.harbor import (
    ANTHROPIC_ROUTE_VARIABLE,
    ENVIRONMENTS_VARIABLE,
    HARBOR_VERSION,
    PYTHON_VARIABLE,
    HarborAdapter,
    _agent_capability,
    _agent_model,
    _task_capabilities,
)
from agent_runtimes.evals.adapters.host import AdapterHost
from agent_runtimes.evals.adapters.sandbox import SandboxCancelled, isolation_available
from agent_runtimes.evals.adapters.source import archive_digest

FIXTURE = Path(__file__).parent / "fixtures" / "harbor"
PYTHON = os.environ.get(PYTHON_VARIABLE, "")
needs_harbor = pytest.mark.skipif(
    not (PYTHON and isolation_available()),
    reason=f"{PYTHON_VARIABLE} names no Harbor, or this kernel gives no namespaces",
)


def archive_of(root: Path) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for path in sorted(root.rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts:
                tar.add(path, arcname=path.relative_to(root).as_posix())
    return buffer.getvalue()


def _task(**extra):
    return {"name": "t", "path": "tasks/t", "instruction": "x", **extra}


class TestWhatATaskNeeds:
    @pytest.mark.parametrize(
        "task,code",
        [
            ({"docker_image": "python:3.12"}, "image_unavailable"),
            ({"dockerfile": True}, "image_unavailable"),
            ({"compose": True}, "compose_unavailable"),
            ({"separate_verifier": True}, "separate_verifier_unavailable"),
            ({"gpus": 1}, "accelerator_unavailable"),
            ({"tpu": True}, "accelerator_unavailable"),
            ({"allow_internet": True}, "internet_unavailable"),
            ({"os": "windows"}, "os_unavailable"),
            ({"mcp_servers": 1}, "mcp_unavailable"),
        ],
    )
    def test_what_the_runtimes_do_not_provide_is_unsupported(self, task, code):
        assert code in {
            item.code for item in blocking(_task_capabilities(_task(**task)))
        }

    def test_a_deployment_says_what_it_provides(self, monkeypatch):
        monkeypatch.setenv(ENVIRONMENTS_VARIABLE, "image,compose")
        assert (
            blocking(
                _task_capabilities(
                    _task(dockerfile=True, dockerfile_content="FROM a\n", compose=True)
                )
            )
            == []
        )

    def test_a_lint_error_is_named(self):
        finding = {"severity": "error", "rule": "missing-tests", "message": "no tests"}
        [refused] = blocking(_task_capabilities(_task(findings=[finding])))
        assert (refused.code, refused.reason) == ("lint_error", "no tests")


class TestAgents:
    @pytest.mark.parametrize("agent", ["oracle", "nop"])
    def test_one_that_calls_no_model_runs(self, agent):
        assert _agent_capability(agent).status == "framework-run"

    @pytest.mark.parametrize(
        "agent",
        [
            "codex",
            "gemini-cli",
            "aider",
            "goose",
            "opencode",
            "mini-swe-agent",
            "something-new",
        ],
    )
    def test_any_other_is_refused_and_says_why(self, agent):
        capability = _agent_capability(agent)
        assert (capability.status, capability.code) == (
            "unsupported",
            "agent_not_on_inference",
        )
        assert capability.reason

    def test_a_provider_speaking_agent_names_what_it_speaks(self):
        assert "Responses API" in _agent_capability("codex").reason
        assert "no route" in _agent_capability("gemini-cli").reason


class TestClaudeCode:
    """It runs where the deployment says ai-inference has the Bedrock route."""

    def test_without_the_route_it_is_refused_in_a_sentence(self, monkeypatch):
        monkeypatch.delenv(ANTHROPIC_ROUTE_VARIABLE, raising=False)
        capability = _agent_capability("claude-code")
        assert (capability.status, capability.code) == (
            "unsupported",
            "anthropic_route_absent",
        )
        assert "does not answer it from Bedrock" in capability.reason

    @pytest.mark.parametrize("value", ["", "0", "false", "no", "maybe"])
    def test_only_a_plain_yes_opens_it(self, monkeypatch, value):
        monkeypatch.setenv(ANTHROPIC_ROUTE_VARIABLE, value)
        assert _agent_capability("claude-code").status == "unsupported"

    def test_with_the_route_it_runs(self, monkeypatch):
        monkeypatch.setenv(ANTHROPIC_ROUTE_VARIABLE, "1")
        assert _agent_capability("claude-code").status == "framework-run"

    def test_the_route_opens_only_that_agent(self, monkeypatch):
        monkeypatch.setenv(ANTHROPIC_ROUTE_VARIABLE, "1")
        assert {_agent_capability(agent).code for agent in ("codex", "gemini-cli")} == {
            "agent_not_on_inference"
        }

    def test_it_plans_on_the_relay_and_keeps_no_token(self, monkeypatch):
        monkeypatch.setenv(ANTHROPIC_ROUTE_VARIABLE, "1")
        plan = HarborAdapter().plan(
            _definition(tasks=[_task()], agents=["claude-code"], n_attempts=1),
            grant=LaunchGrant(),
        )
        assert blocking(plan.capabilities) == []
        assert plan.policy["network"] == "inference"
        assert plan.resolved_configuration["anthropic"] is True
        assert plan.resolved_configuration["environment_only"] is False

    def test_on_a_task_with_its_own_environment_it_is_out_of_the_relays_reach(
        self, monkeypatch
    ):
        monkeypatch.setenv(ANTHROPIC_ROUTE_VARIABLE, "1")
        monkeypatch.setenv(ENVIRONMENTS_VARIABLE, "image")
        task = _task(dockerfile=True, dockerfile_content="FROM a\n")
        plan = HarborAdapter().plan(
            _definition(tasks=[task], agents=["claude-code"], n_attempts=1),
            grant=LaunchGrant(),
        )
        assert [item.code for item in blocking(plan.capabilities)] == [
            "agent_needs_the_relay"
        ]

    def test_it_needs_a_catalogue_bedrock_model(self):
        with pytest.raises(ValueError, match="bedrock"):
            _import_for_agents(["claude-code"], models=[])
        with pytest.raises(ValueError, match="ai-inference"):
            _import_for_agents(["claude-code"], models=["anthropic/claude-opus"])

    def test_each_model_is_an_experiment_with_the_harbor_name_at_run_time(self):
        imported = _import_for_agents(
            ["claude-code", "oracle"], models=["bedrock:us.anthropic.claude-sonnet-5"]
        )
        assert [item["subject"].get("model") for item in imported.experiments] == [
            "bedrock:us.anthropic.claude-sonnet-5",
            None,
        ]
        assert (
            _agent_model("bedrock:us.anthropic.claude-sonnet-5")
            == "anthropic/us.anthropic.claude-sonnet-5"
        )


def _import_for_agents(agents, *, models):
    task = _task()
    inspection = Inspection(
        framework="harbor",
        adapter_version="1",
        framework_version=HARBOR_VERSION,
        archive_digest="sha256:" + "0" * 64,
        name="n",
        entry_points=[task["path"]],
        configuration={"tasks": [task], "agents": agents, "n_attempts": 1},
        content_digest="sha256:" + "0" * 64,
    )
    return HarborAdapter().import_definition(
        inspection,
        selection=Selection(models=models),
        source=SourceRef(kind="archive", reference="sha256:" + "0" * 64),
    )


def _definition(**configuration):
    return ExternalDefinition(
        framework="harbor",
        adapter_version="1",
        framework_version=HARBOR_VERSION,
        source=SourceRef(kind="archive", reference="a" * 64),
        entry_point="tasks/t",
        configuration={
            "tasks": [_task()],
            "agents": ["oracle"],
            "n_attempts": 2,
            **configuration,
        },
        content_digest="b" * 64,
    )


class TestThePlan:
    def test_no_network_no_secret_and_one_sandbox_an_attempt(self):
        plan = HarborAdapter().plan(_definition(), grant=LaunchGrant())
        assert blocking(plan.capabilities) == []
        assert (plan.policy["network"], plan.policy["secrets"]) == ("none", [])
        assert plan.resolved_configuration["attempts"] == 2
        assert "/logs" in plan.policy["root_dirs"]

    def test_the_pods_network_and_a_provider_key_are_refused(self):
        plan = HarborAdapter().plan(
            _definition(),
            grant=LaunchGrant(network="boundary", secrets=["OPENAI_API_KEY"]),
        )
        assert {item.code for item in blocking(plan.capabilities)} == {
            "direct_network_refused",
            "provider_key_refused",
        }

    def test_the_reproduction_is_pinned(self):
        assert (
            f"pip install harbor=={HARBOR_VERSION}"
            in HarborAdapter().plan(_definition(), grant=LaunchGrant()).reproduction
        )


def _plan():
    return AdapterPlan(
        framework="harbor",
        adapter_version="1",
        framework_version=HARBOR_VERSION,
        environment="x",
        policy={},
        capabilities=[],
        resolved_configuration={},
    )


class TestAResult:
    TRIAL = Trial(case_id="c", native_id="tasks/t")

    def _with(self, result):
        return HarborAdapter().normalize_result(
            self.TRIAL,
            RawResult(
                returncode=0, payload={"version": HARBOR_VERSION, "result": result}
            ),
            plan=_plan(),
        )

    def test_every_reward_dimension_stays_and_none_is_summed(self):
        result = self._with(
            {"verifier_result": {"rewards": {"correct": 1, "tidy": 0.5}}}
        )
        assert (result.status, result.score) == ("review", None)
        assert {score.name: score.value for score in result.scores} == {
            "correct": 1,
            "tidy": 0.5,
        }

    def test_a_single_reward_is_the_headline(self):
        assert (
            self._with({"verifier_result": {"rewards": {"reward": 1}}}).status
            == "passed"
        )

    def test_no_reward_is_the_verifiers_failure(self):
        assert self._with({"verifier_result": None}).failure_mode == "no_reward"

    def test_an_exception_keeps_its_stage(self):
        assert (
            self._with(
                {
                    "exception_info": {
                        "exception_type": "AgentTimeoutError",
                        "exception_message": "late",
                    }
                }
            ).failure_stage
            == "agent"
        )
        assert (
            self._with(
                {
                    "exception_info": {
                        "exception_type": "EnvironmentStartError",
                        "exception_message": "no",
                    }
                }
            ).failure_stage
            == "infrastructure"
        )

    def test_a_result_of_another_harbor_is_refused(self):
        with pytest.raises(ValueError):
            HarborAdapter().normalize_result(
                self.TRIAL,
                RawResult(returncode=0, payload={"version": "0.0.1", "result": {}}),
                plan=_plan(),
            )


@needs_harbor
class TestTheRealHarbor:
    @pytest.fixture(scope="class")
    def world(self, tmp_path_factory):
        host = AdapterHost(tmp_path_factory.mktemp("harbor-host"))
        data = archive_of(FIXTURE)
        digest = archive_digest(data)
        host.put_source(digest, data)
        inspection = host.inspect("harbor", digest)
        adapter = HarborAdapter()
        imported = adapter.import_definition(
            inspection,
            selection=Selection(),
            source=SourceRef(kind="archive", reference=digest),
        )
        plan = adapter.plan(imported.external_definition, grant=LaunchGrant())
        return {
            "host": host,
            "digest": digest,
            "inspection": inspection,
            "imported": imported,
            "plan": plan,
        }

    def _trial(self, world, name, attempt=1, agent="oracle"):
        case = next(item for item in world["imported"].cases if item["name"] == name)
        marks = case["metadata"]["external"]
        return Trial(
            case_id=case["id"],
            native_id=marks["native_id"],
            entry_point=marks["entry_point"],
            attempt=attempt,
            input=case["inputs"]["prompt"],
            configuration={"subject": {"agent": agent}},
        )

    def _run(self, world, name, **kwargs):
        return world["host"].execute(
            "harbor",
            world["digest"],
            plan=world["plan"],
            trial=self._trial(world, name, **kwargs),
            secrets={},
        )

    def test_discovery_reads_the_packages_and_runs_none(self, world):
        inspection: Inspection = world["inspection"]
        assert sorted(case.name for case in inspection.cases) == ["greet", "sum-file"]
        assert inspection.framework_version == HARBOR_VERSION
        assert inspection.configuration["n_attempts"] == 2
        assert blocking(inspection.capabilities) == []

    def test_a_trial_keeps_its_structured_reward(self, world):
        result = self._run(world, "sum-file")
        assert {score.name: score.value for score in result.scores} == {
            "correct": 1,
            "tidy": 0.5,
        }, (result.explanation, result.framework)
        assert result.status == "review"
        assert result.framework["agent"] == "oracle"

    def test_a_wrong_answer_is_a_lower_reward_not_an_error(self, world):
        result = self._run(world, "greet")
        assert {score.name: score.value for score in result.scores} == {
            "correct": 0,
            "tidy": 1,
        }

    def test_each_attempt_is_its_own_sandbox(self, world):
        first, second = (
            self._run(world, "sum-file", attempt=1),
            self._run(world, "sum-file", attempt=2),
        )
        assert first.framework["trial_name"] == "attempt-1"
        assert second.framework["trial_name"] == "attempt-2"
        assert [score.value for score in first.scores] == [
            score.value for score in second.scores
        ]

    def test_what_the_verifier_left_is_kept(self, world):
        result = self._run(world, "sum-file")
        names = [item.name for item in result.artifacts]
        assert any(name.endswith("reward.json") for name in names), names
        assert any(name.endswith("result.json") for name in names), names

    def test_a_cancel_ends_the_trial_and_everything_in_it(self, world, tmp_path):
        slow = tmp_path / "slow"
        shutil.copytree(FIXTURE, slow)
        os.chmod(slow / "tasks" / "sum-file" / "solution", 0o755)
        (slow / "tasks" / "sum-file" / "solution" / "solve.sh").write_text(
            "#!/bin/bash\nsleep 60\n"
        )
        data = archive_of(slow)
        digest = archive_digest(data)
        host = world["host"]
        host.put_source(digest, data)
        threading.Timer(2.0, lambda: host.cancel("k")).start()
        started = time.monotonic()
        with pytest.raises(SandboxCancelled):
            host.execute(
                "harbor",
                digest,
                plan=world["plan"],
                trial=self._trial(world, "sum-file"),
                secrets={},
                key="k",
            )
        assert time.monotonic() - started < 15
        assert host._running == {}

    @pytest.mark.skipif(
        shutil.which("docker") is None, reason="no Docker for the local run"
    )
    def test_it_matches_a_local_pinned_run_in_docker(self, world, tmp_path):
        """The same tasks and the same oracle, in Harbor's own Docker environment."""
        tasks = tmp_path / "tasks"
        shutil.copytree(FIXTURE / "tasks", tasks)
        for task in tasks.iterdir():
            (task / "environment").mkdir()
            (task / "environment" / "Dockerfile").write_text("FROM python:3.12-slim\n")
        harbor = str(Path(PYTHON).with_name("harbor"))
        answer = subprocess.run(
            [
                harbor,
                "run",
                "-p",
                str(tasks),
                "--agent",
                "oracle",
                "--env",
                "docker",
                "--jobs-dir",
                str(tmp_path / "jobs"),
                "--yes",
            ],
            capture_output=True,
            text=True,
            timeout=240,
            cwd=tmp_path,
            env={**os.environ, "NO_COLOR": "1"},
        )
        assert answer.returncode == 0, answer.stdout[-800:] + answer.stderr[-800:]
        local = {}
        for path in (tmp_path / "jobs").rglob("result.json"):
            found = json.loads(path.read_text())
            if "task_name" in found and found.get("verifier_result"):
                local[found["task_name"]] = found["verifier_result"]["rewards"]
        assert len(local) == 2, answer.stdout[-800:]
        for name, rewards in local.items():
            result = self._run(world, name.rsplit("/", 1)[-1])
            assert {score.name: score.value for score in result.scores} == rewards
