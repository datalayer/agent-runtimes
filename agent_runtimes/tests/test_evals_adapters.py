# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An adapter's boundaries, through the fake adapter and the real sandbox."""

from __future__ import annotations

import base64
import io
import json
import tarfile
import threading
import time
import zipfile
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.evals.adapters import routes
from agent_runtimes.evals.adapters.base import (
    LaunchGrant,
    Selection,
    SourceRef,
    Trial,
    blocking,
    policy_from,
    policy_to,
    stable_case_id,
)
from agent_runtimes.evals.adapters.host import AdapterHost, SourceMissing, redact
from agent_runtimes.evals.adapters.registry import UnknownAdapter, adapter, offered_adapters
from agent_runtimes.evals.adapters.sandbox import SandboxPolicy, isolation_available
from agent_runtimes.evals.adapters.source import (
    SourceRefused,
    archive_digest,
    content_digest,
    unpack_archive,
)

needs_isolation = pytest.mark.skipif(not isolation_available(), reason="no unprivileged namespaces here")

DEFINITION = {
    "name": "Two tasks",
    "description": "A fake definition",
    "cases": [
        {"id": "alpha", "input": "2+2", "target": "4", "answer": "4"},
        {"id": "beta", "input": "3+3", "target": "6", "answer": "7"},
    ],
    "components": [{"kind": "solver", "name": "chain", "support": "framework-run"}],
}


def archive_of(definition: dict) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        data = json.dumps(definition).encode()
        info = tarfile.TarInfo("fake-eval.json")
        info.size = len(data)
        tar.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


@pytest.fixture
def host(tmp_path):
    return AdapterHost(tmp_path / "host")


@pytest.fixture
def ready(host):
    data = archive_of(DEFINITION)
    digest = archive_digest(data)
    host.put_source(digest, data)
    return host, digest


class TestTheRegistry:
    def test_an_unknown_framework_is_refused(self):
        with pytest.raises(UnknownAdapter):
            adapter("nobody")

    def test_nothing_is_offered_unless_a_deployment_names_it(self, monkeypatch):
        monkeypatch.delenv("DATALAYER_EVALS_ADAPTERS", raising=False)
        assert offered_adapters() == []

    def test_an_offered_name_this_package_lacks_refuses_to_be_read(self, monkeypatch):
        monkeypatch.setenv("DATALAYER_EVALS_ADAPTERS", "fake,nobody")
        with pytest.raises(UnknownAdapter):
            offered_adapters()

    def test_each_adapter_says_its_own_versions(self, monkeypatch):
        monkeypatch.setenv("DATALAYER_EVALS_ADAPTERS", "fake")
        [fake] = offered_adapters()
        assert fake.describe() == {"framework": "fake", "adapter_version": "1", "framework_version": "0", "environment": "ai-agents-env"}


class TestTheSource:
    def test_the_digest_is_of_the_bytes_and_the_content_digest_of_the_files(self, tmp_path):
        data = archive_of(DEFINITION)
        unpack_archive(data, tmp_path / "one")
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("fake-eval.json", json.dumps(DEFINITION))
        unpack_archive(buffer.getvalue(), tmp_path / "two")
        assert archive_digest(data) != archive_digest(buffer.getvalue())
        assert content_digest(tmp_path / "one") == content_digest(tmp_path / "two")

    def test_it_is_left_read_only(self, tmp_path):
        unpack_archive(archive_of(DEFINITION), tmp_path / "tree")
        with pytest.raises(PermissionError):
            (tmp_path / "tree" / "fake-eval.json").write_text("changed")
        (tmp_path / "tree").chmod(0o755)

    @pytest.mark.parametrize("name", ["../outside", "/etc/passwd", "a/../../outside"])
    def test_a_path_outside_itself_is_refused(self, tmp_path, name):
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w") as tar:
            info = tarfile.TarInfo(name)
            info.size = 1
            tar.addfile(info, io.BytesIO(b"x"))
        with pytest.raises(SourceRefused):
            unpack_archive(buffer.getvalue(), tmp_path / "tree")

    def test_a_link_is_refused(self, tmp_path):
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w") as tar:
            info = tarfile.TarInfo("link")
            info.type = tarfile.SYMTYPE
            info.linkname = "/etc/passwd"
            tar.addfile(info)
        with pytest.raises(SourceRefused):
            unpack_archive(buffer.getvalue(), tmp_path / "tree")

    def test_bytes_that_are_not_their_digest_are_refused(self, host):
        with pytest.raises(ValueError):
            host.put_source("0" * 64, archive_of(DEFINITION))

    def test_a_source_nobody_handed_in_is_missing(self, host):
        with pytest.raises(SourceMissing):
            host.source("0" * 64)


