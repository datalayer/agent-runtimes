# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``serve --target kagent``, the kagent bridge's relay, and ``deploy/kagent``.

kagent (1.0) hands a BYO actor an ``ADKConfig`` at ``/config/config.json``
(ProtoJSON, proto field names): the target reads the model and the MCP tools
from it and refuses, in a sentence, what it cannot serve as bound. The bridge's
helpers are the standard library's only; its executor is tested where
kagent-core is installed (the bridge's own environment).
"""

from __future__ import annotations

import asyncio
import json
import re
import socket
from pathlib import Path
from typing import Any

import pytest
import yaml

from agent_runtimes.commands.serve import ServeError, Target, serve_server
from agent_runtimes.kagent import bridge
from agent_runtimes.kagent.settings import (
    kagent_settings,
    mcp_servers_of,
    model_of,
    server_id_of,
)

DEPLOY = Path(__file__).resolve().parents[2] / "deploy" / "kagent"


def write_config(tmp_path: Path, agent: dict[str, Any]) -> Path:
    path = tmp_path / "config.json"
    path.write_text(
        json.dumps(
            {
                "runtime": {
                    "name": "agent-runtimes",
                    "namespace": "kagent",
                    "port": 80,
                    "control_plane_url": "http://kagent-controller.kagent.svc.cluster.local:8083",
                },
                "agent": agent,
            }
        )
    )
    return path


def env_of(tmp_path: Path, agent: dict[str, Any], **extra: str) -> dict[str, str]:
    return {
        "AGENT_SPEC_ID": "example-blank",
        "KAGENT_CONFIG_PATH": str(write_config(tmp_path, agent)),
        **extra,
    }


# ── settings ────────────────────────────────────────────────────────────────


def test_settings_from_kagent_configuration(tmp_path: Path) -> None:
    settings = kagent_settings(
        env_of(
            tmp_path,
            {
                "model": {
                    "model": "bedrock:us.anthropic.claude-sonnet-4-6",
                    "openai": {
                        "base_url": "https://datalayer.example.com/api/ai-inference/v1"
                    },
                },
                "http_tools": [
                    {
                        "params": {
                            "url": "https://mcp.example.com/mcp",
                            "headers": {"Authorization": "Bearer placeholder"},
                        }
                    }
                ],
            },
        )
    )
    assert settings.spec_id == "example-blank"
    assert (settings.host, settings.port) == ("127.0.0.1", 8765)
    assert settings.model is not None
    assert settings.model.model_id == "openai:bedrock:us.anthropic.claude-sonnet-4-6"
    assert settings.model.env == {
        "OPENAI_BASE_URL": "https://datalayer.example.com/api/ai-inference/v1"
    }
    assert settings.mcp_servers == [
        {
            "id": "kagent-mcp-example-com-mcp",
            "name": "kagent-mcp-example-com-mcp",
            "description": "kagent RemoteMCPServer at https://mcp.example.com/mcp",
            "url": "https://mcp.example.com/mcp",
            "headers": {"Authorization": "Bearer placeholder"},
            "transport": "streamable-http",
        }
    ]


def test_no_model_keeps_the_agentspec_model(tmp_path: Path) -> None:
    assert kagent_settings(env_of(tmp_path, {})).model is None


def test_the_agentspec_is_required(tmp_path: Path) -> None:
    env = env_of(tmp_path, {})
    del env["AGENT_SPEC_ID"]
    with pytest.raises(ValueError, match="AGENT_SPEC_ID"):
        kagent_settings(env)


def test_a_missing_configuration_is_refused(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="does not exist"):
        kagent_settings(
            {"AGENT_SPEC_ID": "x", "KAGENT_CONFIG_PATH": str(tmp_path / "none.json")}
        )


def test_a_bad_port_is_refused(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="port"):
        kagent_settings(env_of(tmp_path, {}, AGENT_RUNTIMES_KAGENT_PORT="eighty"))


@pytest.mark.parametrize(
    ("model", "model_id", "env"),
    [
        (
            {"model": "gpt-5-mini", "openai": {"api_format": "responses"}},
            "openai-responses:gpt-5-mini",
            {},
        ),
        (
            {
                "model": "claude-sonnet-4-6",
                "anthropic": {"base_url": "https://a.example.com"},
            },
            "anthropic:claude-sonnet-4-6",
            {"ANTHROPIC_BASE_URL": "https://a.example.com"},
        ),
        (
            {
                "model": "us.anthropic.claude-sonnet-4-6",
                "bedrock": {"region": "us-east-1"},
            },
            "bedrock:us.anthropic.claude-sonnet-4-6",
            {"AWS_REGION": "us-east-1"},
        ),
    ],
)
def test_providers_map_to_agent_runtimes_models(
    model: dict[str, Any], model_id: str, env: dict[str, str]
) -> None:
    mapped = model_of({"model": model})
    assert mapped is not None
    assert (mapped.model_id, mapped.env) == (model_id, env)


def test_an_unsupported_provider_is_refused() -> None:
    with pytest.raises(ValueError, match="'gemini'"):
        model_of({"model": {"model": "gemini-2.5-pro", "gemini": {}}})


@pytest.mark.parametrize(
    ("agent", "sentence"),
    [
        (
            {"sse_tools": [{"params": {"url": "https://x.example.com/sse"}}]},
            "sse_tools",
        ),
        ({"stdio_tools": [{"command": "npx"}]}, "stdio_tools"),
        ({"http_tools": [{"params": {}}]}, "no URL"),
        (
            {
                "http_tools": [
                    {"params": {"url": "https://x.example.com"}, "tools": ["a"]}
                ]
            },
            "selects tools",
        ),
        (
            {
                "http_tools": [
                    {
                        "params": {"url": "https://x.example.com"},
                        "require_approval": True,
                    }
                ]
            },
            "approvals",
        ),
        (
            {
                "http_tools": [
                    {
                        "params": {"url": "https://x.example.com"},
                        "token_passthrough": True,
                    }
                ]
            },
            "token",
        ),
    ],
)
def test_bindings_not_served_as_bound_are_refused(
    agent: dict[str, Any], sentence: str
) -> None:
    with pytest.raises(ValueError, match=sentence):
        mcp_servers_of(agent)


def test_server_ids_are_unique() -> None:
    taken: set[str] = set()
    first = server_id_of("https://mcp.example.com/mcp", taken)
    second = server_id_of("https://mcp.example.com/mcp", taken)
    assert first != second and second.endswith("-2")


# ── serve --target kagent ───────────────────────────────────────────────────


@pytest.fixture()
def no_server(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    import uvicorn

    runs: list[dict[str, Any]] = []
    monkeypatch.setattr(uvicorn, "run", lambda *a, **k: runs.append(k))
    return runs


def test_serve_target_kagent_configures_the_agent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, no_server: list[dict[str, Any]]
) -> None:
    for name, value in env_of(
        tmp_path,
        {
            "model": {
                "model": "gpt-5-mini",
                "openai": {"base_url": "https://m.example.com/v1"},
            }
        },
    ).items():
        monkeypatch.setenv(name, value)
    for name in (
        "AGENT_RUNTIMES_MODEL",
        "AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE",
        "OPENAI_BASE_URL",
        "AGENT_RUNTIMES_TARGET",
        "AGENT_RUNTIMES_DEFAULT_AGENT",
        "AGENT_RUNTIMES_PROTOCOL",
        "AGENT_RUNTIMES_PORT",
        "AGENT_RUNTIMES_AGENT_NAME",
        "AGENT_RUNTIMES_NODE",
        "AGENT_RUNTIMES_DISABLE_TOOL_APPROVALS",
    ):
        monkeypatch.delenv(name, raising=False)
    import os

    serve_server(host="0.0.0.0", port=9999, target=Target.kagent)  # nosec B104 - overridden
    assert no_server[0]["host"] == "127.0.0.1" and no_server[0]["port"] == 8765
    assert os.environ["AGENT_RUNTIMES_TARGET"] == "kagent"
    assert os.environ["AGENT_RUNTIMES_DEFAULT_AGENT"] == "example-blank"
    assert os.environ["AGENT_RUNTIMES_PROTOCOL"] == "a2a"
    assert os.environ["AGENT_RUNTIMES_MODEL"] == "openai:gpt-5-mini"
    assert os.environ["AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE"] == "local"
    assert os.environ["OPENAI_BASE_URL"] == "https://m.example.com/v1"


def test_serve_target_kagent_refuses_an_agent_id(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, no_server: list[dict[str, Any]]
) -> None:
    for name, value in env_of(tmp_path, {}).items():
        monkeypatch.setenv(name, value)
    with pytest.raises(ServeError, match="not --agent-id"):
        serve_server(agent_id="crawler", target=Target.kagent)
    assert not no_server


def test_serve_target_kagent_refuses_an_unknown_agentspec(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, no_server: list[dict[str, Any]]
) -> None:
    for name, value in env_of(tmp_path, {}, AGENT_SPEC_ID="no-such-agentspec").items():
        monkeypatch.setenv(name, value)
    with pytest.raises(ServeError, match="no-such-agentspec"):
        serve_server(target=Target.kagent)
    assert not no_server


# ── the bridge's helpers ────────────────────────────────────────────────────


def test_send_request_forwards_the_message_in_the_session_context() -> None:
    request = bridge.send_request(
        {
            "messageId": "m1",
            "taskId": "kagent-task",
            "contextId": "other",
            "role": "ROLE_USER",
            "parts": [{"text": "Hello"}],
            "metadata": {"k": "v"},
        },
        "session-1",
    )
    assert request["method"] == "SendMessage"
    message = request["params"]["message"]
    assert message["contextId"] == "session-1"
    assert "taskId" not in message and message["messageId"] != "m1"
    assert message["parts"] == [{"text": "Hello"}] and message["metadata"] == {"k": "v"}


def test_task_of_reads_the_task_or_refuses() -> None:
    task = {"id": "t", "status": {"state": "TASK_STATE_COMPLETED"}}
    assert bridge.task_of({"result": {"task": task}}) == task
    assert bridge.task_of({"result": task}) == task
    assert bridge.state_of(task) == "TASK_STATE_COMPLETED"
    with pytest.raises(RuntimeError, match="refused the task: nope"):
        bridge.task_of({"error": {"code": -32000, "message": "nope"}})
    with pytest.raises(RuntimeError, match="no task"):
        bridge.task_of({"result": {}})


def test_upstream_url_is_the_loopback_a2a_mount() -> None:
    assert (
        bridge.upstream_url({"AGENT_RUNTIMES_KAGENT_PORT": "9000"})
        == "http://127.0.0.1:9000/api/v1/a2a/agents/default/"
    )


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def test_readyz_says_503_until_agent_runtimes_answers() -> None:
    async def probe() -> tuple[bytes, bytes]:
        port = free_port()
        server = await bridge.readiness_server(
            {"AGENT_RUNTIMES_KAGENT_PORT": str(free_port())}, port=port
        )
        try:
            answers = []
            for path in (b"/readyz", b"/other"):
                reader, writer = await asyncio.open_connection("127.0.0.1", port)
                writer.write(b"GET " + path + b" HTTP/1.1\r\n\r\n")
                await writer.drain()
                answers.append((await reader.readline()).strip())
                writer.close()
            return answers[0], answers[1]
        finally:
            server.close()

    ready, other = asyncio.run(probe())
    assert ready == b"HTTP/1.1 503 Service Unavailable"
    assert other == b"HTTP/1.1 404 Not Found"


def test_the_bridge_imports_nothing_of_agent_runtimes() -> None:
    source = Path(bridge.__file__).read_text()
    assert not re.search(r"^\s*(from|import) agent_runtimes", source, re.M)


def test_executor_relays_the_upstream_task() -> None:
    """Runs in the bridge's environment (kagent-core, a2a-sdk 1.x); skipped elsewhere."""
    pytest.importorskip("kagent.core")
    from a2a.types import Message, Part, Role, TaskState

    class Context:
        task_id, context_id, current_task = "kt", "session-1", None
        message = Message(message_id="m", role=Role.ROLE_USER, parts=[Part(text="hi")])

    class Queue:
        def __init__(self) -> None:
            self.events: list[Any] = []

        async def enqueue_event(self, event: Any) -> None:
            self.events.append(event)

    answers = iter(
        [
            {"id": "up", "status": {"state": "TASK_STATE_SUBMITTED"}},
            {
                "id": "up",
                "status": {"state": "TASK_STATE_COMPLETED"},
                "artifacts": [{"artifactId": "a", "parts": [{"text": "hello"}]}],
            },
        ]
    )
    forward = bridge.executor("http://upstream", poll=0)

    async def call(body: Any) -> Any:
        return next(answers)

    forward._call = call  # type: ignore[method-assign]
    queue = Queue()
    asyncio.run(forward.execute(Context(), queue))
    assert queue.events[-2].artifact.parts[0].text == "hello"
    assert queue.events[-1].status.state == TaskState.TASK_STATE_COMPLETED


# ── deploy/kagent ───────────────────────────────────────────────────────────


def manifests() -> dict[str, dict[str, Any]]:
    kustomization = yaml.safe_load((DEPLOY / "kustomization.yaml").read_text())
    return {
        name: yaml.safe_load((DEPLOY / name).read_text())
        for name in kustomization["resources"]
    }


def test_the_manifests_are_kagent_1_0_objects() -> None:
    documents = manifests()
    assert {d["kind"] for d in documents.values()} == {
        "Harness",
        "AgentTemplate",
        "Agent",
        "ModelConfig",
    }
    assert {d["apiVersion"] for d in documents.values()} == {"api.kagent.dev/v1alpha3"}


def test_the_harness_is_byo_digest_pinned_with_its_agentspec() -> None:
    harness = manifests()["harness.yaml"]["spec"]
    assert harness["byo"] == {}
    assert re.fullmatch(r"[^\s@]+@sha256:[a-f0-9]{64}", harness["workload"]["image"])
    assert harness["workload"]["command"][-1] == "/opt/kagent-bridge/bridge.py"
    assert {e["name"] for e in harness["env"]} == {"AGENT_SPEC_ID"}


def test_the_agent_pairs_the_template_and_the_harness() -> None:
    documents = manifests()
    agent = documents["agent.yaml"]["spec"]
    assert (
        agent["template"]["ref"]["name"]
        == documents["agenttemplate.yaml"]["metadata"]["name"]
    )
    assert agent["harnessRef"]["name"] == documents["harness.yaml"]["metadata"]["name"]


def test_no_key_is_in_the_manifests() -> None:
    for name, document in manifests().items():
        if document["kind"] == "ModelConfig":
            spec = document["spec"]
            assert spec["apiKeySecret"] and spec["apiKeySecretKey"] == "api-key"
            assert "apiKey" not in spec
        text = (DEPLOY / name).read_text()
        assert not re.search(r"(sk-[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]{10,})", text), name
