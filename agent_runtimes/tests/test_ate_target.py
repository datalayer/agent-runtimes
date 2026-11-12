# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``serve --target ate``: Agent Substrate's actor contract.

Every actor of a template starts from the template's golden snapshot, so the
actor's identity is read from its ``systemInfo`` files at each wake, never at
start. The wake is the wakeup probe: the first probe after a quiet spell.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from typer.testing import CliRunner

from agent_runtimes.ate import lifecycle
from agent_runtimes.ate.cli import app as ate_cli
from agent_runtimes.ate.contract import router
from agent_runtimes.ate.identity import (
    actor_name_of_runtime,
    read_identity,
    runtime_uid_of_actor,
)
from agent_runtimes.ate.lifecycle import WakeTracker
from agent_runtimes.ate.settings import ate_settings, is_ate_target
from agent_runtimes.ate.template import (
    EgressRule,
    TemplateRequest,
    actor_template,
    egress_policy,
)
from agent_runtimes.commands.serve import ServeError, Target, serve_server

UID_A = "01JQ7ZK3M4N5P6Q7R8S9T0V1W2"
UID_B = "01JQ7ZK3M4N5P6Q7R8S9T0V1W3"
IMAGE = "ghcr.io/example/agent-runtimes@sha256:" + "a" * 64


def actor_dir(
    path: Path, name: str, atespace: str = "agents", uid: str = "u-1"
) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    (path / "actor-name").write_text(name)
    (path / "atespace").write_text(atespace)
    (path / "actor-uid").write_text(uid)
    return path


class Clock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


# ── settings ────────────────────────────────────────────────────────────────


def test_settings_default_to_port_80_and_run_ate() -> None:
    settings = ate_settings({})
    assert (settings.host, settings.port, settings.spec_id) == ("0.0.0.0", 80, "")  # nosec B104
    assert settings.system_info_dir == "/run/ate"
    assert settings.trust_bundle == "/run/substrate/certs/ca.pem"


def test_settings_read_the_template_environment() -> None:
    settings = ate_settings(
        {"ATE_PORT": "8080", "AGENT_SPEC_ID": "crawler", "ATE_SYSTEM_INFO_DIR": "/x"}
    )
    assert (settings.port, settings.spec_id, settings.system_info_dir) == (
        8080,
        "crawler",
        "/x",
    )


@pytest.mark.parametrize("port", ["0", "65536", "eighty"])
def test_a_bad_port_is_refused(port: str) -> None:
    with pytest.raises(ValueError, match="ATE_PORT"):
        ate_settings({"ATE_PORT": port})


def test_is_ate_target() -> None:
    assert is_ate_target({"AGENT_RUNTIMES_TARGET": "ate"})
    assert not is_ate_target({"AGENT_RUNTIMES_TARGET": "agentcore"})
    assert not is_ate_target({})


# ── identity ────────────────────────────────────────────────────────────────


def test_runtime_actor_names_round_trip() -> None:
    name = actor_name_of_runtime(UID_A)
    assert name == "rt-" + UID_A.lower()
    assert runtime_uid_of_actor(name) == UID_A


@pytest.mark.parametrize(
    "name", ["", "golden-crawler", "rt-", "rt-not-a-ulid", "rt-" + "u" * 26]
)
def test_names_that_are_no_runtime_s(name: str) -> None:
    assert runtime_uid_of_actor(name) is None


def test_a_runtime_uid_is_a_ulid() -> None:
    with pytest.raises(ValueError, match="ULID"):
        actor_name_of_runtime("runtime-abc")


def test_identity_is_read_from_the_system_info_files(tmp_path: Path) -> None:
    identity = read_identity(
        str(actor_dir(tmp_path, "rt-" + UID_A.lower(), uid="incarnation-7"))
    )
    assert identity is not None
    assert identity.as_dict() == {
        "atespace": "agents",
        "actor": "rt-" + UID_A.lower(),
        "actor_uid": "incarnation-7",
        "runtime_uid": UID_A,
    }


def test_no_files_no_actor(tmp_path: Path) -> None:
    assert read_identity(str(tmp_path / "missing")) is None


# ── wakes ───────────────────────────────────────────────────────────────────


def test_a_probe_burst_is_one_wake(tmp_path: Path) -> None:
    clock = Clock()
    tracker = WakeTracker(
        str(tmp_path), str(tmp_path / "ca.pem"), environ={}, clock=clock
    )
    assert tracker.probe() is True
    clock.now += 0.001
    assert tracker.probe() is False
    clock.now += 0.5
    assert tracker.probe() is False
    assert tracker.wakes == 1
    clock.now += 60
    assert tracker.probe() is True
    assert tracker.wakes == 2


