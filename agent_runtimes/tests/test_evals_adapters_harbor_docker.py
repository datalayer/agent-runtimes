# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A Harbor benchmark as far as it goes on one machine.

Real Harbor, a custom agent, a model, two tasks whose Dockerfiles are really
built, a structured reward, requested artifacts, configured attempts, at
concurrency two, and a budget and a cancel that settle a trial. What stands in:
ai-inference, in its real answer's shape, and Docker for a Datalayer sandbox.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from agent_runtimes.evals.adapters.base import (
    ExternalDefinition,
    InferenceRoute,
    LaunchGrant,
    Selection,
    SourceRef,
    Trial,
    blocking,
)
from agent_runtimes.evals.adapters.harbor import (
    ENVIRONMENTS_VARIABLE,
    HARBOR_VERSION,
    PYTHON_VARIABLE,
    HarborAdapter,
    _custom_capability,
)
from agent_runtimes.evals.adapters.host import AdapterHost
from agent_runtimes.evals.adapters.sandbox import SandboxCancelled
from agent_runtimes.evals.adapters.source import archive_digest, pack_source
from agent_runtimes.evals.adapters.task_environments import TaskEnvironmentRef
from agent_runtimes.tests.test_evals_adapters_environments import (
    BUILT,
    IMAGE,
    STARTED,
    DockerBackend,
    needs_context,
    needs_docker,
    needs_foreign_builds,
)

FIXTURE = Path(__file__).parent / "fixtures" / "harbor-docker"
PROVIDERS = Path(__file__).parents[1] / "evals" / "adapters" / "_providers"
MODEL = "bedrock:us.anthropic.claude-haiku-4-5"
HARBOR = os.environ.get(PYTHON_VARIABLE, "")
ANSWERS = {"40 + 2": "42", "Greet": "hello"}


class _Inference:
    """AI Inference as far as a chat completion goes, answering as it does."""

    def __init__(self) -> None:
        self.calls: list[dict] = []
        self.held = threading.Event()
        self.hold = False

    def __enter__(self) -> "_Inference":
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                outer.calls.append(
                    {"auth": self.headers.get("Authorization"), "model": body["model"]}
                )
                if outer.hold:
                    outer.held.set()
                    time.sleep(30)
                text = next(
                    answer
                    for asked, answer in ANSWERS.items()
                    if asked in body["messages"][-1]["content"]
                )
                data = json.dumps(
                    {
                        "success": True,
                        "choices": [
                            {
                                "index": 0,
                                "finish_reason": "stop",
                                "message": {"role": "assistant", "content": text},
                            }
                        ],
                        "usage": {"prompt_tokens": 1000, "completion_tokens": 100},
                    }
                ).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        return self

    def __exit__(self, *_):
        self.server.shutdown()
        self.server.server_close()

    def route(self, **extra) -> InferenceRoute:
        return InferenceRoute(
            url=f"http://127.0.0.1:{self.server.server_port}/api/ai-inference/v1",
            token="narrowed-token",
            prices={MODEL: [1.0, 5.0]},
            credits_per_usd=100.0,
            **extra,
        )


def _definition(**configuration) -> ExternalDefinition:
    return ExternalDefinition(
        framework="harbor",
        adapter_version="1",
        framework_version=HARBOR_VERSION,
        source=SourceRef(kind="archive", reference="0" * 64),
        entry_point="tasks/t",
        configuration={
            "tasks": [{"name": "t", "path": "tasks/t", "instruction": "x"}],
            **configuration,
        },
        content_digest="0" * 64,
    )


class TestACustomAgent:
    CUSTOM = {"answerer": {"import_path": "answerer:Answerer", "folder": "agents"}}

    def test_one_the_source_holds_runs(self):
        assert (
            _custom_capability("a", self.CUSTOM["answerer"]).status == "framework-run"
        )

    def test_one_it_does_not_hold_is_refused(self):
        capability = _custom_capability(
            "a", {"import_path": "elsewhere:Agent", "folder": ""}
        )
        assert capability.code == "agent_not_in_source"

    def test_it_calls_its_model_through_the_relay_and_nothing_else(self):
        definition = _definition(agents=["answerer"], custom_agents=self.CUSTOM)
        plan = HarborAdapter().plan(definition, grant=LaunchGrant())
        assert blocking(plan.capabilities) == []
        assert plan.policy["network"] == "inference"
        assert plan.resolved_configuration["environment_only"] is False

    def test_a_listed_agent_of_the_same_name_gains_nothing_from_a_name(self):
        definition = _definition(agents=["codex"], custom_agents={})
        plan = HarborAdapter().plan(definition, grant=LaunchGrant())
        assert [item.code for item in blocking(plan.capabilities)] == [
            "agent_not_on_inference"
        ]


