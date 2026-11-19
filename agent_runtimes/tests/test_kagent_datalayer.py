# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The kagent bridge's Datalayer mode.

The bridge obtains a Datalayer runtime for its Agent through ``agent-runtimes
kagent launch-runtime`` (the real ``AgentClient``, here against a fake
transport answering what the Runtimes service answers), forwards each task to
it, keeps it across the session's tasks, launches another once it expired,
and ends it when the actor stops. Whatever the mode needs and lacks stops it
at start.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import stat
import sys
from pathlib import Path
from typing import Any

import httpx
import pytest
import yaml
from typer.testing import CliRunner

from agent_runtimes.client.agent_client import AgentClient
from agent_runtimes.commands.kagent import app as kagent_app
from agent_runtimes.kagent import bridge, datalayer
from agent_runtimes.subagents.a2a import A2ARemoteAgent

RUN_URL = "https://datalayer.example.com"
UID = "01kagentruntime0000000000a"
KEY = "dl-test-key-not-a-real-one"

#: What kagent materializes for an Agent ``team-a/reviewer`` (config.json).
CONFIG = {
    "runtime": {"name": "reviewer", "namespace": "team-a", "port": 80},
    "agent": {},
}

#: The Runtimes service's answer to ``POST /runtimes``: the operator's
#: RuntimeModel (``runtime_name`` is the uid), under ``runtime``.
CREATED = {
    "success": True,
    "message": "The Runtime is available.",
    "runtime": {
        "uid": UID,
        "runtime_name": UID,
        "given_name": "runtime-ai-agents-env-x",
        "burning_rate": 0.01,
        "environment": {"name": "ai-agents-env", "title": "AI Agents"},
        "ingress": f"{RUN_URL}/jupyter/server/team-a/{UID}",
        "token": "a-jupyter-token",
        "type": "notebook",
        "reservation_id": "01reservation",
        "started_at": "1791481000.000",
        "expired_at": "1791482800.000",
        "unmetered": False,
        "agent_spec_id": "example-blank",
    },
}

#: The Runtimes service's environments listing.
ENVIRONMENTS = {
    "success": True,
    "environments": [
        {
            "name": "ai-agents-env",
            "title": "AI Agents",
            "burning_rate": 0.01,
            "language": "python",
            "owner": "datalayer",
            "visibility": "public",
        }
    ],
}


def datalayer_env(tmp_path: Path, **extra: str) -> dict[str, str]:
    key = tmp_path / "api-key"
    key.write_text(KEY + "\n")
    return {
        "DATALAYER_RUNTIME_ENVIRONMENT": "ai-agents-env",
        "DATALAYER_RUN_URL": RUN_URL + "/",
        "AGENT_SPEC_ID": "example-blank",
        "DATALAYER_API_KEY_FILE": str(key),
        "DATALAYER_RUNTIME_STATE_DIR": str(tmp_path / "data"),
        **extra,
    }


# ── the mode, read at start ─────────────────────────────────────────────────


def test_no_environment_is_no_datalayer_mode(tmp_path: Path) -> None:
    assert bridge.datalayer_mode({}, CONFIG) is None


def test_the_mode_reads_the_agent_and_the_mounted_key(tmp_path: Path) -> None:
    mode = bridge.datalayer_mode(datalayer_env(tmp_path), CONFIG)
    assert mode is not None
    assert mode.agent_uid == "team-a/reviewer"
    assert mode.run_url == RUN_URL and mode.environment == "ai-agents-env"
    assert mode.headers == {"Authorization": f"Bearer {KEY}"}
    assert KEY not in repr(mode)


def test_the_gateway_injected_key_is_kagents_placeholder(tmp_path: Path) -> None:
    env = datalayer_env(tmp_path, DATALAYER_API_KEY_INJECTED="true")
    del env["DATALAYER_API_KEY_FILE"]
    mode = bridge.datalayer_mode(env, CONFIG)
    assert mode is not None and mode.injected
    assert mode.headers == {"Authorization": "Bearer kagent-credential-injected"}


