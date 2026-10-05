# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application served over A2A with fasta2a, to the members of its team.

The Accounting application of agentspecs' team `sales-and-accounting`, served
in process: its route as the runtime mounts it (fasta2a, the A2A 1.0 wire, the
gate), a scripted agent in place of a model, and the protocol state store in a
SQLite file of the test's own. What is checked is what the browser's Sales
application relies on: the card it reads, the 1.0 requests and answers of
`@a2a-js/sdk`, who is answered, and as whom the run acts.
"""

from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import httpx
import jwt
import pytest
from agentspecs.apps import APP_CATALOGUE

from agent_runtimes.adapters.base import BaseAgent, StreamEvent
from agent_runtimes.loop.apps import a2a as apps_a2a
from agent_runtimes.loop.apps.callers import VERIFIER, Caller, CallerRefused
from agent_runtimes.protocol_state import store as state_store
from agent_runtimes.protocol_state.store import SqliteProtocolStateStore
from agent_runtimes.routes import a2a as a2a_routes

#: Where the card says the route is, in the fixture the vitest of the browser's side reads.
CARD_FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "src"
    / "runtimes"
    / "__tests__"
    / "fixtures"
    / "accounting-agent-card.json"
)
URL = "http://runtime.test/api/v1/a2a/agents/accounting"
REPORT = "Open invoices: INV/2026/0007, 1,200.00 EUR due."
LOCAL = ("127.0.0.1", 50000)
REMOTE = ("203.0.113.7", 50000)


def _token(**claims: Any) -> str:
    return jwt.encode(
        {"sub": "owner-uid", "exp": int(time.time()) + 3600, **claims},
        "not-the-platform-secret",
        algorithm="HS256",
    )


KEY = _token(task_grant_uid="grant-1", task_uid="a2a:local:accounting:k1")


@pytest.fixture
def state(tmp_path: Any, monkeypatch: Any) -> SqliteProtocolStateStore:
    store = SqliteProtocolStateStore(tmp_path / "state.sqlite")
    monkeypatch.setattr(state_store, "_store", store)
    monkeypatch.delenv("DATALAYER_RUNTIME_ID", raising=False)
    return store


@pytest.fixture
def platform(monkeypatch: Any) -> list[str]:
    """IAM, as the verifier asks it: every well-formed token is somebody's."""
    asked: list[str] = []

    async def verify(token: str, app_uid: str = "") -> Caller:
        asked.append(token)
        if token == "refused":
            raise CallerRefused(401, "The platform does not accept this token.")
        return Caller(kind="person", uid="owner-uid")

    monkeypatch.setattr(VERIFIER, "verify", verify)
    return asked


class Accounting(BaseAgent):
    """The accounting agent, scripted: it reads the books and answers."""

    def __init__(self) -> None:
        self.contexts: list[Any] = []

    async def run(self, prompt: str, context: Any) -> Any:  # pragma: no cover
        raise NotImplementedError

    async def stream(self, prompt: str, context: Any) -> AsyncIterator[StreamEvent]:
        self.contexts.append(context)
        yield StreamEvent(type="text", data="Open invoices: ")
        yield StreamEvent(type="text", data=REPORT[len("Open invoices: ") :])

    def get_tools(self) -> list[Any]:
        return []

    @property
    def name(self) -> str:
        return "accounting"

    @property
    def description(self) -> str:
        return "Accounting"

    @property
    def version(self) -> str:
        return "0.0.1"


@asynccontextmanager
async def served(state: Any) -> AsyncIterator[tuple[Any, Accounting]]:
    """The application's route, mounted and running, as the runtime serves it."""
    agent = Accounting()
    a2a_routes._a2a_mounts.clear()
    said = apps_a2a.serve_app_over_a2a(APP_CATALOGUE["accounting"], agent, URL)
    assert said == {
        "url": f"{URL}/",
        "card": f"{URL}/.well-known/agent-card.json",
        "task": "a2a:local:accounting:",
    }
    registration = a2a_routes.get_a2a_agents()["accounting"]
    [mount] = [m for m in a2a_routes.get_a2a_mounts() if m.path == "/accounting"]
    lifespan = registration.app.router.lifespan_context(registration.app)
    await lifespan.__aenter__()
    try:
        yield mount.app, agent
    finally:
        await lifespan.__aexit__(None, None, None)
        apps_a2a.stop_serving_apps()


def _client(app: Any, client: tuple[str, int] = LOCAL) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, client=client),
        base_url="http://runtime.test",
        timeout=10.0,
    )


