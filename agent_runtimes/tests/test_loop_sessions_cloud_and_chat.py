# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop sessions list --cloud` reads Datalayer's record and says a missing
runtime in a sentence; an install without the chat says so only when asked.
"""

from __future__ import annotations

from typing import Any, Dict, List

import httpx
from typer.testing import CliRunner

from agent_runtimes.commands import sessions

runner = CliRunner()


def test_cloud_without_a_server_reads_the_record(monkeypatch: Any) -> None:
    asked: List[Dict[str, Any]] = []

    def record(params: Dict[str, Any]) -> Dict[str, Any]:
        asked.append(params)
        return {
            "sessions": [
                {
                    "uid": "01ABC",
                    "state": "paused",
                    "kind": "agent",
                    "agent": "a",
                    "turns": 1,
                },
                {
                    "uid": "01DEF",
                    "state": "ended",
                    "kind": "agent",
                    "agent": "a",
                    "turns": 1,
                },
            ]
        }

    def no_runtime(server: Any, cloud: bool) -> Any:
        raise AssertionError("no runtime is asked with --cloud and no server")

    monkeypatch.delenv("AGENT_RUNTIMES_URL", raising=False)
    sessions.use_record(record)
    sessions.use_client(no_runtime)
    try:
        result = runner.invoke(sessions.app, ["list", "--cloud"])
    finally:
        sessions.use_record(None)
        sessions.use_client(None)
    assert result.exit_code == 0, result.output
    assert asked and asked[0]["limit"] == 50
    assert "01ABC" in result.output and "01DEF" not in result.output


def test_no_runtime_at_the_address_is_a_sentence(monkeypatch: Any) -> None:
    class Refusing:
        base_url = "http://127.0.0.1:8765"

        def request(self, *args: Any, **kwargs: Any) -> Any:
            raise httpx.ConnectError("[Errno 111] Connection refused")

    sessions.use_client(lambda server, cloud: Refusing())
    try:
        result = runner.invoke(sessions.app, ["list"])
    finally:
        sessions.use_client(None)
    assert result.exit_code == 1
    assert "No runtime answers at http://127.0.0.1:8765" in result.output
    assert "Traceback" not in result.output


def test_the_chat_unavailable_is_said_when_asked_not_at_start() -> None:
    import agent_runtimes.__main__ as main

    source = open(main.__file__).read()
    assert 'logger.warning("Chat CLI disabled at startup' not in source
    assert "The chat cannot start in this installation" in source