@pytest.mark.parametrize(
    "change, sentence",
    [
        ({"DATALAYER_RUN_URL": ""}, "DATALAYER_RUN_URL is not set"),
        ({"AGENT_SPEC_ID": ""}, "AGENT_SPEC_ID is not set"),
        ({"DATALAYER_API_KEY_FILE": ""}, "no key"),
        ({"DATALAYER_API_KEY_FILE": "/nonexistent/key"}, "cannot be read"),
        ({"DATALAYER_API_KEY_INJECTED": "true"}, "both"),
        ({"DATALAYER_API_KEY": KEY}, "never from a manifest"),
    ],
)
def test_what_the_mode_lacks_stops_it_at_start(
    tmp_path: Path, change: dict[str, str], sentence: str
) -> None:
    env = {**datalayer_env(tmp_path), **change}
    with pytest.raises(bridge.DatalayerModeError, match=sentence) as raised:
        bridge.datalayer_mode(env, CONFIG)
    assert KEY not in str(raised.value)


def test_an_empty_key_file_or_no_agent_stops_it(tmp_path: Path) -> None:
    env = datalayer_env(tmp_path)
    Path(env["DATALAYER_API_KEY_FILE"]).write_text("\n")
    with pytest.raises(bridge.DatalayerModeError, match="is empty"):
        bridge.datalayer_mode(env, CONFIG)
    with pytest.raises(bridge.DatalayerModeError, match="names no Agent"):
        bridge.datalayer_mode(datalayer_env(tmp_path), {"runtime": {"port": 80}})


