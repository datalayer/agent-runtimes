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
        #: Whether each run was a visitor's, as its tools would read it.
        self.visiting: list[bool] = []

    async def run(self, prompt: str, context: Any) -> Any:  # pragma: no cover
        raise NotImplementedError

    async def stream(self, prompt: str, context: Any) -> AsyncIterator[StreamEvent]:
        from agent_runtimes.loop.apps.visitors import in_visitor_turn

        self.contexts.append(context)
        self.visiting.append(in_visitor_turn())
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
async def served(
    state: Any, visitors: bool = False, visitors_key: str | None = None
) -> AsyncIterator[tuple[Any, Accounting]]:
    """The application's route, mounted and running, as the runtime serves it."""
    agent = Accounting()
    a2a_routes._a2a_mounts.clear()
    said = apps_a2a.serve_app_over_a2a(
        APP_CATALOGUE["accounting"],
        agent,
        URL,
        visitors=visitors,
        visitors_key=visitors_key,
    )
    assert {key: said[key] for key in ("url", "card", "task")} == {
        "url": f"{URL}/",
        "card": f"{URL}/.well-known/agent-card.json",
        "task": "a2a:local:accounting:",
    }
    assert ("visitors" in said) == visitors
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
        assert skill["inputModes"] == card["defaultInputModes"] == ["text/plain"]
        # Its answers in Markdown, and a notebook to a caller that accepts one.
        assert (
            skill["outputModes"]
            == card["defaultOutputModes"]
            == ["text/markdown", "application/x-ipynb+json"]
        )
        assert card["capabilities"]["streaming"] is True
        assert card["securitySchemes"]["datalayer"]["httpAuthSecurityScheme"][
            "scheme"
        ] == ("Bearer")
        assert card["securityRequirements"] == [{"schemes": {"datalayer": []}}]
        # Its face, for the clients that draw one; its name stays plain.
        faces = [
            extension
            for extension in card["capabilities"]["extensions"]
            if extension["uri"] == "https://datalayer.ai/extensions/face/v1"
        ]
        assert [face["params"] for face in faces] == [{"emoji": "🧾"}]
        assert card["name"] == "Accounting"

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
    async def test_each_tool_call_and_its_end_reach_the_caller_as_working_statuses(
        self, state: Any, monkeypatch: Any
    ) -> None:
        """What a page draws on the edge to Odoo: the tool, while it runs."""
        call = {"id": "c-1", "name": "odoo_accounting_list_invoices", "arguments": {}}
        ended = {**call, "result": "2 open", "error": None}

        async def stream(self: Any, prompt: str, context: Any) -> Any:
            self.contexts.append(context)
            yield StreamEvent(type="tool_call", data=call)
            yield StreamEvent(type="tool_result", data=ended)
            yield StreamEvent(type="text", data=REPORT)

        monkeypatch.setattr(Accounting, "stream", stream)
        async with served(state) as (app, _), _client(app) as client:
            response = await client.post("/", json=_stream_request("Open invoices?"))
        updates = [
            event["result"]["statusUpdate"]["status"]
            for event in _events(response.text)
            if "statusUpdate" in event["result"]
        ]
        told = [
            part["data"]
            for status in updates
            if status["state"] == "TASK_STATE_WORKING" and "message" in status
            for part in status["message"]["parts"]
            if "data" in part
        ]
        assert told == [
            {"tool_call": call},
            {
                "tool_result": {
                    "id": "c-1",
                    "name": "odoo_accounting_list_invoices",
                    "result": "2 open",
                    "error": None,
                }
            },
        ]
        assert updates[-1]["state"] == "TASK_STATE_COMPLETED"

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


#: The owner's key for visitors: granted to the route, reaching Odoo read only.
VISITORS_KEY = _token(task_grant_uid="grant-v", task_uid="a2a:local:accounting:v1")


def _visitor_token(visitor: str = "tab-ada-0001", app: str = "accounting") -> str:
    """A visitor's token, as ai-inference mints it (its audience is what is read)."""
    return jwt.encode(
        {
            "aud": "datalayer:ai-inference:anonymous",
            "sub": visitor,
            "visitor": visitor,
            "app": app,
            "exp": int(time.time()) + 300,
        },
        "ai-inferences-own-secret",
        algorithm="HS256",
    )


@pytest.fixture
def inference(monkeypatch: Any) -> list[str]:
    """ai-inference, as the verifier asks it who a visitor is."""
    asked: list[str] = []

    async def verify_visitor(token: str) -> Caller:
        asked.append(token)
        claims = jwt.decode(token, options={"verify_signature": False})
        if claims["visitor"].startswith("spent"):
            raise CallerRefused(401, "Your visitor's token has run out.")
        return Caller(kind="visitor", uid=claims["visitor"], app_uid=claims["app"])

    monkeypatch.setattr(VERIFIER, "verify_visitor", verify_visitor)
    monkeypatch.delenv(apps_a2a.VISITOR_TURNS_ENV, raising=False)
    monkeypatch.delenv(apps_a2a.VISITORS_DAY_ENV, raising=False)
    return asked


