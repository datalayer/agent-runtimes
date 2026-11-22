# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A plain sandbox's extra egress hosts.

A Datalayer sandbox reaches any public host on ports 80 and 443 only; a launch
may name extra ``host:port`` for one sandbox (``egress``), which the platform
checks and its firewall applies. ``RuntimesClient.create`` sends them only
when named, ``AgentClient.create_runtime`` passes them on, a runtime answered
by the platform carries them (``RuntimeService.egress``), and
``datalayer sandboxes create --egress host:port`` (repeatable) asks for them
and shows them.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from typer.testing import CliRunner

from agent_runtimes.commands import sandboxes as sandboxes_command
from agent_runtimes.runtimes.client import RuntimesClient
from agent_runtimes.runtimes.runtime_service import RuntimeService


class _Answer:
    status_code = 200
    text = ""

    def json(self) -> dict[str, Any]:
        return {"success": True, "runtime": {"uid": "01RUNTIME"}}


class _Transport:
    def __init__(self) -> None:
        self.urls = SimpleNamespace(
            runtimes_url="https://runtimes.example", iam_url="https://iam.example"
        )
        self.bodies: list[dict[str, Any]] = []

    def _fetch(self, request: str, **kwargs: Any) -> _Answer:
        self.bodies.append(dict(kwargs.get("json") or {}))
        return _Answer()


def test_the_extra_hosts_are_sent_only_when_named() -> None:
    transport = _Transport()
    client = RuntimesClient(transport)
    client.create(
        environment_name="ai-agents-env", credits_limit=1.0, egress=["github.com:22"]
    )
    client.create(environment_name="ai-agents-env", credits_limit=1.0)
    client.create(environment_name="ai-agents-env", credits_limit=1.0, egress=[])
    named, unsaid, empty = transport.bodies
    assert named["egress"] == ["github.com:22"]
    assert "egress" not in unsaid and "egress" not in empty


def test_a_runtime_carries_the_hosts_the_platform_answers() -> None:
    runtime = RuntimeService(name="s", egress=["github.com:22"])
    assert runtime.egress == ["github.com:22"]
    assert RuntimeService(name="s").egress == []


def test_create_runtime_passes_the_hosts_on(monkeypatch) -> None:
    from agent_runtimes.client import agent_client

    sent: dict[str, Any] = {}

    class _Runtimes:
        def create(self, **kwargs: Any) -> dict[str, Any]:
            sent.update(kwargs)
            return {
                "success": True,
                "runtime": {
                    "given_name": "s",
                    "environment": {"name": "ai-agents-env"},
                    "ingress": "https://r.example/x",
                    "token": "t",
                    "uid": "01RUNTIME",
                    "egress": ["github.com:22"],
                },
            }

    client = agent_client.AgentClient.__new__(agent_client.AgentClient)
    client._urls = SimpleNamespace(
        runtimes_url="https://r.example", iam_url="https://i.example"
    )
    monkeypatch.setattr(
        agent_client.AgentClient, "runtimes", property(lambda self: _Runtimes())
    )
    monkeypatch.setattr(agent_client.AgentClient, "_get_api_key", lambda self: "k")
    monkeypatch.setattr(
        agent_client.environment_prices, "recall", lambda url, environment: (0.001, "")
    )
    runtime = client.create_runtime(
        name="s", environment="ai-agents-env", egress=["github.com:22"]
    )
    assert sent["egress"] == ["github.com:22"]
    assert runtime.egress == ["github.com:22"]


def _info(**metadata: Any) -> Any:
    return SimpleNamespace(
        id="01RUNTIME", name="s", status="running", metadata=metadata
    )


def test_the_cli_asks_for_each_egress_and_shows_them(monkeypatch) -> None:
    asked: dict[str, Any] = {}

    class _Manager:
        def create(self, **options: Any) -> Any:
            asked.update(options)
            return _info(egress=list(options.get("egress") or []))

    monkeypatch.setattr(sandboxes_command, "_manager", lambda provider: _Manager())
    result = CliRunner().invoke(
        sandboxes_command.app,
        ["create", "datalayer", "--egress", "github.com:22", "--egress", "1.1.1.1:53"],
        env={"COLUMNS": "200"},
    )
    assert result.exit_code == 0, result.output
    assert asked["egress"] == ["github.com:22", "1.1.1.1:53"]
    assert "Egress" in result.output and "github.com:22, 1.1.1.1:53" in result.output


def test_the_cli_sends_no_egress_unless_asked_and_says_a_refusal(monkeypatch) -> None:
    asked: dict[str, Any] = {}

    class _Manager:
        def create(self, **options: Any) -> Any:
            asked.update(options)
            if options.get("egress"):
                raise RuntimeError(
                    "'10.0.0.1:80' is refused: '10.0.0.1:80' is a private or reserved address."
                )
            return _info()

    monkeypatch.setattr(sandboxes_command, "_manager", lambda provider: _Manager())
    result = CliRunner().invoke(sandboxes_command.app, ["create", "datalayer"])
    assert result.exit_code == 0 and "egress" not in asked
    result = CliRunner().invoke(
        sandboxes_command.app,
        ["create", "datalayer", "--egress", "10.0.0.1:80"],
        env={"COLUMNS": "200"},
    )
    assert result.exit_code == 1
    assert "private or reserved address" in result.output


def test_the_egress_cell_reads_a_list_or_a_string() -> None:
    assert sandboxes_command._egress_label(
        _info(egress=["a.example:22", "b.example:25"])
    ) == ("a.example:22, b.example:25")
    assert (
        sandboxes_command._egress_label(_info(egress="a.example:22")) == "a.example:22"
    )
    assert sandboxes_command._egress_label(_info()) == ""