def test_the_bridge_exits_at_start_without_falling_back(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    (config_dir / "config.json").write_text(json.dumps(CONFIG))
    for name, value in {
        **datalayer_env(tmp_path),
        "DATALAYER_RUN_URL": "",
        "KAGENT_CONFIG_DIR": str(config_dir),
        "AGENT_RUNTIMES_COMMAND": "/nonexistent/agent-runtimes",
    }.items():
        monkeypatch.setenv(name, value)
    with pytest.raises(SystemExit) as exited:
        bridge.main()
    assert exited.value.code == 2


# ── the runtime: launched, kept, relaunched, ended ──────────────────────────


class Runner:
    """Answers ``agent-runtimes kagent`` as the command does."""

    def __init__(self, expired_at: float = 2_000.0) -> None:
        self.calls: list[list[str]] = []
        self.expired_at = expired_at
        self.launches = 0

    async def __call__(self, mode: Any, args: list[str]) -> dict[str, Any]:
        self.calls.append(args)
        if args[0] == "launch-runtime":
            self.launches += 1
            uid = f"{UID[:-1]}{self.launches}"
            return {
                "uid": uid,
                "url": f"{RUN_URL}/agent-runtimes/team-a/{uid}/api/v1/a2a/agents/reviewer/",
                "expired_at": self.expired_at,
            }
        return {"uid": args[1], "ended": True}


def runtime_for(
    tmp_path: Path, runner: Runner, now: list[float]
) -> bridge.DatalayerRuntime:
    mode = bridge.datalayer_mode(datalayer_env(tmp_path), CONFIG)
    assert mode is not None
    return bridge.DatalayerRuntime(mode, runner=runner, clock=lambda: now[0])


def test_the_runtime_is_launched_once_and_kept_across_tasks(tmp_path: Path) -> None:
    runner, now = Runner(), [1_000.0]
    runtime = runtime_for(tmp_path, runner, now)

    async def two_tasks() -> list[tuple[str, dict[str, str]]]:
        return [await runtime.target(), await runtime.target()]

    first, second = asyncio.run(two_tasks())
    assert first == second
    assert runner.calls == [["launch-runtime", "--agent", "team-a/reviewer"]]
    assert first[1] == {"Authorization": f"Bearer {KEY}"}
    state_file = tmp_path / "data" / "kagent-runtime.json"
    state = json.loads(state_file.read_text())
    assert state["uid"].startswith(UID[:-1]) and KEY not in state_file.read_text()
    assert stat.S_IMODE(os.stat(state_file).st_mode) == 0o600


def test_a_restarted_bridge_reuses_the_kept_runtime(tmp_path: Path) -> None:
    runner, now = Runner(), [1_000.0]
    url = asyncio.run(runtime_for(tmp_path, runner, now).target())[0]
    again = Runner()
    assert asyncio.run(runtime_for(tmp_path, again, now).target())[0] == url
    assert again.calls == []


def test_an_expired_runtime_is_replaced(tmp_path: Path) -> None:
    runner, now = Runner(expired_at=2_000.0), [1_000.0]
    runtime = runtime_for(tmp_path, runner, now)
    first = asyncio.run(runtime.target())[0]
    now[0] = 2_000.0 - bridge.EXPIRY_MARGIN
    second = asyncio.run(runtime.target())[0]
    assert first != second and runner.launches == 2


def test_an_unmetered_runtime_never_expires(tmp_path: Path) -> None:
    runner, now = Runner(expired_at=0.0), [1_000.0]
    runtime = runtime_for(tmp_path, runner, now)
    asyncio.run(runtime.target())
    now[0] = 10**10
    asyncio.run(runtime.target())
    assert runner.launches == 1


def test_stopping_ends_the_runtime_by_its_uid(tmp_path: Path) -> None:
    runner, now = Runner(), [1_000.0]
    runtime = runtime_for(tmp_path, runner, now)
    asyncio.run(runtime.target())
    uid = runtime.state["uid"]  # type: ignore[index]
    asyncio.run(runtime.end())
    assert runner.calls[-1] == ["end-runtime", uid]
    assert not (tmp_path / "data" / "kagent-runtime.json").exists()
    asyncio.run(runtime.end())  # nothing left: nothing asked
    assert len(runner.calls) == 2


def test_nothing_is_ended_when_nothing_was_launched(tmp_path: Path) -> None:
    runner = Runner()
    asyncio.run(runtime_for(tmp_path, runner, [0.0]).end())
    assert runner.calls == []


def test_a_failed_launch_keeps_nothing(tmp_path: Path) -> None:
    async def refusing(mode: Any, args: list[str]) -> dict[str, Any]:
        raise RuntimeError("agent-runtimes kagent launch-runtime failed: 402")

    mode = bridge.datalayer_mode(datalayer_env(tmp_path), CONFIG)
    assert mode is not None
    runtime = bridge.DatalayerRuntime(mode, runner=refusing)
    with pytest.raises(RuntimeError, match="402"):
        asyncio.run(runtime.target())
    assert runtime.state is None
    assert not (tmp_path / "data" / "kagent-runtime.json").exists()


def fake_command(tmp_path: Path, body: str) -> str:
    script = tmp_path / "agent-runtimes"
    script.write_text(f"#!{sys.executable}\nimport json, os, sys\n{body}\n")
    script.chmod(0o755)
    return str(script)


def test_the_command_gets_the_key_in_its_environment_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    command = fake_command(
        tmp_path,
        "print('a banner first')\n"
        "print(json.dumps({'argv': sys.argv[1:], 'key': os.environ['DATALAYER_API_KEY'],"
        " 'url': os.environ['DATALAYER_RUN_URL'], 'file': os.environ.get('DATALAYER_API_KEY_FILE')}))",
    )
    monkeypatch.setenv("AGENT_RUNTIMES_COMMAND", command)
    mode = bridge.datalayer_mode(datalayer_env(tmp_path), CONFIG)
    assert mode is not None
    answer = asyncio.run(
        bridge.run_agent_runtimes(mode, ["launch-runtime", "--agent", mode.agent_uid])
    )
    assert answer == {
        "argv": ["kagent", "launch-runtime", "--agent", "team-a/reviewer"],
        "key": KEY,
        "url": RUN_URL,
        "file": None,
    }


def test_a_failing_command_raises_its_sentence(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    command = fake_command(
        tmp_path,
        "sys.stderr.write('RuntimeError: Runtime creation failed: HTTP 402\\n'); sys.exit(1)",
    )
    monkeypatch.setenv("AGENT_RUNTIMES_COMMAND", command)
    mode = bridge.datalayer_mode(datalayer_env(tmp_path), CONFIG)
    assert mode is not None
    with pytest.raises(RuntimeError, match="launch-runtime failed: .*HTTP 402"):
        asyncio.run(bridge.run_agent_runtimes(mode, ["launch-runtime"]))


# ── forwarding to the runtime ───────────────────────────────────────────────


def test_tasks_are_forwarded_to_the_runtime_with_the_key(tmp_path: Path) -> None:
    runner, now = Runner(), [1_000.0]
    runtime = runtime_for(tmp_path, runner, now)
    seen: list[httpx.Request] = []

    def answer(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        task = {"id": "up", "status": {"state": "TASK_STATE_COMPLETED"}}
        return httpx.Response(200, json={"jsonrpc": "2.0", "result": {"task": task}})

    async def forward_two() -> None:
        forward = bridge.ForwardingExecutor(target=runtime.target)
        forward.client = httpx.AsyncClient(transport=httpx.MockTransport(answer))
        for _ in range(2):
            target = await forward._target()
            await forward._call(
                bridge.send_request({"parts": [{"text": "hi"}]}, "session-1"), target
            )
        await forward.client.aclose()

    asyncio.run(forward_two())
    assert runner.launches == 1
    assert {str(r.url) for r in seen} == {runtime.state["url"]}  # type: ignore[index]
    for request in seen:
        assert request.headers["Authorization"] == f"Bearer {KEY}"
        assert request.headers["A2A-Version"] == "1.0"


def test_a_forwarding_executor_needs_somewhere_to_forward() -> None:
    with pytest.raises(ValueError, match="url or a target"):
        bridge.ForwardingExecutor()


# ── agent-runtimes kagent launch-runtime | end-runtime (the real client) ────


class Response:
    def __init__(self, status_code: int, payload: Any) -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = json.dumps(payload)

    def json(self) -> Any:
        return self._payload


@pytest.fixture
def platform(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str, Any]]:
    """The Runtimes service, behind ``AgentClient``'s own transport."""
    calls: list[tuple[str, str, Any]] = []

    def fetch(self: Any, request: str, **kwargs: Any) -> Response:
        method = kwargs.get("method", "GET")
        calls.append((method, request, kwargs.get("json")))
        if request.endswith("/environments") or "/environments?" in request:
            return Response(200, ENVIRONMENTS)
        if method == "POST" and request.endswith("/api/runtimes/v1/runtimes"):
            return Response(201, CREATED)
        if method == "DELETE" and request.endswith(f"/api/runtimes/v1/runtimes/{UID}"):
            return Response(
                200, {"success": True, "message": f"Runtime {UID} deleted."}
            )
        return Response(404, {"success": False, "message": f"no {method} {request}"})

    monkeypatch.setattr(AgentClient, "_fetch", fetch)
    AgentClient.list_environments.cache_clear()
    return calls


def request_for() -> datalayer.RuntimeRequest:
    return datalayer.runtime_request(
        "team-a/reviewer",
        {
            "DATALAYER_RUNTIME_ENVIRONMENT": "ai-agents-env",
            "DATALAYER_RUN_URL": RUN_URL,
            "AGENT_SPEC_ID": "example-blank",
            "DATALAYER_API_KEY": KEY,
            "DATALAYER_RUNTIME_MINUTES": "15",
        },
    )


def test_launch_goes_the_normal_path_as_kagent_for_the_agent(
    platform: list[tuple[str, str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    served: dict[str, Any] = {}

    async def serve_agentspec(name: str, description: str, spec_id: str, base_url: str, token: str, **kwargs: Any) -> A2ARemoteAgent:  # fmt: skip
        served.update(
            name=name, spec_id=spec_id, base_url=base_url, token=token, **kwargs
        )
        return A2ARemoteAgent(
            name=name,
            url=f"{base_url}/api/v1/a2a/agents/{name}",
            launch="cloud",
            runtime_uid=kwargs["runtime_uid"],
            token=token,
        )

    monkeypatch.setattr("agent_runtimes.subagents.a2a.serve_agentspec", serve_agentspec)
    launched = datalayer.launch_runtime(request_for())

    posts = [body for method, url, body in platform if method == "POST"]
    assert len(posts) == 1
    body = posts[0]
    assert body["client_id"] == "kagent" and body["agent_uid"] == "team-a/reviewer"
    assert body["agent_spec_id"] == "example-blank"
    assert body["environment"] == {"name": "ai-agents-env"}
    assert body["credits_limit"] == pytest.approx(0.01 * 60 * 15)
    assert launched == {
        "uid": UID,
        "url": f"{RUN_URL}/agent-runtimes/team-a/{UID}/api/v1/a2a/agents/reviewer/",
        "expired_at": 1791482800.0,
    }
    assert served["base_url"] == f"{RUN_URL}/agent-runtimes/team-a/{UID}"
    assert served["runtime_uid"] == UID and served["wait"] is True
    assert served["token"] == KEY


def test_a_runtime_that_cannot_serve_is_stopped(
    platform: list[tuple[str, str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    async def failing(*args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("the agent never answered its card")

    monkeypatch.setattr("agent_runtimes.subagents.a2a.serve_agentspec", failing)
    with pytest.raises(RuntimeError, match="never answered"):
        datalayer.launch_runtime(request_for())
    assert ("DELETE", f"{RUN_URL}/api/runtimes/v1/runtimes/{UID}", None) in platform


def test_end_stops_the_runtime_by_uid(platform: list[tuple[str, str, Any]]) -> None:
    assert datalayer.end_runtime(UID, RUN_URL, KEY) is True
    assert platform == [("DELETE", f"{RUN_URL}/api/runtimes/v1/runtimes/{UID}", None)]


def test_the_request_refuses_what_it_lacks() -> None:
    with pytest.raises(datalayer.DatalayerModeError, match="DATALAYER_RUN_URL"):
        datalayer.runtime_request("team-a/reviewer", {"AGENT_SPEC_ID": "x"})
    with pytest.raises(datalayer.DatalayerModeError, match="<namespace>/<agent>"):
        datalayer.agent_uid_of("reviewer")
    with pytest.raises(datalayer.DatalayerModeError, match="positive"):
        datalayer.minutes_of("0")
    assert datalayer.minutes_of("") == datalayer.DEFAULT_MINUTES
    assert KEY not in repr(request_for())


def test_the_commands_print_json_or_a_sentence(
    platform: list[tuple[str, str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    runner = CliRunner()
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    refused = runner.invoke(
        kagent_app, ["launch-runtime", "--agent", "team-a/reviewer"]
    )
    assert refused.exit_code == 1 and "DATALAYER_RUNTIME_ENVIRONMENT" in refused.output

    monkeypatch.setenv("DATALAYER_API_KEY", KEY)
    monkeypatch.setenv("DATALAYER_RUN_URL", RUN_URL)
    ended = runner.invoke(kagent_app, ["end-runtime", UID])
    assert ended.exit_code == 0, ended.output
    assert json.loads(ended.output.strip().splitlines()[-1]) == {
        "uid": UID,
        "ended": True,
    }
    assert KEY not in ended.output


# ── deploy/kagent-datalayer ─────────────────────────────────────────────────

OVERLAY = Path(__file__).resolve().parents[2] / "deploy" / "kagent-datalayer"


def test_the_overlay_asks_for_the_datalayer_mode_with_an_injected_key() -> None:
    kustomization = yaml.safe_load((OVERLAY / "kustomization.yaml").read_text())
    assert kustomization["resources"] == ["../kagent", "egresspolicy.yaml"]
    policy = yaml.safe_load((OVERLAY / "egresspolicy.yaml").read_text())
    assert policy["apiVersion"] == "api.kagent.dev/v1alpha3"
    assert policy["kind"] == "EgressPolicy"
    for destination in policy["spec"]["destinations"]:
        auth = destination["authentication"]
        assert auth["header"] == "Authorization" and auth["prefix"] == "Bearer "
        assert auth["secretKeyRef"] == {"name": "datalayer-api-key", "key": "api-key"}
    patches = (OVERLAY / "kustomization.yaml").read_text()
    for name in (
        "DATALAYER_RUNTIME_ENVIRONMENT",
        "DATALAYER_RUN_URL",
        "DATALAYER_API_KEY_INJECTED",
        "egressPolicyRefs",
    ):
        assert name in patches
    for path in OVERLAY.iterdir():
        text = path.read_text()
        assert (
            "DATALAYER_API_KEY\n" not in text
            and "name: DATALAYER_API_KEY\n" not in text
        )
        assert not re.search(r"(sk-[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]{10,})", text), path
