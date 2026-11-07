# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`agent-runtimes benchmarks`: import, publish, download."""

from __future__ import annotations

import base64
import hashlib
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
import requests
from typer.testing import CliRunner

from agent_runtimes.__main__ import app
from agent_runtimes.commands import evals as evals_commands
from agent_runtimes.mixins.evals import EvalsMixin

runner = CliRunner(env={"NO_COLOR": "1", "TERM": "dumb"})
ARCHIVE = b"the source"
DIGEST = hashlib.sha256(ARCHIVE).hexdigest()
HEADERS = {
    "x-content-sha256": DIGEST,
    "content-disposition": 'attachment; filename="../fixture.tar.gz"',
}


class Client:
    def __init__(self) -> None:
        self.calls: list[tuple[str, Any]] = []
        self.status = "ready"

    def evals_inspect_source(self, **kwargs):
        self.calls.append(("inspect", kwargs))
        return {
            "inspection": {
                "id": "i1",
                "status": self.status,
                "digest": "a" * 64,
                "error": "no task",
            }
        }

    def evals_import_external(self, **kwargs):
        self.calls.append(("import", kwargs))
        return {"evalset": {"id": "e1", "name": "Drill", "cases": [{}, {}]}}

    def evals_set_public(self, evalset_id, *, public):
        self.calls.append(("public", (evalset_id, public)))
        return {}

    def evals_download_source(self, evalset_id, *, version=None, public=False):
        self.calls.append(("download", (evalset_id, version, public)))
        return ARCHIVE, "../fixture.tar.gz", DIGEST


@pytest.fixture
def client(monkeypatch):
    fake = Client()
    monkeypatch.setattr(evals_commands, "_make_client", lambda **_: fake)
    return fake


def test_a_source_is_inspected_and_imported_in_one_command(client, tmp_path):
    source = tmp_path / "fixture.tar.gz"
    source.write_bytes(ARCHIVE)
    answered = runner.invoke(
        app,
        ["benchmarks", "import", "inspect-ai", str(source), "--model", "alibaba:qwen-max", "--scorer", "includes", "--limit", "1"],
    )
    assert answered.exit_code == 0, answered.output
    assert "Benchmark e1 Drill: 2 tasks" in answered.output
    (_, inspected), (_, imported) = client.calls
    assert base64.b64decode(inspected["content_base64"])
    assert imported == {
        "inspection_id": "i1",
        "selection": {
            "models": ["alibaba:qwen-max"],
            "aggregation": {"scorer": "includes"},
            "limit": 1,
        },
    }


def test_a_source_that_cannot_be_read_imports_nothing(client, tmp_path):
    client.status = "failed"
    source = tmp_path / "fixture.tar.gz"
    source.write_bytes(ARCHIVE)
    answered = runner.invoke(app, ["benchmarks", "import", "inspect-ai", str(source)])
    assert answered.exit_code == 1
    assert "no task" in answered.output
    assert [name for name, _ in client.calls] == ["inspect"]


def test_publishing_and_taking_back(client):
    assert runner.invoke(app, ["benchmarks", "publish", "e1"]).exit_code == 0
    assert runner.invoke(app, ["benchmarks", "unpublish", "e1"]).exit_code == 0
    assert client.calls == [("public", ("e1", True)), ("public", ("e1", False))]


def test_a_download_stays_in_the_folder_it_is_asked_in(client, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    answered = runner.invoke(app, ["benchmarks", "download", "e1", "--public"])
    assert answered.exit_code == 0, answered.output
    assert (tmp_path / "fixture.tar.gz").read_bytes() == ARCHIVE
    assert client.calls == [("download", ("e1", None, True))]


class Mixin(EvalsMixin):
    urls = SimpleNamespace(ai_agents_url="https://service")

    def __init__(self, answer):
        self.answer = answer
        self.fetched: list[str] = []

    def _fetch(self, url, **kwargs):
        self.fetched.append(url)
        return self.answer


def test_public_asks_with_no_credential_at_all(monkeypatch):
    asked: list[tuple[str, dict]] = []

    def get(url, **kwargs):
        asked.append((url, kwargs))
        return SimpleNamespace(content=ARCHIVE, headers=HEADERS, raise_for_status=lambda: None)

    monkeypatch.setattr(requests, "get", get)
    mixin = Mixin(None)
    assert mixin.evals_download_source("e1", public=True) == (ARCHIVE, "../fixture.tar.gz", DIGEST)
    assert asked == [("https://service/api/ai-agents/v1/evals/public/evalsets/e1/external-source", {"timeout": 120})]
    assert mixin.fetched == []


def test_bytes_that_are_not_the_digest_are_refused():
    answer = SimpleNamespace(content=b"something else", headers=HEADERS)
    with pytest.raises(ValueError, match="does not match"):
        Mixin(answer).evals_download_source("e1")


def test_a_path_is_never_taken_from_the_service(client, tmp_path, monkeypatch):
    nested = tmp_path / "here"
    nested.mkdir()
    monkeypatch.chdir(nested)
    assert runner.invoke(app, ["benchmarks", "download", "e1"]).exit_code == 0
    assert not (tmp_path / "fixture.tar.gz").exists()
    assert Path("fixture.tar.gz").exists()