@needs_docker
@needs_foreign_builds
@pytest.mark.skipif(not HARBOR, reason="no Harbor")
class TestTheBenchmark:
    @pytest.fixture
    def run(self, tmp_path, monkeypatch):
        monkeypatch.setenv(ENVIRONMENTS_VARIABLE, "image")
        host = AdapterHost(tmp_path / "host", backend_for=DockerBackend)
        data = pack_source(FIXTURE)
        digest = archive_digest(data)
        host.put_source(digest, data)
        adapter = HarborAdapter()
        inspection = host.inspect("harbor", digest)
        imported = adapter.import_definition(
            inspection,
            selection=Selection(models=[MODEL]),
            source=SourceRef(kind="archive", reference=digest),
        )
        plan = adapter.plan(imported.external_definition, grant=LaunchGrant())
        assert blocking(plan.capabilities) == []
        images = {}
        for entry, document in plan.resolved_configuration["task_environments"].items():
            content = document["spec"]["build"]["dockerfile"]["content"]
            tag = f"{BUILT}{hashlib.sha256(content.encode()).hexdigest()[:12]}"
            subprocess.run(
                ["docker", "build", "-q", "-t", tag, "-"],
                input=content.encode(),
                check=True,
                capture_output=True,
                timeout=120,
            )
            images[entry] = tag
        yield host, digest, plan, imported, images
        for name in STARTED:
            subprocess.run(
                ["docker", "rm", "-f", name], capture_output=True, timeout=30
            )
        STARTED.clear()

    def _trial(self, imported, case, attempt=1):
        marks = case["metadata"]["external"]
        return Trial(
            case_id=case["id"],
            native_id=marks["native_id"],
            entry_point=marks["entry_point"],
            attempt=attempt,
            configuration={"subject": imported.experiments[0]["subject"]},
        )

    def _execute(self, world, case, inference, *, attempt=1, key=None):
        host, digest, plan, imported, images = world
        trial = self._trial(imported, case, attempt)
        return host.execute(
            "harbor",
            digest,
            plan=plan,
            trial=trial,
            secrets={},
            inference=inference,
            environment=TaskEnvironmentRef(
                ingress=images[trial.entry_point], token="environment-token"
            ),
            key=key,
        )

    def test_it_runs_two_tasks_twice_each_at_concurrency_two(self, run):
        _host, _digest, _plan, imported, _images = run
        with _Inference() as inference, ThreadPoolExecutor(2) as pool:
            work = [
                pool.submit(
                    self._execute, run, case, inference.route(), attempt=attempt
                )
                for case in imported.cases
                for attempt in (1, 2)
            ]
            results = [item.result(timeout=240) for item in work]
        assert len(results) == 4
        for result in results:
            scores = {score.name: score.value for score in result.scores}
            assert scores == {"correct": 1, "image": 1}, (
                result.explanation,
                result.framework,
            )
            kept = {item.name.rsplit("__", 1)[-1]: item for item in result.artifacts}
            assert base64.b64decode(kept["answer.txt"].content_base64) in {
                b"42",
                b"hello",
            }
            assert result.usage["credits_consumed"] > 0
            dumped = result.model_dump_json()
            assert "narrowed-token" not in dumped
            assert "environment-token" not in dumped
        assert len(inference.calls) == 4
        assert {call["auth"] for call in inference.calls} == {"Bearer narrowed-token"}
        assert {call["model"] for call in inference.calls} == {MODEL}

    def test_a_spent_budget_settles_the_trial_and_no_call_leaves(self, run):
        _host, _digest, _plan, imported, _images = run
        with _Inference() as inference:
            result = self._execute(
                run, imported.cases[0], inference.route(credit_limit=0.0)
            )
        assert inference.calls == []
        assert (result.status, result.failure_stage) == ("failed", "budget")

    def test_a_cancel_ends_the_trial(self, run):
        host, _digest, _plan, imported, _images = run
        with _Inference() as inference:
            inference.hold = True
            cancelled = threading.Timer(
                0, lambda: inference.held.wait(60) and host.cancel("the-key")
            )
            cancelled.start()
            with pytest.raises(SandboxCancelled):
                self._execute(run, imported.cases[0], inference.route(), key="the-key")


