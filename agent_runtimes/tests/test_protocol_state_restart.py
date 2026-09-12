# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A runtime restarted mid-run keeps its A2A task and its ACP session (ORCHESTRATOR.md, O1-11).

Each test starts the runtime as a process of its own with uvicorn, kills it
with SIGKILL — no shutdown, nothing flushed on the way out — and starts
another over the same protocol state file. The A2A task a client was given is
found by the next process and finished by it; the ACP session a client made is
loaded by the next process with its conversation replayed. The ACP route
speaks the schema: ``prompt``, updates nested under ``update``, and
``session/cancel`` a notification that ends the running prompt unanswered.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Iterator

import httpx
import pytest
from websockets.sync.client import ClientConnection, connect

pytestmark = pytest.mark.skipif(sys.platform == "win32", reason="SIGKILL")


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


@contextmanager
def runtime(state: Path, gate: Path) -> Iterator[str]:
    """The runtime in a process of its own, killed on the way out."""
    port = _free_port()
    environment = {
        **os.environ,
        "AGENT_RUNTIMES_PROTOCOL_STATE_PATH": str(state),
        "PROTOCOL_STATE_GATE": str(gate),
    }
    environment.pop("KUBERNETES_SERVICE_HOST", None)
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "agent_runtimes.tests.protocol_state_app:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--log-level",
            "warning",
        ],
        env=environment,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        _until(lambda: _answers(base), seconds=60, what="the runtime to start")
        yield base
    finally:
        process.kill()
        process.wait(timeout=30)


def _answers(base: str) -> bool:
    try:
        return httpx.get(f"{base}/ready", timeout=2).status_code == 200
    except httpx.HTTPError:
        return False


def _until(condition: Callable[[], bool], *, seconds: float = 20.0, what: str = "the condition") -> None:
    deadline = time.monotonic() + seconds
    while not condition():
        assert time.monotonic() < deadline, f"waited for {what} for {seconds} s"
        time.sleep(0.1)


def a2a(base: str, method: str, params: dict[str, Any]) -> dict[str, Any]:
    response = httpx.post(
        f"{base}/api/v1/a2a/agents/slow/",
        json={"jsonrpc": "2.0", "id": "1", "method": method, "params": params},
        timeout=10,
    )
    response.raise_for_status()
    return dict(response.json()["result"])


def _state_of(base: str, task_id: str) -> str:
    return str(a2a(base, "tasks/get", {"id": task_id})["status"]["state"])