def test_a_case_id_is_stable_and_belongs_to_its_source():
    one = stable_case_id(framework="fake", native_id="alpha", content_digest="d1")
    assert one == stable_case_id(framework="fake", native_id="alpha", content_digest="d1")
    assert one != stable_case_id(framework="fake", native_id="alpha", content_digest="d2")


def test_a_policy_survives_a_plan_and_refuses_what_it_does_not_know():
    policy = SandboxPolicy(network="boundary", secrets=("TOKEN",))
    assert policy_from(policy_to(policy)).secrets == ("TOKEN",)
    with pytest.raises(ValueError):
        policy_from({**policy_to(policy), "privileged": True})


def test_redaction_takes_a_value_out_wherever_it_is():
    assert redact("key=abc and abc", {"TOKEN": "abc"}) == "key=[secret:TOKEN] and [secret:TOKEN]"


@needs_isolation
class TestTheFakeAdapter:
    def test_inspection_finds_two_cases_and_runs_neither(self, ready):
        host, digest = ready
        inspection = host.inspect("fake", digest)
        assert [case.native_id for case in inspection.cases] == ["alpha", "beta"]
        assert inspection.archive_digest == digest
        assert [item.status for item in inspection.capabilities] == ["framework-run"]

    def test_import_keeps_the_source_reference_and_the_capabilities(self, ready):
        host, digest = ready
        fake = adapter("fake")
        imported = fake.import_definition(
            host.inspect("fake", digest), selection=Selection(), source=SourceRef(kind="archive", reference=digest, filename="x.tar.gz")
        )
        assert len(imported.cases) == 2
        assert imported.external_definition.source.reference == digest
        assert imported.external_definition.framework == "fake"
        assert imported.cases[0]["id"] == stable_case_id(
            framework="fake", native_id="alpha", content_digest=imported.external_definition.content_digest
        )

    def _plan(self, host, digest, *, grant=None):
        fake = adapter("fake")
        imported = fake.import_definition(host.inspect("fake", digest), selection=Selection(), source=SourceRef(kind="archive", reference=digest))
        return fake.plan(imported.external_definition, grant=grant or LaunchGrant())

    def test_an_execution_normalizes_to_a_task_result(self, ready):
        host, digest = ready
        plan = self._plan(host, digest)
        passed = host.execute("fake", digest, plan=plan, trial=Trial(case_id="c1", native_id="alpha"), secrets={})
        failed = host.execute("fake", digest, plan=plan, trial=Trial(case_id="c2", native_id="beta"), secrets={})
        assert (passed.status, passed.score, passed.output) == ("passed", 1.0, "4")
        assert (failed.status, failed.failure_stage, failed.failure_mode) == ("failed", "scorer", "wrong_answer")
        assert [score.name for score in passed.scores] == ["exact"]

    def test_a_definition_needing_more_than_the_launch_grants_is_unsupported(self, host):
        data = archive_of({**DEFINITION, "network": "boundary", "secrets": ["FAKE_TOKEN"]})
        digest = archive_digest(data)
        host.put_source(digest, data)
        refused = blocking(self._plan(host, digest).capabilities)
        assert {item.code for item in refused} == {"network_not_granted", "secret_not_granted"}
        assert blocking(self._plan(host, digest, grant=LaunchGrant(network="boundary", secrets=["FAKE_TOKEN"])).capabilities) == []

    def test_a_secret_is_handed_in_and_comes_out_of_nothing(self, host):
        data = archive_of({**DEFINITION, "secrets": ["FAKE_TOKEN"]})
        digest = archive_digest(data)
        host.put_source(digest, data)
        plan = self._plan(host, digest, grant=LaunchGrant(secrets=["FAKE_TOKEN"]))
        result = host.execute("fake", digest, plan=plan, trial=Trial(case_id="c1", native_id="alpha"), secrets={"FAKE_TOKEN": "s3cr3t-value"})
        log = result.artifacts[0].content.decode()
        assert "s3cr3t-value" not in result.model_dump_json()
        assert "s3cr3t-value" not in log
        assert "[secret:FAKE_TOKEN]" in log

    def test_a_secret_the_plan_does_not_name_is_refused(self, ready):
        host, digest = ready
        with pytest.raises(ValueError):
            host.execute("fake", digest, plan=self._plan(host, digest), trial=Trial(case_id="c", native_id="alpha"), secrets={"OTHER": "x"})

    def test_a_framework_that_crashes_is_a_failed_task(self, host):
        definition = {**DEFINITION, "cases": [{"id": "alpha", "input": "x", "target": "y", "crash": True}]}
        data = archive_of(definition)
        digest = archive_digest(data)
        host.put_source(digest, data)
        result = host.execute("fake", digest, plan=self._plan(host, digest), trial=Trial(case_id="c", native_id="alpha"), secrets={})
        assert (result.status, result.failure_mode) == ("failed", "framework_failed")
        assert "crashed" in result.explanation

    def test_a_bound_overrun_is_the_trials_failure(self, host):
        definition = {**DEFINITION, "cases": [{"id": "alpha", "input": "x", "target": "y", "sleep_seconds": 30}]}
        data = archive_of(definition)
        digest = archive_digest(data)
        host.put_source(digest, data)
        plan = self._plan(host, digest)
        plan = plan.model_copy(update={"policy": {**plan.policy, "wall_seconds": 1}})
        result = host.execute("fake", digest, plan=plan, trial=Trial(case_id="c", native_id="alpha"), secrets={})
        assert (result.status, result.failure_stage, result.failure_mode) == ("failed", "infrastructure", "sandbox_time_exceeded")

    def test_a_definition_the_adapter_chokes_on_is_refused_not_a_crash(self, host):
        data = archive_of({"cases": "nonsense"})
        digest = archive_digest(data)
        host.put_source(digest, data)
        with pytest.raises(ValueError):
            host.inspect("fake", digest)

    def test_a_cancel_reaches_a_running_trial(self, host):
        from agent_runtimes.evals.adapters.sandbox import SandboxCancelled

        definition = {**DEFINITION, "cases": [{"id": "alpha", "input": "x", "target": "y", "sleep_seconds": 30}]}
        data = archive_of(definition)
        digest = archive_digest(data)
        host.put_source(digest, data)
        plan = self._plan(host, digest)
        threading.Timer(0.5, lambda: host.cancel("k1")).start()
        started = time.monotonic()
        with pytest.raises(SandboxCancelled):
            host.execute("fake", digest, plan=plan, trial=Trial(case_id="c", native_id="alpha"), secrets={}, key="k1")
        assert time.monotonic() - started < 5
        assert host.cancel("k1") is False