def test_each_clone_of_the_golden_snapshot_learns_its_own_runtime(
    tmp_path: Path,
) -> None:
    """One process, two identities: what a clone restored from a shared
    snapshot sees. The runtime id follows the files at each wake."""
    info = tmp_path / "run-ate"
    environ: dict[str, str] = {}
    clock = Clock()
    tracker = WakeTracker(
        str(info), str(tmp_path / "ca.pem"), environ=environ, clock=clock
    )

    actor_dir(info, "golden-crawler")
    tracker.probe()
    assert "DATALAYER_RUNTIME_ID" not in environ  # the golden actor serves no runtime

    actor_dir(info, actor_name_of_runtime(UID_A))
    clock.now += 60
    tracker.probe()
    assert environ["DATALAYER_RUNTIME_ID"] == UID_A

    actor_dir(info, actor_name_of_runtime(UID_B))
    clock.now += 60
    tracker.probe()
    assert environ["DATALAYER_RUNTIME_ID"] == UID_B


def test_the_trust_bundle_is_bound_at_wake_without_overriding_another_ca(
    tmp_path: Path,
) -> None:
    bundle = tmp_path / "ca.pem"
    environ = {"REQUESTS_CA_BUNDLE": "/etc/custom.pem"}
    clock = Clock()
    tracker = WakeTracker(str(tmp_path), str(bundle), environ=environ, clock=clock)
    tracker.probe()
    assert "SSL_CERT_FILE" not in environ  # no bundle projected yet
    bundle.write_text("-----BEGIN CERTIFICATE-----\n")
    clock.now += 60
    tracker.probe()
    assert environ["SSL_CERT_FILE"] == str(bundle)
    assert environ["REQUESTS_CA_BUNDLE"] == "/etc/custom.pem"


def test_a_failing_hook_does_not_fail_the_wake(tmp_path: Path) -> None:
    tracker = WakeTracker(str(tmp_path), str(tmp_path / "ca.pem"), environ={})
    seen: list[int] = []

    def broken(wake: lifecycle.Wake) -> None:
        raise RuntimeError("boom")

    tracker.add_hook(broken)
    tracker.add_hook(lambda wake: seen.append(wake.count))
    assert tracker.probe() is True
    assert seen == [1]


# ── routes ──────────────────────────────────────────────────────────────────


@pytest.fixture
def client(tmp_path: Path) -> Any:
    info = actor_dir(tmp_path / "run-ate", actor_name_of_runtime(UID_A))
    lifecycle.reset_wake_tracker(
        WakeTracker(str(info), str(tmp_path / "ca.pem"), environ={}, clock=Clock())
    )
    app = FastAPI()
    app.include_router(router)
    yield TestClient(app)
    lifecycle.reset_wake_tracker(None)


def test_the_wakeup_probe_answers_200_and_counts_the_wake(client: TestClient) -> None:
    first = client.get("/ate/wakeup")
    assert first.status_code == 200
    assert first.json() == {"status": "ready", "woke": True, "wakes": 1}
    assert client.get("/ate/wakeup").json()["woke"] is False


def test_the_identity_names_the_runtime_uid_never_a_worker(client: TestClient) -> None:
    client.get("/ate/wakeup")
    body = client.get("/ate/identity").json()
    assert body["runtime_uid"] == UID_A
    assert body["atespace"] == "agents"
    assert body["wakes"] == 1
    assert not any("worker" in key or "pod" in key for key in body)


# ── serve --target ate ──────────────────────────────────────────────────────