async def _ask_as(client: httpx.AsyncClient, token: str) -> httpx.Response:
    return await client.post(
        "/",
        json=_stream_request("Open invoices?"),
        headers={"Authorization": f"Bearer {token}"},
    )


class TestVisitors:
    """Open to visitors (LOOP R-30 for a route served over A2A): the landing's Sales asks Accounting."""

    @pytest.mark.asyncio
    async def test_a_visitor_is_refused_where_its_owner_did_not_open_it(
        self, state: Any, platform: list[str], inference: list[str]
    ) -> None:
        async with served(state) as (app, agent), _client(app, REMOTE) as client:
            response = await _ask_as(client, _visitor_token())
        assert response.status_code == 403
        assert "not open to visitors" in response.json()["detail"]
        # Neither IAM nor ai-inference was asked, and nothing ran.
        assert platform == [] and inference == [] and agent.contexts == []

    @pytest.mark.asyncio
    async def test_a_visitor_is_answered_and_the_run_acts_with_the_owners_key(
        self, state: Any, platform: list[str], inference: list[str]
    ) -> None:
        token = _visitor_token()
        async with (
            served(state, True, VISITORS_KEY) as (app, agent),
            _client(app, REMOTE) as client,
        ):
            response = await _ask_as(client, token)
        assert response.status_code == 200
        events = _events(response.text)
        assert events[-1]["result"]["statusUpdate"]["status"]["state"] == (
            "TASK_STATE_COMPLETED"
        )
        assert inference == [token] and platform == []
        # The owner's key for visitors, never the visitor's own token; and
        # the run is a visitor's: its tools only read.
        assert agent.contexts[0].metadata["user_token"] == VISITORS_KEY
        assert agent.visiting == [True]

    @pytest.mark.asyncio
    async def test_without_a_key_for_visitors_the_run_keeps_the_runtimes_own(
        self, state: Any, platform: list[str], inference: list[str]
    ) -> None:
        """What `agent-teams demo deploy` asks: `visitors: true`, and no key."""
        request = _stream_request("Open invoices?")
        # A visitor neither picks the identity nor unmarks the run.
        request["params"]["message"]["metadata"] = {
            "datalayer": {"credential": "somebody-elses", "visitor": ""}
        }
        async with served(state, True) as (app, agent), _client(app, REMOTE) as client:
            response = await client.post(
                "/",
                json=request,
                headers={"Authorization": f"Bearer {_visitor_token()}"},
            )
        assert response.status_code == 200
        assert "user_token" not in agent.contexts[0].metadata
        assert agent.visiting == [True]

    @pytest.mark.asyncio
    async def test_a_run_is_not_a_visitors_unless_the_gate_says_so(
        self, state: Any, platform: list[str]
    ) -> None:
        async with (
            served(state, True) as (app, agent),
            _client(app, REMOTE) as client,
            _client(app) as local,
        ):
            await client.post(
                "/",
                json=_stream_request("Open invoices?"),
                headers={"Authorization": f"Bearer {KEY}"},
            )
            # The machine itself, with no token.
            await local.post("/", json=_stream_request("Again?"))
        assert agent.visiting == [False, False]

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("token", "status", "says"),
        [
            (_visitor_token(app="sales"), 403, "another application"),
            (_visitor_token(app="at:accounting"), 403, "another application"),
            (_visitor_token("spent-tab-0003"), 401, "run out"),
        ],
    )
    async def test_a_visitors_token_for_another_application_or_spent_is_refused(
        self,
        state: Any,
        platform: list[str],
        inference: list[str],
        token: str,
        status: int,
        says: str,
    ) -> None:
        async with (
            served(state, True, VISITORS_KEY) as (app, agent),
            _client(app, REMOTE) as client,
        ):
            response = await _ask_as(client, token)
        assert response.status_code == status
        assert says in response.json()["detail"]
        assert agent.contexts == []

    @pytest.mark.asyncio
    async def test_a_visitor_has_so_many_runs_a_day(
        self, state: Any, platform: list[str], inference: list[str], monkeypatch: Any
    ) -> None:
        monkeypatch.setenv(apps_a2a.VISITOR_TURNS_ENV, "1")
        async with (
            served(state, True, VISITORS_KEY) as (app, agent),
            _client(app, REMOTE) as client,
        ):
            first = await _ask_as(client, _visitor_token())
            again = await _ask_as(client, _visitor_token())
            other = await _ask_as(client, _visitor_token("tab-bob-0002"))
            # Reading a task is not a run: it is not counted, nor refused.
            task_id = _events(first.text)[0]["result"]["task"]["id"]
            read = await client.post(
                "/",
                json={
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "GetTask",
                    "params": {"id": task_id},
                },
                headers={"Authorization": f"Bearer {_visitor_token()}"},
            )
        assert first.status_code == 200 and other.status_code == 200
        assert again.status_code == 429
        assert "1 times today without an account" in again.json()["detail"]
        assert read.status_code == 200
        assert len(agent.contexts) == 2

    @pytest.mark.asyncio
    async def test_all_visitors_together_have_a_ceiling_a_day(
        self, state: Any, platform: list[str], inference: list[str], monkeypatch: Any
    ) -> None:
        monkeypatch.setenv(apps_a2a.VISITORS_DAY_ENV, "1")
        async with (
            served(state, True, VISITORS_KEY) as (app, agent),
            _client(app, REMOTE) as client,
        ):
            first = await _ask_as(client, _visitor_token())
            other = await _ask_as(client, _visitor_token("tab-bob-0002"))
        assert first.status_code == 200
        assert other.status_code == 429
        assert "1 visitors' requests for today" in other.json()["detail"]

    @pytest.mark.asyncio
    async def test_a_key_granted_to_the_route_is_still_answered(
        self, state: Any, platform: list[str], inference: list[str]
    ) -> None:
        async with (
            served(state, True, VISITORS_KEY) as (app, agent),
            _client(app, REMOTE) as client,
        ):
            response = await _ask_as(client, KEY)
        assert response.status_code == 200
        assert agent.contexts[0].metadata["user_token"] == KEY

    @pytest.mark.parametrize(
        ("key", "says"),
        [
            ("not-a-token", "not a token"),
            (_visitor_token(), "a visitor's token"),
            (_token(), "not a key granted to a route"),
            (
                _token(task_grant_uid="g", task_uid="a2a:local:sales:k"),
                "another route",
            ),
        ],
    )
    def test_the_key_for_visitors_is_the_owners_key_granted_to_the_route(
        self, key: str, says: str, monkeypatch: Any
    ) -> None:
        monkeypatch.delenv("DATALAYER_RUNTIME_ID", raising=False)
        assert says in apps_a2a.visitors_key_problem(key, "accounting")
        with pytest.raises(ValueError, match=says):
            apps_a2a.serve_app_over_a2a(
                APP_CATALOGUE["accounting"],
                Accounting(),
                URL,
                visitors=True,
                visitors_key=key,
            )
        assert apps_a2a.visitors_key_problem(VISITORS_KEY, "accounting") == ""
        with pytest.raises(ValueError, match="open to visitors"):
            apps_a2a.serve_app_over_a2a(
                APP_CATALOGUE["accounting"],
                Accounting(),
                URL,
                visitors_key=VISITORS_KEY,
            )

    def test_configure_names_the_flag_and_the_key(self) -> None:
        """The contract with `agent-teams` 1.1.0 (`VISITORS_FIELD = "visitors"`)."""
        from agent_runtimes.routes.apps import ConfigureAppRequest

        sent = {"app": {"id": "accounting"}, "a2a": True, "public_url": "u"}
        request = ConfigureAppRequest(**sent, visitors=True)
        assert request.visitors is True and request.visitors_key is None
        assert ConfigureAppRequest(**sent).visitors is False
        keyed = ConfigureAppRequest(**sent, visitors=True, visitors_key=VISITORS_KEY)
        assert keyed.visitors_key == VISITORS_KEY