def _stream_request(text: str, method: str = "SendStreamingMessage") -> dict[str, Any]:
    """What `@a2a-js/sdk` 1.x sends: 1.0 method names and enums."""
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": {
            "message": {
                "messageId": "m-1",
                "role": "ROLE_USER",
                "parts": [{"text": text}],
            },
            "configuration": {"returnImmediately": False},
        },
    }


def _events(body: str) -> list[dict[str, Any]]:
    return [
        json.loads(line[len("data:") :])
        for line in body.splitlines()
        if line.startswith("data:")
    ]


class TestTheCard:
    @pytest.mark.asyncio
    async def test_it_says_what_accounting_is_asked_and_that_a_key_is_needed(
        self, state: Any
    ) -> None:
        async with served(state) as (app, _), _client(app, REMOTE) as client:
            card = (await client.get("/.well-known/agent-card.json")).json()
        accounting = APP_CATALOGUE["accounting"]
        assert card["name"] == "Accounting"
        assert card["version"] == accounting.version
        assert card["supportedInterfaces"] == [
            {"protocolBinding": "JSONRPC", "url": f"{URL}/", "protocolVersion": "1.0"}
        ]
        [skill] = card["skills"]
        assert skill["id"] == "accounting"
        assert skill["examples"] == [s.message for s in accounting.interface.starters]
        assert skill["inputModes"] == skill["outputModes"] == ["text/plain"]
        assert card["capabilities"]["streaming"] is True
        assert card["securitySchemes"]["datalayer"]["httpAuthSecurityScheme"][
            "scheme"
        ] == ("Bearer")
        assert card["securityRequirements"] == [{"schemes": {"datalayer": []}}]

    @pytest.mark.asyncio
    async def test_the_browsers_fixture_is_the_card_the_runtime_serves(
        self, state: Any
    ) -> None:
        """The vitest of the Sales side reads this file: it must not drift."""
        async with served(state) as (app, _), _client(app) as client:
            card = (await client.get("/.well-known/agent-card.json")).json()
        assert json.loads(CARD_FIXTURE.read_text()) == card


class TestTheWire:
    """fasta2a answers `@a2a-js/sdk` 1.x: A2A 1.0 method names and enums."""

    @pytest.mark.asyncio
    async def test_a_1_0_stream_is_answered_in_1_0(self, state: Any) -> None:
        async with served(state) as (app, agent), _client(app) as client:
            response = await client.post("/", json=_stream_request("Open invoices?"))
        assert response.status_code == 200
        events = _events(response.text)
        results = [event["result"] for event in events]
        assert "task" in results[0]
        assert results[0]["task"]["status"]["state"] == "TASK_STATE_SUBMITTED"
        states = [
            r["statusUpdate"]["status"]["state"] for r in results if "statusUpdate" in r
        ]
        assert states[0] == "TASK_STATE_WORKING"
        assert states[-1] == "TASK_STATE_COMPLETED"
        final = [r for r in results if "statusUpdate" in r][-1]["statusUpdate"]
        assert final["status"]["message"]["role"] == "ROLE_AGENT"
        assert final["status"]["message"]["parts"] == [{"text": REPORT}]
        artifacts = [
            r["artifactUpdate"]["artifact"] for r in results if "artifactUpdate" in r
        ]
        assert artifacts[-1]["parts"] == [{"text": REPORT}]
        # Asked from the machine itself: no key, and the run acts as the runtime.
        assert "user_token" not in agent.contexts[0].metadata

    @pytest.mark.asyncio
    async def test_fasta2a_s_own_method_names_are_answered_as_before(
        self, state: Any
    ) -> None:
        request = _stream_request("Open invoices?", method="message/send")
        request["params"]["message"]["role"] = "user"
        del request["params"]["configuration"]
        async with served(state) as (app, _), _client(app) as client:
            answer = (await client.post("/", json=request)).json()
        assert answer["result"]["task"]["status"]["state"] == "submitted"


