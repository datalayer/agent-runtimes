# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`agent-runtimes evals adapters`, and the record every side of them shares."""

from __future__ import annotations

import base64
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any

import pytest
from typer.testing import CliRunner

from agent_runtimes.__main__ import app
from agent_runtimes.commands import evals as evals_commands
from agent_runtimes.evals.adapters.base import (
    AdapterPlan,
    ExternalDefinition,
    LaunchGrant,
)
from agent_runtimes.evals.adapters.registry import adapter
from agent_runtimes.evals.adapters.source import (
    content_digest,
    pack_source,
    unpack_archive,
)

runner = CliRunner(
    env={"NO_COLOR": "1", "TERM": "dumb", "_TYPER_STANDARD_TRACEBACK": "1"}
)
GOLDEN = Path(__file__).parent / "golden" / "external-definition.golden.json"

INSPECTION = {
    "id": "i1",
    "status": "ready",
    "digest": "a" * 64,
    "inspection": {
        "framework": "inspect-ai",
        "framework_version": "0.3.286",
        "adapter_version": "1",
        "entry_points": ["tasks.py@t"],
        "cases": [{}, {}],
        "capabilities": [
            {
                "status": "unsupported",
                "kind": "sandbox",
                "component": "docker",
                "reason": "no Docker",
            }
        ],
    },
}


class Client:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.plan: dict[str, Any] = {
            "ok": True,
            "problems": [],
            "external_plan": {"reproduction": "pip install inspect-ai==0.3.286"},
        }
        self.pending = 0

    def evals_list_adapters(self):
        return {
            "adapters": [
                {
                    "framework": "inspect-ai",
                    "framework_version": "0.3.286",
                    "adapter_version": "1",
                    "environment": "inspect-ai-env",
                }
            ]
        }

    def evals_inspect_source(self, **kwargs):
        self.calls.append(("inspect", kwargs))
        return {"inspection": {"id": "i1", "status": "pending"}}

    def evals_get_inspection(self, inspection_id):
        return {"inspection": INSPECTION}

    def evals_import_external(self, **kwargs):
        self.calls.append(("import", kwargs))
        return {
            "evalset": {"id": "e1", "name": "n", "cases": [{}]},
            "experiments": [{"id": "x1", "name": "m"}],
        }

    def evals_list_experiments(self, **kwargs):
        return {"experiments": [{"id": "x1"}]}

    def evals_validate_launch(self, evalset_id, **kwargs):
        self.calls.append(("validate", kwargs))
        return self.plan

    def evals_create_launch(self, evalset_id, **kwargs):
        self.calls.append(("launch", kwargs))
        return {"launch": {"id": "l1"}}


@pytest.fixture
def client(monkeypatch):
    fake = Client()
    monkeypatch.setattr(evals_commands, "_make_client", lambda **_: fake)
    monkeypatch.setattr(evals_commands, "INSPECTION_POLL_SECONDS", 0)
    return fake


def _invoke(*arguments):
    return runner.invoke(app, ["evals", "adapters", *arguments])


def test_it_lists_what_is_offered(client):
    answered = _invoke("ls")
    assert answered.exit_code == 0, answered.output
    assert "inspect-ai" in answered.output


def test_a_directory_is_packed_and_inspected(client, tmp_path):
    (tmp_path / "task.py").write_text("x = 1")
    answered = _invoke(
        "inspect", "inspect-ai", str(tmp_path), "--task-arg", "mock=false"
    )
    assert answered.exit_code == 0, answered.output
    _, sent = client.calls[0]
    assert sent["framework"] == "inspect-ai"
    assert sent["options"] == {"task_args": {"mock": False}}
    assert base64.b64decode(sent["content_base64"]) == pack_source(tmp_path)
    assert "unsupported" in answered.output and "no Docker" in answered.output


def test_an_import_says_what_was_chosen(client):
    answered = _invoke(
        "import",
        "i1",
        "--model",
        "bedrock:x",
        "--model",
        "alibaba:y",
        "--scorer",
        "includes",
        "--threshold",
        "0.5",
        "--limit",
        "2",
    )
    assert answered.exit_code == 0, answered.output
    assert client.calls[0] == (
        "import",
        {
            "inspection_id": "i1",
            "selection": {
                "models": ["bedrock:x", "alibaba:y"],
                "aggregation": {"scorer": "includes", "threshold": 0.5},
                "limit": 2,
            },
        },
    )