class TestTheContextRead:
    """Standard library code, run here as a runner runs it in a sandbox."""

    def _read(self, folder, dockerfile):
        sys.path.insert(0, str(PROVIDERS))
        try:
            from _build_context import read_context

            return read_context(folder, dockerfile)
        finally:
            sys.path.remove(str(PROVIDERS))

    def test_a_dockerfile_that_copies_nothing_reads_nothing(self, tmp_path):
        (tmp_path / "big").write_bytes(b"x" * 2_000_000)
        assert self._read(tmp_path, "FROM a:1\nRUN true\n") == {"context": []}

    def test_what_it_copies_is_read_with_its_mode(self, tmp_path):
        (tmp_path / "bin").mkdir()
        (tmp_path / "bin" / "run.sh").write_text("#!/bin/sh\n")
        (tmp_path / "bin" / "run.sh").chmod(0o755)
        (tmp_path / "Dockerfile").write_text("x")
        [file] = self._read(tmp_path, "FROM a:1\ncopy bin /bin\n")["context"]
        assert (file["path"], file["executable"]) == ("bin/run.sh", True)

    def test_too_much_is_said_and_not_read(self, tmp_path):
        (tmp_path / "big").write_bytes(b"x" * 2_000_000)
        answer = self._read(tmp_path, "FROM a:1\nCOPY big /\n")
        assert answer == {"context": [], "context_too_large": True}

    def test_too_much_is_refused_in_a_sentence(self, monkeypatch):
        monkeypatch.setenv(ENVIRONMENTS_VARIABLE, "image")
        definition = _definition(agents=["oracle"])
        definition.configuration["tasks"][0].update(
            dockerfile=True, dockerfile_content="FROM a:1\n", context_too_large=True
        )
        plan = HarborAdapter().plan(definition, grant=LaunchGrant())
        assert [item.code for item in blocking(plan.capabilities)] == [
            "environment_refused"
        ]


@needs_docker
@needs_context
@pytest.mark.skipif(not HARBOR, reason="no Harbor")
def test_a_tasks_context_reaches_its_image(tmp_path, monkeypatch):
    """Inspected in the sandbox, carried in the spec, built, and read by a verifier."""
    monkeypatch.setenv(ENVIRONMENTS_VARIABLE, "image")
    root = tmp_path / "project"
    shutil.copytree(FIXTURE, root)
    task = root / "tasks" / "sum-file" / "environment"
    (task / "marker.txt").write_text("sum-file\n")
    (task / "Dockerfile").write_text(
        "FROM python:3.12-slim\nCOPY marker.txt /etc/task-image\n"
    )
    host = AdapterHost(tmp_path / "host", backend_for=DockerBackend)
    data = pack_source(root)
    digest = archive_digest(data)
    host.put_source(digest, data)
    adapter = HarborAdapter()
    imported = adapter.import_definition(
        host.inspect("harbor", digest),
        selection=Selection(models=[MODEL], entry_points=["tasks/sum-file"]),
        source=SourceRef(kind="archive", reference=digest),
    )
    plan = adapter.plan(imported.external_definition, grant=LaunchGrant())
    assert blocking(plan.capabilities) == []
    dockerfile = plan.resolved_configuration["task_environments"]["tasks/sum-file"][
        "spec"
    ]["build"]["dockerfile"]
    context = tmp_path / "context"
    context.mkdir()
    (context / "Dockerfile").write_text(dockerfile["content"])
    for item in dockerfile["context"]:
        (context / item["path"]).write_bytes(base64.b64decode(item["contentBase64"]))
    tag = f"{BUILT}context"
    subprocess.run(
        ["docker", "build", "-q", "-t", tag, str(context)],
        check=True,
        capture_output=True,
        timeout=120,
    )
    marks = imported.cases[0]["metadata"]["external"]
    try:
        with _Inference() as inference:
            result = host.execute(
                "harbor",
                digest,
                plan=plan,
                trial=Trial(
                    case_id=imported.cases[0]["id"],
                    native_id=marks["native_id"],
                    entry_point=marks["entry_point"],
                    configuration={"subject": imported.experiments[0]["subject"]},
                ),
                secrets={},
                inference=inference.route(),
                environment=TaskEnvironmentRef(ingress=tag, token="environment-token"),
            )
    finally:
        for name in STARTED:
            subprocess.run(
                ["docker", "rm", "-f", name], capture_output=True, timeout=30
            )
        STARTED.clear()
    assert {score.name: score.value for score in result.scores} == {
        "correct": 1,
        "image": 1,
    }, (result.explanation, result.framework)


def test_the_fixture_is_the_examples():
    """The example people read is the one these tests run."""
    example = (
        Path(__file__).parents[4]
        / "tech"
        / "datalayer"
        / "examples"
        / "evals"
        / "harbor-docker"
    )
    if not example.is_dir():
        pytest.skip("the examples are not beside this checkout")
    assert shutil.which("diff")
    done = subprocess.run(
        [
            "diff",
            "-r",
            str(FIXTURE),
            str(example),
            "-x",
            "README.md",
            "-x",
            "__pycache__",
        ],
        capture_output=True,
        text=True,
    )
    assert done.returncode == 0, done.stdout