class TestWhoIsAnswered:
    @pytest.mark.asyncio
    async def test_a_remote_caller_without_a_key_is_refused(
        self, state: Any, platform: list[str]
    ) -> None:
        async with served(state) as (app, agent), _client(app, REMOTE) as client:
            response = await client.post("/", json=_stream_request("Open invoices?"))
        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"
        assert agent.contexts == [] and platform == []

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("token", "status", "says"),
        [
            ("refused", 401, "does not accept"),
            (_token(), 403, "not granted to it"),
            (
                _token(task_grant_uid="g", task_uid="a2a:local:sales:k1"),
                403,
                "another route",
            ),
            (
                _token(task_grant_uid="g", task_uid="a2a:01other:accounting:k1"),
                403,
                "another route",
            ),
        ],
    )
    async def test_a_token_not_granted_to_this_route_is_refused(
        self, state: Any, platform: list[str], token: str, status: int, says: str
    ) -> None:
        async with served(state) as (app, agent), _client(app, REMOTE) as client:
            response = await client.post(
                "/",
                json=_stream_request("Open invoices?"),
                headers={"Authorization": f"Bearer {token}"},
            )
        assert response.status_code == status
        assert says in response.json()["detail"]
        assert agent.contexts == []

    @pytest.mark.asyncio
    async def test_a_key_granted_to_it_is_answered_and_the_run_acts_with_it(
        self, state: Any, platform: list[str]
    ) -> None:
        request = _stream_request("Open invoices?")
        # A caller does not choose the identity its run acts as.
        request["params"]["message"]["metadata"] = {
            "datalayer": {"credential": "somebody-elses"}
        }
        async with served(state) as (app, agent), _client(app, REMOTE) as client:
            response = await client.post(
                "/", json=request, headers={"Authorization": f"Bearer {KEY}"}
            )
            assert response.status_code == 200
            events = _events(response.text)
            assert events[-1]["result"]["statusUpdate"]["status"]["state"] == (
                "TASK_STATE_COMPLETED"
            )
            assert platform == [KEY]
            assert agent.contexts[0].metadata["user_token"] == KEY
            # Kept nowhere: the task's history holds that one was sent, not what.
            task_id = events[0]["result"]["task"]["id"]
            task = await a2a_routes.get_a2a_agents()["accounting"].storage.load_task(
                task_id
            )
            assert task is not None and KEY not in json.dumps(task)
            assert task["history"][0]["metadata"]["datalayer"]["credential"] == (
                "withheld"
            )

    @pytest.mark.asyncio
    async def test_the_card_is_read_by_anyone(self, state: Any) -> None:
        async with served(state) as (app, _), _client(app, REMOTE) as client:
            assert (await client.get("/.well-known/agent-card.json")).status_code == 200

    def test_a_key_names_the_runtime_and_the_application(
        self, monkeypatch: Any
    ) -> None:
        monkeypatch.setenv("DATALAYER_RUNTIME_ID", "01k9runtime")
        assert apps_a2a.task_prefix("accounting") == "a2a:01k9runtime:accounting:"
        monkeypatch.delenv("DATALAYER_RUNTIME_ID")
        assert apps_a2a.task_prefix("accounting") == "a2a:local:accounting:"


class TestTheRunReachesOdooWithTheKey:
    def test_the_odoo_accounting_server_is_the_gateway_with_its_toolset(
        self, monkeypatch: Any
    ) -> None:
        from pydantic_ai.mcp import MCPToolset

        from agent_runtimes.mcp import datalayer_gateway
        from agent_runtimes.mcp.datalayer_gateway import (
            gateway_query,
            toolsets_for_the_run,
        )

        seen: dict[str, Any] = {}

        def client(headers: dict[str, str]) -> Any:
            seen["headers"] = headers
            return None

        monkeypatch.setattr(datalayer_gateway, "tracing_client", client)
        monkeypatch.delenv("DATALAYER_MCP_SERVER_URL", raising=False)
        assert gateway_query("odoo-accounting") == "only=odoo-accounting"
        assert gateway_query("datalayer") == ""
        assert gateway_query("tavily") is None
        chart = SimpleNamespace(id="chart")
        process = SimpleNamespace(id="odoo-accounting")
        toolsets = toolsets_for_the_run([chart, process], KEY)
        assert toolsets[0] is chart and process not in toolsets
        [gateway] = toolsets[1:]
        assert isinstance(gateway, MCPToolset) and gateway.id == "odoo-accounting"
        assert seen["headers"] == {"Authorization": f"Bearer {KEY}"}


class TestLoopServesIt:
    def test_loop_apps_run_a2a_asks_the_runtime_to_serve_it_at_its_ingress(
        self, monkeypatch: Any
    ) -> None:
        """`loop apps run accounting.yaml --cloud --a2a`: the card names the ingress."""
        import httpx as real_httpx

        from agent_runtimes.commands.apps import configure_on

        sent: dict[str, Any] = {}

        def post(url: str, json: Any, timeout: float) -> Any:
            sent.update(url=url, body=json)
            return real_httpx.Response(200, json={"a2a": {"url": "u"}})

        monkeypatch.setattr(real_httpx, "post", post)
        document = {"id": "accounting"}
        configure_on("http://127.0.0.1:9999", document, a2a_url="https://ingress/x")
        assert sent["url"] == "http://127.0.0.1:9999/api/v1/apps/configure"
        assert sent["body"] == {
            "app": document,
            "a2a": True,
            "public_url": "https://ingress/x",
        }
        configure_on("http://127.0.0.1:9999", document)
        assert sent["body"] == {"app": document}
