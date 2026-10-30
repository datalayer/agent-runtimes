# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""One provider for every framework's task environment.

The mapping onto an Environment, checked by the Environments package's own
validator. The production backend, against a stand-in that really runs what the
execute route is sent. And the whole door against real containers: real Inspect
and real Harbor, in the real sandbox, through the real relay, to a Docker
backend standing where a Datalayer sandbox stands. Docker is the stand-in; what
is proved is the provider, not the cluster.
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Mapping, Sequence

import pytest
from code_sandboxes.environments.spec import BUILD_SOURCES

from agent_runtimes.evals.adapters.base import (
    LaunchGrant,
    Selection,
    SourceRef,
    Trial,
    blocking,
)
from agent_runtimes.evals.adapters.harbor import ENVIRONMENTS_VARIABLE, HarborAdapter
from agent_runtimes.evals.adapters.host import AdapterHost
from agent_runtimes.evals.adapters.inspect_ai import SANDBOXES_VARIABLE, InspectAdapter
from agent_runtimes.evals.adapters.sandbox import isolation_available
from agent_runtimes.evals.adapters.source import archive_digest
from agent_runtimes.evals.adapters.task_environments import (
    EnvironmentRefused,
    RuntimeBackend,
    TaskEnvironmentRef,
    environment_name_of,
    environment_of,
)

FIXTURES = Path(__file__).parent / "fixtures"
HARBOR = os.environ.get("DATALAYER_HARBOR_PYTHON", "")
INSPECT = os.environ.get("DATALAYER_INSPECT_AI_PYTHON", "")
IMAGE = "python:3.12-slim"
#: A layered image to run the same trials in, as the contract's user. One a
#: build made; the plain image stands for the sandbox without it.
TASK_IMAGE = os.environ.get("DATALAYER_TASK_ENVIRONMENT_IMAGE", IMAGE)


def _docker_ready() -> bool:
    if shutil.which("docker") is None:
        return False
    return (
        subprocess.run(
            ["docker", "image", "inspect", IMAGE], capture_output=True, timeout=20
        ).returncode
        == 0
    )


#: A Dockerfile on a task's own base needs the code-sandboxes that builds one.
needs_foreign_builds = pytest.mark.skipif(
    "foreignDockerfile" not in BUILD_SOURCES,
    reason="this code-sandboxes does not build a Dockerfile on a foreign base",
)
needs_docker = pytest.mark.skipif(
    not (isolation_available() and _docker_ready()),
    reason=f"no namespaces, or no Docker with {IMAGE}",
)