@pytest.fixture
def no_server(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    import uvicorn

    runs: list[dict[str, Any]] = []
    monkeypatch.setattr(uvicorn, "run", lambda *a, **k: runs.append(k))
    for name in (
        "AGENT_SPEC_ID",
        "ATE_PORT",
        "AGENT_RUNTIMES_TARGET",
        "AGENT_RUNTIMES_DEFAULT_AGENT",
        "AGENT_RUNTIMES_PROTOCOL",
        "AGENT_RUNTIMES_PORT",
        "AGENT_RUNTIMES_AGENT_NAME",
        "AGENT_RUNTIMES_NODE",
        "AGENT_RUNTIMES_DISABLE_TOOL_APPROVALS",
    ):
        monkeypatch.delenv(name, raising=False)
    return runs


def test_serve_target_ate_listens_on_80_without_an_agent(
    no_server: list[dict[str, Any]],
) -> None:
    serve_server(host="127.0.0.1", port=9999, target=Target.ate)
    assert no_server[0]["host"] == "0.0.0.0" and no_server[0]["port"] == 80  # nosec B104
    assert os.environ["AGENT_RUNTIMES_TARGET"] == "ate"


def test_serve_target_ate_serves_the_agentspec_of_the_template(
    monkeypatch: pytest.MonkeyPatch, no_server: list[dict[str, Any]]
) -> None:
    monkeypatch.setenv("AGENT_SPEC_ID", "example-blank")
    monkeypatch.setenv("ATE_PORT", "8081")
    serve_server(target=Target.ate)
    assert no_server[0]["port"] == 8081
    assert os.environ["AGENT_RUNTIMES_DEFAULT_AGENT"] == "example-blank"


def test_serve_target_ate_refuses_another_agent_id(
    monkeypatch: pytest.MonkeyPatch, no_server: list[dict[str, Any]]
) -> None:
    monkeypatch.setenv("AGENT_SPEC_ID", "example-blank")
    with pytest.raises(ServeError, match="not --agent-id"):
        serve_server(agent_id="crawler", target=Target.ate)
    assert not no_server


def test_serve_target_ate_refuses_an_unknown_agentspec(
    monkeypatch: pytest.MonkeyPatch, no_server: list[dict[str, Any]]
) -> None:
    monkeypatch.setenv("AGENT_SPEC_ID", "no-such-agentspec")
    with pytest.raises(ServeError, match="no-such-agentspec"):
        serve_server(target=Target.ate)
    assert not no_server


# ── the template and the egress policy ──────────────────────────────────────


def test_the_template_is_an_agent_runtimes_actor() -> None:
    body = actor_template(
        TemplateRequest(
            atespace="agents",
            name="crawler",
            image=IMAGE,
            agent_spec_id="crawler",
            worker_labels={"workload": "agent-runtimes"},
            env={"AGENT_RUNTIMES_MODEL": "openai:gpt-5-mini"},
        )
    )
    assert body["metadata"] == {"atespace": "agents", "name": "crawler"}
    (container,) = body["containers"]
    assert container["image"] == IMAGE
    assert container["command"] == ["agent-runtimes", "serve", "--target", "ate"]
    assert container["wakeupProbe"] == {"httpGet": {"path": "/ate/wakeup", "port": 80}}
    env = {item["name"]: item["value"] for item in container["env"]}
    assert env["AGENT_SPEC_ID"] == "crawler"
    assert env["AGENT_RUNTIMES_TARGET"] == "ate"
    assert env["ATE_TRUST_BUNDLE"] == "/run/substrate/certs/ca.pem"
    mounts = {m["name"]: m["mountPath"] for m in container["volumeMounts"]}
    assert mounts == {
        "system-info": "/run/ate",
        "trust": "/run/substrate/certs",
        "data": "/data",
    }
    volumes = {v["name"]: v for v in body["volumes"]}
    fields = [
        item["field"]
        for item in volumes["system-info"]["systemInfo"]["dataSources"][0][
            "actorMetadata"
        ]["items"]
    ]
    assert fields == [
        "ACTOR_METADATA_FIELD_NAME",
        "ACTOR_METADATA_FIELD_ATESPACE",
        "ACTOR_METADATA_FIELD_UID",
    ]
    assert volumes["data"] == {"name": "data", "durableDir": {}}
    assert body["resources"]["limits"] == {
        "cpuMillicores": "1000",
        "memoryBytes": str(2 * 1024**3),
    }
    assert body["workerSelector"] == {"matchLabels": {"workload": "agent-runtimes"}}
    # Every volume is mounted (Agent Substrate refuses one that is not).
    assert set(volumes) == set(mounts)


def test_a_tag_is_refused() -> None:
    with pytest.raises(ValueError, match="digest"):
        actor_template(
            TemplateRequest(
                atespace="agents", name="crawler", image="agent-runtimes:1.6.34"
            )
        )


@pytest.mark.parametrize(
    "name",
    [
        "OPENAI_API_KEY",
        "DATALAYER_TOKEN",
        "CLIENT_SECRET",
        "DB_PASSWORD",
        "AWS_CREDENTIALS",
    ],
)
def test_a_credential_in_the_environment_is_refused(name: str) -> None:
    with pytest.raises(ValueError, match="EgressPolicy"):
        actor_template(
            TemplateRequest(
                atespace="agents", name="crawler", image=IMAGE, env={name: "x"}
            )
        )


def test_names_are_dns_labels() -> None:
    with pytest.raises(ValueError, match="DNS-1123"):
        actor_template(TemplateRequest(atespace="Agents", name="crawler", image=IMAGE))


def test_the_egress_policy_injects_the_credential() -> None:
    body = egress_policy(
        [
            EgressRule(
                hostnames=["ai.example.com"],
                credential_uri="ate-secret://k8s.io/default/agents/inference/key",
            )
        ]
    )
    assert body == {
        "rules": [
            {
                "https": {
                    "hostnames": ["ai.example.com"],
                    "effects": {
                        "replaceHeaders": [
                            {
                                "header": "Authorization",
                                "prefix": "Bearer ",
                                "credentialUri": "ate-secret://k8s.io/default/agents/inference/key",
                            }
                        ]
                    },
                }
            }
        ]
    }


@pytest.mark.parametrize(
    "uri", ["k8s.io/a/b", "ate-secret://k8s.io/one", "ate-secret://k8s.io/a/b?x"]
)
def test_a_bad_credential_uri_is_refused(uri: str) -> None:
    with pytest.raises(ValueError, match="ate-secret://"):
        egress_policy([EgressRule(hostnames=["ai.example.com"], credential_uri=uri)])


def test_the_command_prints_the_template() -> None:
    result = CliRunner().invoke(
        ate_cli,
        ["template", "--atespace", "agents", "--name", "crawler", "--image", IMAGE],
    )
    assert result.exit_code == 0, result.output
    assert json.loads(result.output)["containers"][0]["image"] == IMAGE


def test_the_command_refuses_a_tag_in_a_sentence() -> None:
    result = CliRunner().invoke(
        ate_cli,
        [
            "template",
            "--atespace",
            "agents",
            "--name",
            "crawler",
            "--image",
            "x:latest",
        ],
    )
    assert result.exit_code != 0