class ACP:
    """One ACP connection, reading what arrives until the answer to a request."""

    def __init__(self, websocket: ClientConnection) -> None:
        self.websocket = websocket
        self.counter = 0

    def request(self, method: str, params: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        self.counter += 1
        identifier = self.counter
        self.websocket.send(json.dumps({"jsonrpc": "2.0", "id": identifier, "method": method, "params": params}))
        return self.answer(identifier)

    def notify(self, method: str, params: dict[str, Any]) -> None:
        self.websocket.send(json.dumps({"jsonrpc": "2.0", "method": method, "params": params}))

    def send(self, method: str, params: dict[str, Any]) -> int:
        self.counter += 1
        self.websocket.send(json.dumps({"jsonrpc": "2.0", "id": self.counter, "method": method, "params": params}))
        return self.counter

    def answer(self, identifier: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        notifications: list[dict[str, Any]] = []
        while True:
            message = json.loads(self.websocket.recv(timeout=20))
            if message.get("id") == identifier:
                assert "error" not in message or message["error"] is None, message
                return notifications, dict(message.get("result") or {})
            assert message.get("id") is None, f"an answer nobody asked for: {message}"
            notifications.append(message)


@contextmanager
def acp(base: str) -> Iterator[ACP]:
    with connect(base.replace("http://", "ws://") + "/api/v1/acp/ws/slow") as websocket:
        yield ACP(websocket)


def _text(updates: list[dict[str, Any]], kind: str = "agent_message_chunk") -> str:
    return "".join(
        update["params"]["update"]["content"]["text"]
        for update in updates
        if update["params"]["update"]["sessionUpdate"] == kind
    )


class TestA2A:
    def test_a_task_killed_mid_run_is_found_and_finished_by_the_next_process(self, tmp_path: Path) -> None:
        state, gate = tmp_path / "state.sqlite", tmp_path / "gate"
        with runtime(state, gate) as base:
            # `message/send` answers the task under `task`, as A2A 1.0 does;
            # `tasks/get` answers the task itself.
            task = a2a(
                base,
                "message/send",
                {"message": {"role": "user", "parts": [{"text": "the notebook"}], "messageId": "m1"}},
            )["task"]
            _until(lambda: _state_of(base, task["id"]) == "working", what="the task to start")
        # Killed mid-run: the gate was closed, so the task was working.
        gate.touch()
        with runtime(state, gate) as base:
            assert _state_of(base, task["id"]) in {"submitted", "working", "completed"}, "the next process knows it"
            _until(lambda: _state_of(base, task["id"]) == "completed", what="the next process to finish it")
            finished = a2a(base, "tasks/get", {"id": task["id"]})
            assert "Second half." in json.dumps(finished.get("artifacts") or [])


class TestACP:
    def test_a_session_is_loaded_with_its_conversation_by_the_next_process(self, tmp_path: Path) -> None:
        state, gate = tmp_path / "state.sqlite", tmp_path / "gate"
        gate.touch()
        with runtime(state, gate) as base, acp(base) as connection:
            connection.request("initialize", {"protocolVersion": 1})
            _, created = connection.request("session/new", {"cwd": "/work", "mcpServers": []})
            session_id = created["sessionId"]
            updates, answered = connection.request(
                "session/prompt",
                {"sessionId": session_id, "prompt": [{"type": "text", "text": "the notebook"}]},
            )
            assert answered["stopReason"] == "end_turn"
            assert _text(updates) == "First half of the notebook. Second half."

        with runtime(state, gate) as base, acp(base) as connection:
            _, initialized = connection.request("initialize", {"protocolVersion": 1})
            assert initialized["agentCapabilities"]["loadSession"] is True
            replayed, _ = connection.request("session/load", {"sessionId": session_id, "cwd": "/work", "mcpServers": []})
            assert [
                (update["params"]["update"]["sessionUpdate"], update["params"]["update"]["content"]["text"])
                for update in replayed
            ] == [
                ("user_message_chunk", "the notebook"),
                ("agent_message_chunk", "First half of the notebook. Second half."),
            ]
            updates, answered = connection.request(
                "session/prompt",
                {"sessionId": session_id, "prompt": [{"type": "text", "text": "the plots"}]},
            )
            assert answered["stopReason"] == "end_turn" and _text(updates).startswith("First half of the plots.")

    def test_a_cancel_is_a_notification_that_ends_the_running_prompt(self, tmp_path: Path) -> None:
        state, gate = tmp_path / "state.sqlite", tmp_path / "gate"
        with runtime(state, gate) as base, acp(base) as connection:
            connection.request("initialize", {"protocolVersion": 1})
            _, created = connection.request("session/new", {"cwd": "/work", "mcpServers": []})
            session_id = created["sessionId"]
            prompted = connection.send(
                "session/prompt", {"sessionId": session_id, "prompt": [{"type": "text", "text": "the notebook"}]}
            )
            # The gate stays closed: the agent is waiting in the middle of its answer.
            first = json.loads(connection.websocket.recv(timeout=20))
            assert first["params"]["update"]["sessionUpdate"] == "agent_message_chunk"
            connection.notify("session/cancel", {"sessionId": session_id})
            updates, answered = connection.answer(prompted)
            assert answered["stopReason"] == "cancelled"
            assert "Second half." not in _text(updates)