def archive_of(root: Path) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for path in sorted(root.rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts:
                tar.add(path, arcname=path.relative_to(root).as_posix())
    return buffer.getvalue()


class TestAnEnvironment:
    def _validated(self, document):
        from code_sandboxes.environments.spec import parse_environment

        return parse_environment(document)

    def test_an_image_is_imported(self):
        document = environment_of(image="docker.io/library/python:3.12-slim")
        parsed = self._validated(document)
        assert parsed.spec.build.source == "image"
        assert parsed.spec.build.image.reference.endswith("python:3.12-slim")

    @needs_foreign_builds
    def test_a_dockerfile_is_built_on_the_base_it_names(self):
        parsed = self._validated(environment_of(dockerfile="FROM python:3.12-slim\n"))
        assert parsed.spec.build.source == "foreignDockerfile"

    @needs_foreign_builds
    def test_a_registry_outside_the_list_is_refused_at_the_launch(self):
        with pytest.raises(EnvironmentRefused, match="is not an allowed registry"):
            environment_of(dockerfile="FROM registry.example.com/team/task:1\n")

    def test_an_image_from_elsewhere_is_refused_at_the_launch(self):
        with pytest.raises(EnvironmentRefused, match="is not an allowed registry"):
            environment_of(image="registry.example.com/team/task:1")

    def test_the_same_task_is_the_same_environment(self):
        one, two = (
            environment_of(image="docker.io/a:1"),
            environment_of(image="docker.io/a:1"),
        )
        assert one["metadata"]["name"] == two["metadata"]["name"]
        assert (
            one["metadata"]["name"]
            != environment_of(image="docker.io/b:1")["metadata"]["name"]
        )
        assert environment_name_of(one["spec"]) == one["metadata"]["name"]

    def test_a_build_context_is_refused_not_lost(self):
        with pytest.raises(EnvironmentRefused, match="requirements.txt"):
            environment_of(
                dockerfile="FROM a\nCOPY requirements.txt .\n",
                extra_files=["requirements.txt"],
            )

    def test_nothing_to_build_is_refused(self):
        with pytest.raises(EnvironmentRefused):
            environment_of()


class _ExecuteRoute:
    """A runtime's execute route that really runs what it is sent."""

    def __enter__(self) -> "_ExecuteRoute":
        seen: list[dict[str, Any]] = []
        self.seen = seen

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                seen.append(
                    {"path": self.path, "auth": self.headers.get("Authorization")}
                )
                done = subprocess.run(
                    [sys.executable, "-c", body["code"]],
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                data = json.dumps(
                    {"success": True, "stdout": done.stdout, "stderr": done.stderr}
                ).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        return self

    def __exit__(self, *_):
        self.server.shutdown()
        self.server.server_close()


class TestTheRuntimeBackend:
    @pytest.fixture
    def backend(self, monkeypatch):
        with _ExecuteRoute() as route:
            monkeypatch.setattr(
                "agent_runtimes.client.agent_client.build_agent_runtimes_base_url",
                lambda ingress: ingress,
            )
            backend = RuntimeBackend(
                TaskEnvironmentRef(
                    ingress=f"http://127.0.0.1:{route.server.server_port}",
                    token="person",
                )
            )
            backend.route = route  # type: ignore[attr-defined]
            yield backend

    def test_a_command_runs_with_its_input_directory_and_environment(
        self, backend, tmp_path
    ):
        answer = backend.exec(
            ["sh", "-c", "cat; pwd; echo $NAMED; exit 3"],
            stdin=b"in\n",
            cwd=str(tmp_path),
            env={"NAMED": "yes"},
        )
        assert answer["returncode"] == 3
        assert answer["stdout"].split() == ["in", str(tmp_path), "yes"]
        assert backend.route.seen[0]["path"] == "/api/v1/sandbox/execute"
        assert backend.route.seen[0]["auth"] == "Bearer person"

    def test_files_go_both_ways_byte_for_byte(self, backend, tmp_path):
        path = str(tmp_path / "deep" / "file")
        backend.write(path, bytes(range(256)))
        assert backend.read(path) == bytes(range(256))

    def test_a_missing_file_is_a_missing_file(self, backend, tmp_path):
        with pytest.raises(FileNotFoundError):
            backend.read(str(tmp_path / "none"))

    def test_a_timeout_is_a_timeout(self, backend):
        assert backend.exec(["sleep", "5"], timeout=1)["returncode"] == 124

    def test_a_command_starts_where_the_task_worked(
        self, backend, tmp_path, monkeypatch
    ):
        (tmp_path / "workdir").write_text(str(tmp_path))
        monkeypatch.setattr(
            "agent_runtimes.evals.adapters.task_environments.TASK_WORKDIR_FILE",
            str(tmp_path / "workdir"),
        )
        assert backend.exec(["pwd"])["stdout"].strip() == str(tmp_path)

    def test_it_runs_as_the_sandboxs_own_user(self, backend):
        with pytest.raises(PermissionError):
            backend.exec(["true"], user="someone")


class DockerBackend:
    """A real container, where a Datalayer sandbox stands in production."""

    def __init__(self, reference: TaskEnvironmentRef) -> None:
        self.name = f"task-environment-{uuid.uuid4().hex[:10]}"
        subprocess.run(
            [
                "docker",
                "run",
                "-d",
                "--rm",
                "--network",
                "none",
                "--name",
                self.name,
                TASK_IMAGE,
                "sleep",
                "300",
            ],
            check=True,
            capture_output=True,
            timeout=60,
        )
        STARTED.append(self.name)

    def exec(
        self,
        argv: Sequence[str],
        *,
        stdin: bytes = b"",
        cwd: str | None = None,
        env: Mapping[str, str] | None = None,
        timeout: float | None = None,
        user: str | None = None,
    ) -> dict[str, Any]:
        command = (
            ["docker", "exec", "-i"]
            + (["-w", cwd] if cwd else [])
            + [
                flag
                for key, value in (env or {}).items()
                for flag in ("-e", f"{key}={value}")
            ]
            + [self.name, *argv]
        )
        done = subprocess.run(
            command, input=stdin, capture_output=True, timeout=timeout or 120
        )
        return {
            "returncode": done.returncode,
            "stdout": done.stdout.decode("utf-8", "replace"),
            "stderr": done.stderr.decode("utf-8", "replace"),
        }

    def write(self, path: str, content: bytes) -> None:
        self.exec(
            ["sh", "-c", 'mkdir -p "$(dirname "$1")" && cat > "$1"', "sh", path],
            stdin=content,
        )

    def read(self, path: str) -> bytes:
        done = subprocess.run(
            ["docker", "exec", self.name, "cat", path], capture_output=True, timeout=60
        )
        if done.returncode != 0:
            raise FileNotFoundError(path)
        return done.stdout


STARTED: list[str] = []


@pytest.fixture
def host(tmp_path):
    yield AdapterHost(tmp_path / "host", backend_for=DockerBackend)
    for name in STARTED:
        with contextlib.suppress(subprocess.SubprocessError):
            subprocess.run(
                ["docker", "rm", "-f", name], capture_output=True, timeout=30
            )
    STARTED.clear()


REF = TaskEnvironmentRef(ingress="https://unused", token="environment-token")


@needs_docker
@needs_foreign_builds
@pytest.mark.skipif(not HARBOR, reason="DATALAYER_HARBOR_PYTHON names no Harbor")
class TestHarborInAnImage:
    def test_a_task_with_a_dockerfile_runs_its_trial_in_a_real_container(
        self, host, tmp_path, monkeypatch
    ):
        monkeypatch.setenv(ENVIRONMENTS_VARIABLE, "image")
        root = tmp_path / "project"
        shutil.copytree(FIXTURES / "harbor", root)
        for task in (root / "tasks").iterdir():
            (task / "environment").mkdir()
            (task / "environment" / "Dockerfile").write_text(f"FROM {IMAGE}\n")
        # Only a real container has this: the proof the commands ran there.
        (root / "tasks" / "sum-file" / "solution" / "solve.sh").write_text(
            '#!/bin/bash\nmkdir -p /workspace\npython -c "print(40 + 2)" > /workspace/answer.txt\nhostname > /logs/agent/where.txt\n'
        )
        data = archive_of(root)
        digest = archive_digest(data)
        host.put_source(digest, data)
        adapter = HarborAdapter()
        imported = adapter.import_definition(
            host.inspect("harbor", digest),
            selection=Selection(),
            source=SourceRef(kind="archive", reference=digest),
        )
        plan = adapter.plan(imported.external_definition, grant=LaunchGrant())
        assert blocking(plan.capabilities) == []
        assert plan.policy["network"] == "inference"
        case = next(item for item in imported.cases if item["name"] == "sum-file")
        marks = case["metadata"]["external"]
        assert (
            plan.resolved_configuration["task_environments"][marks["entry_point"]][
                "spec"
            ]["build"]["source"]
            == "foreignDockerfile"
        )
        trial = Trial(
            case_id=case["id"],
            native_id=marks["native_id"],
            entry_point=marks["entry_point"],
            configuration={"subject": {"agent": "oracle"}},
        )
        result = host.execute(
            "harbor", digest, plan=plan, trial=trial, secrets={}, environment=REF
        )
        assert {score.name: score.value for score in result.scores} == {
            "correct": 1,
            "tidy": 0.5,
        }, (result.explanation, result.framework)
        assert "environment-token" not in result.model_dump_json()

    def test_without_the_deployment_saying_so_it_stays_unsupported(
        self, host, tmp_path, monkeypatch
    ):
        monkeypatch.delenv(ENVIRONMENTS_VARIABLE, raising=False)
        root = tmp_path / "project"
        shutil.copytree(FIXTURES / "harbor", root)
        (root / "tasks" / "greet" / "environment").mkdir()
        (root / "tasks" / "greet" / "environment" / "Dockerfile").write_text(
            f"FROM {IMAGE}\n"
        )
        data = archive_of(root)
        digest = archive_digest(data)
        host.put_source(digest, data)
        assert {
            item.code for item in blocking(host.inspect("harbor", digest).capabilities)
        } == {"image_unavailable"}


@needs_docker
@pytest.mark.skipif(not INSPECT, reason="DATALAYER_INSPECT_AI_PYTHON names no Inspect")
class TestInspectInAnImage:
    TASK = """
from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.model import ModelOutput, get_model
from inspect_ai.scorer import includes
from inspect_ai.solver import generate, use_tools
from inspect_ai.tool import bash


def scripted(messages, tools, tool_choice, config):
    told = [item for item in messages if item.role == "tool"]
    if told:
        return ModelOutput.from_content("mockllm/model", told[-1].text)
    return ModelOutput.for_tool_call("mockllm/model", "bash", {"command": "python -c 'print(6 * 7)'; test -f /.dockerenv && echo contained"})


@task
def in_docker():
    return Task(
        dataset=[Sample(id="s", input="six times seven", target="42")],
        solver=[use_tools(bash(timeout=30)), generate()],
        scorer=includes(),
        sandbox=("docker", "compose.yaml"),
        model=get_model("mockllm/model", custom_outputs=scripted),
    )
"""

    def test_a_tool_runs_in_the_task_image_through_inspects_extension_api(
        self, host, tmp_path, monkeypatch
    ):
        monkeypatch.setenv(SANDBOXES_VARIABLE, "datalayer")
        root = tmp_path / "project"
        root.mkdir()
        (root / "task.py").write_text(self.TASK)
        (root / "compose.yaml").write_text(
            f"services:\n  default:\n    image: {IMAGE}\n"
        )
        data = archive_of(root)
        digest = archive_digest(data)
        host.put_source(digest, data)
        adapter = InspectAdapter()
        imported = adapter.import_definition(
            host.inspect("inspect-ai", digest),
            selection=Selection(),
            source=SourceRef(kind="archive", reference=digest),
        )
        plan = adapter.plan(
            imported.external_definition, grant=LaunchGrant(tools=["bash"])
        )
        assert blocking(plan.capabilities) == []
        marks = imported.cases[0]["metadata"]["external"]
        spec = plan.resolved_configuration["task_environments"][marks["entry_point"]]
        assert spec["spec"]["build"]["image"]["reference"] == IMAGE
        trial = Trial(
            case_id="c",
            native_id=marks["native_id"],
            entry_point=marks["entry_point"],
            configuration={"subject": {}},
        )
        result = host.execute(
            "inspect-ai", digest, plan=plan, trial=trial, secrets={}, environment=REF
        )
        assert result.status == "passed", (result.explanation, result.framework)
        assert "42" in result.output
        assert "contained" in result.output, (
            "the tool ran in the container, not the sandbox"
        )