def test_a_launch_approves_tools_by_name_and_stops_on_a_refusal(client):
    client.plan = {
        "ok": False,
        "problems": [{"severity": "error", "message": "tool add needs approving"}],
    }
    answered = _invoke("launch", "e1")
    assert answered.exit_code == 1
    assert "tool add needs approving" in answered.output
    assert not [call for call in client.calls if call[0] == "launch"]
    client.plan = {"ok": True}
    assert _invoke("launch", "e1", "--tool", "add", "--concurrency", "3").exit_code == 0
    assert "application" not in client.calls[-1][1]["config"]
    assert client.calls[-1] == (
        "launch",
        {"experiment_ids": ["x1"], "config": {"concurrency": 3, "tools": ["add"]}},
    )


def test_one_source_is_named(client):
    assert _invoke("inspect", "harbor").exit_code == 1
    answered = _invoke("inspect", "harbor", "--registry", "harbor/hello@latest")
    assert answered.exit_code == 1
    assert "not pinned" in answered.output


def test_a_git_source_is_fetched_here_and_kept_as_an_archive(client, tmp_path):
    def git(*arguments):
        subprocess.run(
            ["git", "-c", "user.name=t", "-c", "user.email=t@t", *arguments],
            cwd=tmp_path,
            check=True,
            capture_output=True,
        )

    git("init", "-q")
    (tmp_path / "task.toml").write_text("")
    git("add", ".")
    git("commit", "-qm", "one")
    commit = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=tmp_path, capture_output=True, text=True
    ).stdout.strip()
    answered = _invoke(
        "inspect",
        "harbor",
        "--git",
        f"file://{tmp_path}",
        "--commit",
        commit,
        "--no-wait",
    )
    assert answered.exit_code == 0, answered.output
    kept = [call[1] for call in client.calls if call[0] == "inspect"]
    assert kept and kept[0]["filename"] == "fetched.tar.gz"


def test_the_reproduction_is_the_plans(client):
    answered = _invoke("reproduce", "e1")
    assert answered.exit_code == 0, answered.output
    assert "pip install inspect-ai==0.3.286" in answered.output


def test_a_benchmark_made_here_has_none(client):
    client.plan = {"ok": True, "external_plan": None}
    assert _invoke("reproduce", "e1").exit_code == 1


def test_a_source_packs_to_the_same_bytes_every_time(tmp_path):
    root = tmp_path / "source"
    (root / "pkg").mkdir(parents=True)
    (root / "pkg" / "a.py").write_text("a")
    (root / "b.txt").write_text("b")
    (root / "__pycache__").mkdir()
    (root / "__pycache__" / "x.pyc").write_text("x")
    first = pack_source(root)
    (root / "b.txt").touch()
    assert pack_source(root) == first
    assert (
        hashlib.sha256(first).hexdigest()
        == hashlib.sha256(pack_source(root)).hexdigest()
    )
    unpack_archive(first, tmp_path / "out")
    assert sorted(
        path.name for path in (tmp_path / "out").rglob("*") if path.is_file()
    ) == ["a.py", "b.txt"]
    assert content_digest(tmp_path / "out")


def test_the_golden_plan_is_what_the_adapter_plans_today(monkeypatch):
    """A field a plan gains fails here, rather than in the service that reads it."""
    monkeypatch.delenv("DATALAYER_INSPECT_AI_SANDBOXES", raising=False)
    golden = json.loads(GOLDEN.read_text())
    definition = ExternalDefinition(**golden["external_definition"])
    plan = adapter("inspect-ai").plan(definition, grant=LaunchGrant(tools=["add"]))
    assert plan.model_dump() == golden["external_plan"]


def test_the_golden_record_is_the_contracts():
    """The file core and the services read: a field that moves fails here."""
    golden = json.loads(GOLDEN.read_text())
    assert (
        ExternalDefinition(**golden["external_definition"]).model_dump()
        == golden["external_definition"]
    )
    assert (
        AdapterPlan(**golden["external_plan"]).model_dump() == golden["external_plan"]
    )
    assert "secret" not in golden["external_plan"]["reproduction"].lower().replace(
        "secrets", ""
    )


def test_a_launch_names_its_budget_application_and_deployment(client):
    arguments = (
        "launch",
        "e1",
        "--budget",
        "5",
        "--app-uid",
        "a1",
        "--deployment-uid",
        "d1",
    )
    assert _invoke(*arguments).exit_code == 0
    config = client.calls[-1][1]["config"]
    assert config["budget"] == 5
    assert config["application"] == {"app_uid": "a1", "deployment_uid": "d1"}