@needs_isolation
class TestTheRoutes:
    @pytest.fixture
    def client(self, host):
        app = FastAPI()
        app.include_router(routes.router)
        routes.use_host(host)
        yield TestClient(app)
        routes.use_host(None)

    def test_the_whole_way_through_http(self, client):
        data = archive_of(DEFINITION)
        digest = archive_digest(data)
        assert client.put(f"/evals/adapters/sources/{digest}", content=data).status_code == 200
        inspection = client.post("/evals/adapters/fake/inspect", json={"digest": digest}).json()
        assert len(inspection["cases"]) == 2
        fake = adapter("fake")
        from agent_runtimes.evals.adapters.base import Inspection

        imported = fake.import_definition(Inspection(**inspection), selection=Selection(), source=SourceRef(kind="archive", reference=digest))
        plan = fake.plan(imported.external_definition, grant=LaunchGrant())
        answered = client.post(
            "/evals/adapters/fake/execute",
            json={"digest": digest, "plan": plan.model_dump(), "trial": {"case_id": "c", "native_id": "alpha"}, "key": "k"},
        )
        assert answered.status_code == 200, answered.text
        assert answered.json()["status"] == "passed"

    def test_refusals_are_status_codes(self, client):
        assert client.post("/evals/adapters/nobody/inspect", json={"digest": "0" * 64}).status_code == 404
        assert client.post("/evals/adapters/fake/inspect", json={"digest": "0" * 64}).status_code == 409
        assert client.put("/evals/adapters/sources/" + "0" * 64, content=b"x").status_code == 422

    def test_a_kernel_that_will_not_isolate_answers_503(self, client, monkeypatch):
        from agent_runtimes.evals.adapters import sandbox

        data = archive_of(DEFINITION)
        digest = archive_digest(data)
        client.put(f"/evals/adapters/sources/{digest}", content=data)
        monkeypatch.setattr(sandbox, "_BOOTSTRAP_FLAGS_FOR_TEST", "refuse", raising=False)
        answered = client.post("/evals/adapters/fake/inspect", json={"digest": digest})
        assert answered.status_code == 503
        assert answered.json()["detail"]["code"] == "sandbox_unavailable"