NOTEBOOK = "application/x-ipynb+json"

#: The notebook the scripted Accounting composes: the figures, then the total.
CELLS = [
    {"kind": "markdown", "source": "# Open invoices\n\nIn EUR."},
    {
        "kind": "code",
        "source": (
            "import pandas as pd\n"
            "invoices = pd.DataFrame([{'number': 'INV/2026/0007', 'due': 1200.0}])\n"
            "invoices['due'].sum()"
        ),
    },
]


def _accepting(text: str, modes: list[str] | None) -> dict[str, Any]:
    request = _stream_request(text)
    if modes is not None:
        request["params"]["configuration"]["acceptedOutputModes"] = modes
    return request


class TestTheNotebook:
    """Accounting answers Sales with a Jupyter notebook when Sales accepts one."""

    @pytest.fixture
    def composing(self, monkeypatch: Any) -> list[dict[str, Any]]:
        """Accounting, scripted to write its notebook with its tool, as its model would."""
        seen: list[dict[str, Any]] = []

        async def stream(self: Any, prompt: str, context: Any) -> Any:
            from agent_runtimes.output import formats

            self.contexts.append(context)
            call = {
                "id": "c-9",
                "name": "write_notebook",
                "arguments": {"cells": CELLS},
            }
            yield StreamEvent(type="tool_call", data=call)
            said = formats.write_notebook(
                "Open invoices", [formats.NotebookCell(**cell) for cell in CELLS]
            )
            seen.append({"prompt": prompt, "said": said})
            yield StreamEvent(
                type="tool_result", data={**call, "result": said, "error": None}
            )
            yield StreamEvent(type="text", data=REPORT)

        monkeypatch.setattr(Accounting, "stream", stream)
        return seen

    @staticmethod
    def _results(body: str) -> list[dict[str, Any]]:
        return [event["result"] for event in _events(body)]

    @pytest.mark.asyncio
    async def test_a_caller_that_accepts_one_gets_it_as_an_artifact_beside_the_text(
        self, state: Any, composing: list[dict[str, Any]]
    ) -> None:
        async with served(state) as (app, _), _client(app) as client:
            response = await client.post(
                "/", json=_accepting("Open invoices?", [NOTEBOOK, "text/markdown"])
            )
        results = self._results(response.text)
        artifacts = [
            r["artifactUpdate"]["artifact"] for r in results if "artifactUpdate" in r
        ]
        notebooks = [
            part
            for artifact in artifacts
            for part in artifact["parts"]
            if part.get("mediaType") == NOTEBOOK
        ]
        [part] = notebooks
        assert part["filename"] == "open-invoices.ipynb"
        notebook = part["data"]
        import nbformat

        nbformat.validate(nbformat.from_dict(notebook))
        # Written as Jupyter writes it, each source a list of lines.
        assert ["".join(cell["source"]) for cell in notebook["cells"]] == [
            cell["source"] for cell in CELLS
        ]
        # The text is still the answer.
        texts = [a for a in artifacts if a["parts"] == [{"text": REPORT}]]
        assert texts
        states = [
            r["statusUpdate"]["status"]["state"] for r in results if "statusUpdate" in r
        ]
        assert states[-1] == "TASK_STATE_COMPLETED"
        # Its agent was told it may write one.
        [run] = composing
        assert "write_notebook" in run["prompt"]
        assert run["said"].startswith("Notebook written")

    @pytest.mark.asyncio
    async def test_while_it_writes_the_caller_reads_it_in_words(
        self, state: Any, composing: list[dict[str, Any]]
    ) -> None:
        async with served(state) as (app, _), _client(app) as client:
            response = await client.post(
                "/", json=_accepting("Open invoices?", [NOTEBOOK])
            )
        told = [
            part["data"]
            for r in self._results(response.text)
            if "statusUpdate" in r
            and r["statusUpdate"]["status"]["state"] == "TASK_STATE_WORKING"
            and "message" in r["statusUpdate"]["status"]
            for part in r["statusUpdate"]["status"]["message"]["parts"]
            if "data" in part
        ]
        assert told[0]["tool_call"]["note"] == "Writing a notebook…"
        # The cells travel once, in the artifact, not in the status.
        assert told[0]["tool_call"]["arguments"] == {}
        assert told[1]["tool_result"]["note"] == "Notebook written"

    @pytest.mark.parametrize("modes", [None, ["text/markdown"], ["text/plain"]])
    @pytest.mark.asyncio
    async def test_a_caller_that_does_not_accept_one_gets_words_only(
        self, state: Any, composing: list[dict[str, Any]], modes: list[str] | None
    ) -> None:
        async with served(state) as (app, _), _client(app) as client:
            response = await client.post("/", json=_accepting("Open invoices?", modes))
        parts = [
            part
            for r in self._results(response.text)
            if "artifactUpdate" in r
            for part in r["artifactUpdate"]["artifact"]["parts"]
        ]
        assert all(part.get("mediaType") != NOTEBOOK for part in parts)
        [run] = composing
        assert "write_notebook" not in run["prompt"]
        assert "does not accept a notebook" in run["said"]

    @pytest.mark.asyncio
    async def test_a_visitor_gets_one_too_since_it_only_reads(
        self, state: Any, composing: list[dict[str, Any]], inference: list[str]
    ) -> None:
        async with (
            served(state, visitors=True) as (app, agent),
            _client(app, REMOTE) as client,
        ):
            request = _accepting("Open invoices?", [NOTEBOOK])
            response = await client.post(
                "/",
                json=request,
                headers={"Authorization": f"Bearer {_visitor_token()}"},
            )
        assert response.status_code == 200
        parts = [
            part
            for r in self._results(response.text)
            if "artifactUpdate" in r
            for part in r["artifactUpdate"]["artifact"]["parts"]
        ]
        assert any(part.get("mediaType") == NOTEBOOK for part in parts)
