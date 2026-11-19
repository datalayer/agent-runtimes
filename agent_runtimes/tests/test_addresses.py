# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Every agent at its addresses.

The call contract, who may call, the API, the MCP server, the web page and its
gallery, poppy.json and the agent host (the user, 16 November 2026).
"""

from __future__ import annotations

import json
import socket
import threading
from contextlib import asynccontextmanager, closing
from typing import Any, Dict, List

import httpx
import pytest
import uvicorn
from agentspecs.openapi import openapi_operations
from fastapi.testclient import TestClient
from personal_agent_protocol.models import DiscoveryDocument
from pydantic_ai import Agent
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route

from agent_runtimes.addresses.access import (
    AddressAccess,
    AddressPolicy,
    policy_from_environment,
    policy_of_deployment,
)
from agent_runtimes.addresses.addressed import AddressedAgent
from agent_runtimes.addresses.agent_host import AgentHost
from agent_runtimes.addresses.api import api_app
from agent_runtimes.addresses.hosts import AddressHosts
from agent_runtimes.addresses.operations import (
    OperationAgent,
    OperationError,
    call_operation,
    operation_prompt,
)
from agent_runtimes.addresses.poppy import AGENT_EXTENSION, poppy_document
from agent_runtimes.addresses.web import VIEW_ID, agent_view, web_app
from agent_runtimes.apps.loading import load_app

OPENAPI: Dict[str, Any] = {
    "openapi": "3.1.0",
    "info": {"title": "Shop", "version": "1"},
    "paths": {
        "/products/{product_id}": {
            "get": {
                "operationId": "getProduct",
                "summary": "One product",
                "description": "Answer the product with its title and price.",
                "parameters": [
                    {
                        "name": "product_id",
                        "in": "path",
                        "required": True,
                        "schema": {"type": "integer"},
                    },
                    {"name": "currency", "in": "query", "schema": {"type": "string"}},
                ],
                "responses": {
                    "200": {
                        "description": "The product",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "title": {"type": "string"},
                                        "price": {"type": "number"},
                                    },
                                    "required": ["title", "price"],
                                }
                            }
                        },
                    }
                },
            }
        },
        "/quote": {
            "post": {
                "operationId": "quote",
                "summary": "The total of a basket",
                "requestBody": {
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "items": {
                                        "type": "array",
                                        "items": {"type": "integer"},
                                    }
                                },
                                "required": ["items"],
                            }
                        }
                    }
                },
                "responses": {
                    "200": {
                        "description": "The total",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {"total": {"type": "number"}},
                                    "required": ["total"],
                                }
                            }
                        },
                    }
                },
            }
        },
    },
}

APP = {
    "id": "shop",
    "name": "Shop",
    "kind": "chat",
    "description": "Sells things.",
    "agent": "worker-shopper",
    "openapi": OPENAPI,
}

COMPANY = {
    **APP,
    "protocols": ["pap"],
    "pap": {
        "profile": "draft-01",
        "company": {
            "enabled": True,
            "interfaces": ["agent", "openapi", "mcp"],
            "scopes": [{"name": "orders:read", "description": "Read your orders"}],
        },
    },
}


class Answers:
    """A model answering each call with the next of ``answers``, as the output tool's args."""

    def __init__(self, *answers: Any) -> None:
        self.answers = list(answers)
        self.prompts: List[str] = []

    def __call__(self, messages: List[ModelMessage], info: AgentInfo) -> ModelResponse:
        self.prompts.append(
            "\n".join(
                str(getattr(part, "content", ""))
                for message in messages
                for part in getattr(message, "parts", [])
            )
        )
        answer = self.answers.pop(0)
        if not info.output_tools:
            return ModelResponse(parts=[TextPart(json.dumps(answer))])
        return ModelResponse(
            parts=[ToolCallPart(tool_name=info.output_tools[0].name, args=answer)]
        )


def agent_of(model: Answers) -> OperationAgent:
    return OperationAgent(agent=Agent(FunctionModel(model)))


def addressed(
    model: Answers,
    spec: Dict[str, Any] = APP,
    policy: AddressPolicy | None = None,
    name: str | None = "shop",
    **access: Any,
) -> AddressedAgent:
    async def source() -> OperationAgent:
        return agent_of(model)

    app = load_app(spec)
    return AddressedAgent(
        app=app,
        access=AddressAccess(policy or AddressPolicy("public"), **access),
        agent_source=source,
        hosts=AddressHosts.of(name, "datalayer.ai") if name else None,
        role="company" if app.pap.company.enabled else "app",
    )


# --- the call contract -----------------------------------------------------------------


@pytest.mark.asyncio
async def test_an_operation_is_answered_with_structured_output_bound_to_its_schema() -> (
    None
):
    [_, quote] = openapi_operations(OPENAPI)
    model = Answers({"total": 12.5})
    answer = await call_operation(agent_of(model), quote, {"items": [1, 2]})
    assert answer == {"total": 12.5}
    # Told the operation's instruction, its inputs as JSON, and the JSON it answers.
    prompt = operation_prompt(quote, {"items": [1, 2]})
    assert (
        "The total of a basket" in prompt
        and '"items": [' in prompt
        and '"total"' in prompt
    )
    assert "The total of a basket" in model.prompts[0]


@pytest.mark.asyncio
async def test_an_answer_that_does_not_fit_is_asked_once_more_then_refused() -> None:
    [_, quote] = openapi_operations(OPENAPI)
    model = Answers({"sum": 1}, {"total": 3})
    assert await call_operation(agent_of(model), quote, {"items": [1]}) == {"total": 3}
    assert "did not fit the schema" in model.prompts[1]
    with pytest.raises(OperationError) as refused:
        await call_operation(
            agent_of(Answers({"sum": 1}, {"sum": 2})), quote, {"items": [1]}
        )
    assert refused.value.status == 422
    assert any(
        "'total' is a required property" in error for error in refused.value.errors
    )


@pytest.mark.asyncio
async def test_inputs_that_are_not_the_operations_are_400() -> None:
    [_, quote] = openapi_operations(OPENAPI)
    with pytest.raises(OperationError) as refused:
        await call_operation(agent_of(Answers()), quote, {"items": "all", "extra": 1})
    assert refused.value.status == 400
    assert refused.value.errors


@pytest.mark.asyncio
async def test_an_agent_without_openapi_answers_ask() -> None:
    spec = {key: value for key, value in APP.items() if key != "openapi"}
    agent = addressed(Answers({"answer": "Hello"}), spec)
    assert [operation.operation_id for operation in agent.operations] == ["ask"]
    assert await agent.call("ask", {"question": "Hi?"}) == {"answer": "Hello"}
    with pytest.raises(OperationError) as unknown:
        await agent.call("quote", {})
    assert unknown.value.status == 404


# --- who may call ----------------------------------------------------------------------


async def _uid_of(credential: str) -> str | None:
    return {"key-owner": "owner", "key-friend": "friend", "key-other": "other"}.get(
        credential
    )


@pytest.mark.asyncio
async def test_a_public_agent_is_called_by_anyone_under_a_rate_cap() -> None:
    access = AddressAccess(AddressPolicy("public", rate_per_minute=2))
    one = await access.admit({"x-forwarded-for": "203.0.113.9, 10.0.0.1"}, "10.0.0.1")
    assert (one.kind, one.address) == ("anonymous", "203.0.113.9")
    await access.admit({"x-forwarded-for": "203.0.113.9"})
    with pytest.raises(OperationError) as capped:
        await access.admit({"x-forwarded-for": "203.0.113.9"})
    assert capped.value.status == 429
    # Another caller has a cap of its own.
    await access.admit({"x-forwarded-for": "198.51.100.1"})


@pytest.mark.asyncio
async def test_a_private_agent_is_called_by_its_owner_and_those_allowed_alone() -> None:
    access = AddressAccess(
        AddressPolicy("private", owner_uid="owner", allowed=frozenset({"friend"})),
        key_checker=_uid_of,
        token_checker=_uid_of,
    )
    with pytest.raises(OperationError) as anonymous:
        await access.admit({})
    assert anonymous.value.status == 401
    assert (await access.admit({"X-API-Key": "key-owner"})).uid == "owner"
    assert (await access.admit({"Authorization": "Bearer key-friend"})).kind == "token"
    with pytest.raises(OperationError) as other:
        await access.admit({"x-api-key": "key-other"})
    assert other.value.status == 403
    with pytest.raises(OperationError) as unknown:
        await access.admit({"x-api-key": "nobody"})
    assert unknown.value.status == 401


def test_the_policy_is_the_deployments_or_the_configurations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    policy = policy_of_deployment(
        {
            "visibility": "private",
            "owner": {"uid": "o"},
            "allowed": [{"uid": "a", "handle": "ann"}],
        }
    )
    assert (policy.visibility, policy.owner_uid, policy.allowed) == (
        "private",
        "o",
        frozenset({"a"}),
    )
    monkeypatch.delenv("AGENT_RUNTIMES_ADDRESS_VISIBILITY", raising=False)
    assert policy_from_environment().visibility == "private"
    monkeypatch.setenv("AGENT_RUNTIMES_ADDRESS_VISIBILITY", "public")
    assert policy_from_environment().visibility == "public"
    with pytest.raises(ValueError, match="who may open it"):
        AddressPolicy("everyone")  # type: ignore[arg-type]


# --- the REST API ----------------------------------------------------------------------


def test_the_api_answers_each_operation_at_its_path_and_method() -> None:
    model = Answers({"title": "Lamp", "price": 20}, {"total": 3})
    client = TestClient(api_app(addressed(model)))
    product = client.get("/products/7?currency=EUR")
    assert product.status_code == 200, product.text
    assert product.json() == {"title": "Lamp", "price": 20}
    # The path parameter typed as its schema says, the query given.
    assert (
        '"product_id": 7' in model.prompts[0]
        and '"currency": "EUR"' in model.prompts[0]
    )
    assert client.post("/quote", json={"items": [1, 2]}).json() == {"total": 3}
    bad = client.post("/quote", json={"items": "x"})
    assert bad.status_code == 400 and bad.json()["errors"]


def test_the_api_serves_the_agents_own_openapi_and_its_reference() -> None:
    client = TestClient(api_app(addressed(Answers())))
    document = client.get("/openapi.json").json()
    assert document["paths"] == OPENAPI["paths"]
    assert document["servers"] == [{"url": "https://shop.api.datalayer.ai"}]
    assert "swagger" in client.get("/docs").text.lower()


def test_a_private_apis_operations_need_a_key_of_somebody_allowed() -> None:
    agent = addressed(
        Answers({"total": 1}),
        policy=AddressPolicy("private", owner_uid="owner"),
        key_checker=_uid_of,
    )
    client = TestClient(api_app(agent))
    refused = client.post("/quote", json={"items": [1]})
    assert refused.status_code == 401
    assert "API key" in refused.json()["detail"]
    assert (
        client.post(
            "/quote", json={"items": [1]}, headers={"X-API-Key": "key-other"}
        ).status_code
        == 403
    )
    assert client.post(
        "/quote", json={"items": [1]}, headers={"X-API-Key": "key-owner"}
    ).json() == {"total": 1}


# --- the MCP server --------------------------------------------------------------------


def _free_port() -> int:
    with closing(socket.socket()) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


@asynccontextmanager
async def served(app: Any):
    port = _free_port()
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error")
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(200):
        if server.started:
            break
        threading.Event().wait(0.05)
    assert server.started
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        thread.join(timeout=10)


@asynccontextmanager
async def connected(url: str, headers: Dict[str, str] | None = None):
    import httpx2
    from mcp.client.streamable_http import streamable_http_client

    from mcp import ClientSession

    async with httpx2.AsyncClient(headers=headers or {}) as http_client:
        async with streamable_http_client(url, http_client=http_client) as (
            read,
            write,
            *_,
        ):
            async with ClientSession(read, write) as session:
                await session.initialize()
                yield session


@pytest.mark.asyncio
async def test_the_mcp_server_lists_one_tool_per_operation_and_answers_a_call() -> None:
    from agent_runtimes.addresses.mcp import mcp_app

    async with served(mcp_app(addressed(Answers({"total": 9})))) as url:
        async with connected(f"{url}/mcp") as session:
            tools = {tool.name: tool for tool in (await session.list_tools()).tools}
            assert set(tools) == {"getProduct", "quote"}
            assert tools["quote"].input_schema["required"] == ["items"]
            assert tools["quote"].output_schema["required"] == ["total"]
            assert "The total of a basket" in (tools["quote"].description or "")
            answer = await session.call_tool("quote", {"items": [4, 5]})
            assert not answer.is_error, answer
            assert answer.structured_content == {"total": 9}


@pytest.mark.asyncio
async def test_a_private_mcp_server_refuses_a_caller_without_a_key() -> None:
    from agent_runtimes.addresses.mcp import mcp_app

    agent = addressed(
        Answers({"total": 2}),
        policy=AddressPolicy("private", owner_uid="owner"),
        key_checker=_uid_of,
    )
    async with served(mcp_app(agent)) as url:
        async with httpx.AsyncClient() as client:
            refused = await client.post(
                f"{url}/mcp",
                json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
                headers={"accept": "application/json, text/event-stream"},
            )
        assert refused.status_code == 401
        async with connected(f"{url}/mcp", {"X-API-Key": "key-owner"}) as session:
            answer = await session.call_tool("quote", {"items": [1]})
            assert answer.structured_content == {"total": 2}


# --- poppy.json ------------------------------------------------------------------------


def test_a_company_apps_poppy_json_is_the_sdks_company_document() -> None:
    document = poppy_document(addressed(Answers(), COMPANY))
    parsed = DiscoveryDocument.model_validate(document)
    assert parsed.organization.domain == "shop.agent.datalayer.ai"
    assert parsed.auth is not None and "orders:read" in parsed.auth.scopes
    assert parsed.agent is not None
    assert parsed.agent.protocols[0].endpoint.startswith(
        "https://shop.agent.datalayer.ai/"
    )
    # What its agent can help with (PAP 1.0 §3.1): the Appspec's description.
    assert parsed.agent.protocols[0].description == COMPANY["description"]
    assert {(api.type, api.url) for api in parsed.apis} == {
        ("openapi", "https://shop.api.datalayer.ai/openapi.json"),
        ("mcp", "https://shop.mcp.datalayer.ai/mcp"),
    }
    assert AGENT_EXTENSION not in parsed.extensions


def test_a_personal_agents_poppy_json_says_whom_it_acts_for() -> None:
    spec = {key: value for key, value in APP.items() if key != "openapi"}
    agent = addressed(
        Answers(),
        spec,
        policy=AddressPolicy("private", owner_uid="01HXK3V9Q8M2C4R7T5W6Y8Z0AB"),
        name="marketer-01hxk3v9q8m2c4r7t5w6y8z0ab",
    )
    agent.role, agent.acts_for = "personal", "01HXK3V9Q8M2C4R7T5W6Y8Z0AB"
    document = poppy_document(agent)
    parsed = DiscoveryDocument.model_validate(document)
    assert (
        parsed.organization.domain
        == "marketer-01hxk3v9q8m2c4r7t5w6y8z0ab.agent.datalayer.ai"
    )
    assert parsed.agent is not None and parsed.agent.protocols[0].type == "a2a"
    assert parsed.agent.protocols[0].description == spec["description"]
    [entry] = document["extensions"][AGENT_EXTENSION]
    assert (
        entry["role"] == "personal"
        and entry["acts_for"] == "01HXK3V9Q8M2C4R7T5W6Y8Z0AB"
    )
    assert (
        entry["access"] == "private"
        and entry["web"]
        == "https://marketer-01hxk3v9q8m2c4r7t5w6y8z0ab.web.datalayer.ai"
    )
    assert parsed.auth is None


def test_an_agent_that_says_nothing_helps_with_anything_about_it() -> None:
    spec = {**COMPANY, "description": ""}
    parsed = DiscoveryDocument.model_validate(
        poppy_document(addressed(Answers(), spec))
    )
    assert parsed.agent is not None
    assert parsed.agent.protocols[0].description == f"Anything about {spec['name']}"


def test_a_company_without_scopes_has_no_poppy_json_that_lies() -> None:
    spec = {**COMPANY, "pap": {"profile": "draft-01", "company": {"enabled": True}}}
    with pytest.raises(ValueError, match="at least one scope"):
        poppy_document(addressed(Answers(), spec))


# --- the web page ----------------------------------------------------------------------


def test_the_web_page_shows_the_agent_and_serves_poppy_json_to_anybody() -> None:
    agent = addressed(
        Answers(),
        COMPANY,
        policy=AddressPolicy("private", owner_uid="owner"),
        key_checker=_uid_of,
    )
    view = agent_view(agent)
    assert view["role"] == "company" and view["visibility"] == "private"
    assert [operation["operation_id"] for operation in view["operations"]] == [
        "getProduct",
        "quote",
    ]
    assert view["addresses"]["mcp"]["url"] == "https://shop.mcp.datalayer.ai/mcp"
    client = TestClient(web_app(agent))
    assert client.get("/").status_code == 401
    page = client.get("/", headers={"X-API-Key": "key-owner"})
    assert page.status_code == 200 and VIEW_ID in page.text
    assert (
        client.get("/api/agent", headers={"X-API-Key": "key-owner"}).json()["name"]
        == "Shop"
    )
    poppy = client.get("/.well-known/poppy.json")
    assert poppy.status_code == 200
    assert poppy.json()["organization"]["domain"] == "shop.agent.datalayer.ai"


def test_the_web_page_s_bundle_answers_at_the_path_the_page_asks_for(
    tmp_path: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The bundle is built for `/static/` (vite's base): the page asks for
    # `/static/assets/…`, served to anybody, even for a private agent.
    from agent_runtimes.addresses import web

    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "agent-web-x.js").write_text("export {};")
    (tmp_path / web.PAGE).write_text(
        '<html><head></head><body><script src="/static/assets/agent-web-x.js"></script></body></html>'
    )
    monkeypatch.setattr(web, "_dist", lambda: tmp_path)
    agent = addressed(
        Answers(),
        COMPANY,
        policy=AddressPolicy("private", owner_uid="owner"),
        key_checker=_uid_of,
    )
    client = TestClient(web_app(agent))
    page = client.get("/", headers={"X-API-Key": "key-owner"})
    assert "/static/assets/agent-web-x.js" in page.text
    asset = client.get("/static/assets/agent-web-x.js")
    assert asset.status_code == 200 and asset.text == "export {};"


def _with_gallery(spec: Dict[str, Any]) -> Dict[str, Any]:
    """``spec`` with a ``listProducts`` that feeds its web page's gallery."""
    document = json.loads(json.dumps(spec["openapi"]))
    document["paths"]["/products"] = {
        "get": {
            "operationId": "listProducts",
            "summary": "The products",
            "x-datalayer-gallery": {"title": "Our lamps"},
            "responses": {
                "200": {
                    "description": "The products",
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "products": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "title": {"type": "string"},
                                                "image": {"type": "string"},
                                                "price": {"type": "number"},
                                            },
                                        },
                                    }
                                },
                                "required": ["products"],
                            }
                        }
                    },
                }
            },
        }
    }
    return {**spec, "openapi": document}


LAMPS = {
    "products": [
        {"title": "Lamp", "image": "https://images.datalayer.io/lamp.jpg", "price": 9.5}
    ]
}


def test_the_web_page_shows_the_gallery_its_openapi_names_read_once_and_kept() -> None:
    """The gallery operation's answer is the page's, called with no input and kept."""
    model = Answers(LAMPS, LAMPS)
    agent = addressed(model, _with_gallery(COMPANY))
    assert agent_view(agent)["gallery"] == {
        "operation_id": "listProducts",
        "title": "Our lamps",
    }
    client = TestClient(web_app(agent))
    first = client.get("/api/gallery")
    assert first.status_code == 200 and first.json() == LAMPS
    # Called with no input, the operation's instruction told.
    assert "The products" in model.prompts[0]
    assert "The inputs, as JSON:\n{}" in model.prompts[0]
    # Kept: a second page asks no model.
    assert client.get("/api/gallery").json() == LAMPS
    assert len(model.prompts) == 1


@pytest.mark.asyncio
async def test_a_gallery_is_called_again_once_it_is_old_and_a_failed_call_is_not_kept() -> (
    None
):
    """An answer older than its time is asked again; a failed call is not kept."""
    from agent_runtimes.addresses.web import Gallery

    now = [0.0]
    model = Answers(LAMPS, {"products": []})
    agent = addressed(model, _with_gallery(APP))
    gallery = Gallery(agent, "listProducts", seconds=600, clock=lambda: now[0])
    assert await gallery.answer(None) == LAMPS
    now[0] = 599
    assert await gallery.answer(None) == LAMPS
    now[0] = 601
    assert await gallery.answer(None) == {"products": []}
    failing = Gallery(
        addressed(Answers({"wrong": 1}, {"wrong": 2}), _with_gallery(APP)),
        "listProducts",
    )
    with pytest.raises(OperationError):
        await failing.answer(None)
    assert failing._at is None


def test_a_gallery_answers_only_who_may_open_the_page_under_their_rate_cap() -> None:
    """The gallery is behind the page's access check, each read counted."""
    private = addressed(
        Answers(LAMPS),
        _with_gallery(COMPANY),
        policy=AddressPolicy("private", owner_uid="owner", rate_per_minute=2),
        key_checker=_uid_of,
    )
    client = TestClient(web_app(private))
    assert client.get("/api/gallery").status_code == 401
    assert (
        client.get("/api/gallery", headers={"X-API-Key": "key-other"}).status_code
        == 403
    )
    owner = {"X-API-Key": "key-owner"}
    assert client.get("/api/gallery", headers=owner).json() == LAMPS
    assert client.get("/api/gallery", headers=owner).status_code == 200
    assert client.get("/api/gallery", headers=owner).status_code == 429


def test_a_page_without_a_gallery_says_so() -> None:
    """No gallery in its openapi: none in the view, 404 at the gallery."""
    agent = addressed(Answers(), COMPANY)
    assert agent_view(agent)["gallery"] is None
    answered = TestClient(web_app(agent)).get("/api/gallery")
    assert (
        answered.status_code == 404 and "shows no gallery" in answered.json()["detail"]
    )


# --- the agent host --------------------------------------------------------------------


def _main_server() -> Any:
    async def echo(request: Any) -> JSONResponse:
        return JSONResponse(
            {"path": request.url.path, "host": request.headers.get("host")}
        )

    return Starlette(routes=[Route("/{rest:path}", echo, methods=["GET", "POST"])])


def test_the_agent_host_answers_poppy_a2a_and_the_chat_and_leaves_other_hosts_alone() -> (
    None
):
    agent = addressed(Answers())
    client = TestClient(AgentHost(_main_server(), agent, "shop-agent"))
    on_host = {"host": "shop.agent.datalayer.ai"}
    poppy = client.get("/.well-known/poppy.json", headers=on_host).json()
    assert (
        poppy["agent"]["protocols"][0]["endpoint"]
        == "https://shop.agent.datalayer.ai/a2a"
    )
    routed = client.post("/a2a/", headers=on_host, json={}).json()
    assert routed["path"] == "/api/v1/a2a/agents/shop-agent/"
    chat = client.get("/", headers=on_host, follow_redirects=False)
    assert chat.status_code == 303
    assert chat.headers["location"] == "/static/agent.html?agentId=shop-agent"
    # The card waits for the agent to answer over A2A.
    assert (
        client.get("/.well-known/agent-card.json", headers=on_host).status_code == 503
    )
    # Another host is the main server's.
    assert (
        client.get("/a2a/", headers={"host": "runtime.local"}).json()["path"] == "/a2a/"
    )


def test_a_company_agent_host_hands_pap_to_its_company() -> None:
    seen: List[str] = []

    class Company:
        def asgi(self) -> Any:
            async def app(scope: dict, receive: Any, send: Any) -> None:
                seen.append(scope["path"])
                await JSONResponse({"pap": True})(scope, receive, send)

            return app

    agent = addressed(Answers(), COMPANY)
    client = TestClient(AgentHost(_main_server(), agent, "shop-agent", Company()))
    on_host = {"host": "shop.agent.datalayer.ai"}
    assert client.post("/oauth/device", headers=on_host).json() == {"pap": True}
    assert client.get("/poppy/tasks", headers=on_host).json() == {"pap": True}
    assert seen == ["/oauth/device", "/poppy/tasks"]
    with pytest.raises(ValueError, match="serves its PAP company"):
        AgentHost(_main_server(), agent, "shop-agent")


# --- the command -----------------------------------------------------------------------


def test_serve_mode_needs_an_application() -> None:
    from typer.testing import CliRunner

    from agent_runtimes.__main__ import app

    result = CliRunner().invoke(app, ["serve", "--mode", "mcp"])
    assert result.exit_code == 1
    result = CliRunner().invoke(app, ["serve", "--mode", "nope", "--app", "x"])
    assert result.exit_code == 1


# --- in a runtime ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_an_address_answers_503_until_the_runtimes_agent_is_made() -> None:
    from agent_runtimes.addresses.servers import _Slot, mode_app

    slot = _Slot("api")
    transport = httpx.ASGITransport(app=slot)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        waiting = await client.get("/openapi.json")
        assert waiting.status_code == 503 and "(api)" in waiting.json()["detail"]
        await slot.fill(mode_app(addressed(Answers()), "api"))
        assert (await client.get("/openapi.json")).json()["paths"] == OPENAPI["paths"]
    await slot.empty()


@pytest.mark.asyncio
async def test_a_runtimes_own_agent_is_a_persons_at_its_addresses(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.addresses.servers import addressed_in_runtime

    monkeypatch.setenv(
        "AGENT_RUNTIMES_ADDRESS_NAME", "marketer-01hxk3v9q8m2c4r7t5w6y8z0ab"
    )
    monkeypatch.setenv("AGENT_RUNTIMES_ADDRESS_ACTS_FOR", "01HXK3V9Q8M2C4R7T5W6Y8Z0AB")
    monkeypatch.setenv("AGENT_RUNTIMES_ADDRESS_OWNER", "01HXK3V9Q8M2C4R7T5W6Y8Z0AB")
    monkeypatch.delenv("AGENT_RUNTIMES_ADDRESS_VISIBILITY", raising=False)
    agent = await addressed_in_runtime(
        "marketer",
        agent_spec_id="worker-marketer",
        name="Marketer",
        description="Posts for you.",
    )
    assert (agent.role, agent.acts_for, agent.access.policy.visibility) == (
        "personal",
        "01HXK3V9Q8M2C4R7T5W6Y8Z0AB",
        "private",
    )
    assert (
        agent.hosts is not None
        and agent.hosts.web
        == "https://marketer-01hxk3v9q8m2c4r7t5w6y8z0ab.web.datalayer.ai"
    )
    assert [operation.operation_id for operation in agent.operations] == ["ask"]
    assert (
        poppy_document(agent)["extensions"][AGENT_EXTENSION][0]["acts_for"]
        == "01HXK3V9Q8M2C4R7T5W6Y8Z0AB"
    )


def test_the_main_server_is_untouched_until_an_agent_answers_at_its_host() -> None:
    from agent_runtimes.addresses.servers import AgentHostMiddleware

    client = TestClient(AgentHostMiddleware(_main_server()))
    answer = client.get(
        "/.well-known/poppy.json", headers={"host": "shop.agent.datalayer.ai"}
    )
    assert answer.json()["path"] == "/.well-known/poppy.json"


# --- a runtime's name, its calls, its company's store, a browser's sign-in --------------


def test_a_runtime_takes_its_name_once(monkeypatch: pytest.MonkeyPatch) -> None:
    from agent_runtimes.addresses import servers
    from agent_runtimes.addresses.access import OWNER_VARIABLE

    for variable in (servers.NAME_VARIABLE, servers.ACTS_FOR_VARIABLE, OWNER_VARIABLE):
        monkeypatch.delenv(variable, raising=False)
    servers.take_address(
        "marketer-01hxk3v9q8m2c4r7t5w6y8z0ab",
        acts_for="01HXK3V9Q8M2C4R7T5W6Y8Z0AB",
        owner_uid="01HXK3V9Q8M2C4R7T5W6Y8Z0AB",
    )
    import os

    assert os.environ[servers.NAME_VARIABLE] == "marketer-01hxk3v9q8m2c4r7t5w6y8z0ab"
    assert os.environ[servers.ACTS_FOR_VARIABLE] == "01HXK3V9Q8M2C4R7T5W6Y8Z0AB"
    assert os.environ[OWNER_VARIABLE] == "01HXK3V9Q8M2C4R7T5W6Y8Z0AB"
    # Said again, the same: nothing changes; another name is refused.
    servers.take_address("marketer-01hxk3v9q8m2c4r7t5w6y8z0ab")
    with pytest.raises(
        ValueError, match="answers at marketer-01hxk3v9q8m2c4r7t5w6y8z0ab already"
    ):
        servers.take_address("shopper-01hxk3v9q8m2c4r7t5w6y8z0ab")
    with pytest.raises(ValueError, match="is not an address"):
        servers.take_address("Not An Address")


@pytest.mark.asyncio
async def test_each_call_is_recorded_with_who_made_it_by_which_address() -> None:
    from agent_runtimes.addresses.calls import CallRecorder

    sent: List[List[dict]] = []

    async def send(calls: List[dict]) -> None:
        sent.append(calls)

    agent = addressed(Answers({"total": 3.0}))
    agent.calls = CallRecorder(send, every=3600)
    caller = await agent.access.admit({"x-forwarded-for": "203.0.113.9"})
    assert await agent.call(
        "quote", {"items": [1, 2]}, interface="mcp", caller=caller
    ) == {"total": 3.0}
    with pytest.raises(OperationError):
        await agent.call("quote", {"items": "none"}, interface="api")
    await agent.calls.flush()
    calls = [call for batch in sent for call in batch]
    assert [(c["interface"], c["operation"], c["status"]) for c in calls] == [
        ("mcp", "quote", 200),
        ("api", "quote", 400),
    ]
    assert calls[0]["caller"] == "anonymous" and calls[0]["person"] == ""
    assert all("items" not in json.dumps(call) for call in calls)


@pytest.mark.asyncio
async def test_a_recorder_that_cannot_send_never_holds_a_call_up() -> None:
    from agent_runtimes.addresses.calls import CallRecord, CallRecorder

    async def refused(calls: List[dict]) -> None:
        raise RuntimeError("ai-agents answered 503")

    recorder = CallRecorder(refused, every=3600)
    recorder.record(CallRecord("api", "quote", "anonymous", "", 200, 5))
    await recorder.flush()
    assert recorder.pending == []


@pytest.mark.asyncio
async def test_the_companys_store_is_kept_through_ai_agents_with_the_runtimes_proof(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from datetime import datetime, timezone

    from agent_runtimes.addresses.company_store import (
        DatalayerCompanyStore,
        DatalayerReplayCache,
        StoreUnavailable,
    )
    from agent_runtimes.apps import principal

    asked: List[tuple[str, dict, str]] = []

    def answer(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        asked.append(
            (
                request.url.path,
                body,
                request.headers.get(principal.RUNTIME_PROOF_HEADER, ""),
            )
        )
        operation = request.url.path.rsplit("/", 1)[-1]
        if operation == "get":
            return httpx.Response(404, json={})
        if operation in ("create", "replace"):
            return httpx.Response(200, json={"written": True})
        if operation == "records":
            return httpx.Response(
                200,
                json={
                    "records": [{"value": {"a": 1}, "version": "7", "expires_at": None}]
                },
            )
        return httpx.Response(200, json={})

    async def with_proof(deployment: str, url: str, ask: Any) -> Any:
        return await ask({principal.RUNTIME_PROOF_HEADER: "proof"})

    monkeypatch.setattr(principal, "launched_for", lambda: "dep-1")
    monkeypatch.setattr(principal, "_asked_with_proof", with_proof)
    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", "https://r1.example")
    client = httpx.AsyncClient(transport=httpx.MockTransport(answer))
    store = DatalayerCompanyStore("shop", http=client)
    assert await store.get("session", "s1") is None
    later = datetime(2030, 1, 1, tzinfo=timezone.utc)
    assert await DatalayerReplayCache(store).mark_once("jti", expires_at=later)
    records = await store.records("session")
    assert (records[0].value, records[0].version) == ({"a": 1}, "7")
    assert asked[0][0] == "/api/ai-agents/v1/apps/internal/addresses/shop/store/get"
    assert asked[1][1] == {
        "kind": "replay",
        "key": "jti",
        "value": {"seen": True},
        "expires_at": later.isoformat(),
    }
    assert {proof for _, _, proof in asked} == {"proof"}

    def refused(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"detail": "not yours"})

    with pytest.raises(StoreUnavailable):
        await DatalayerCompanyStore(
            "shop", http=httpx.AsyncClient(transport=httpx.MockTransport(refused))
        ).put("session", "s1", {"a": 1})


@pytest.mark.asyncio
async def test_a_pap_operation_is_performed_through_the_call_contract() -> None:
    from personal_agent_protocol.company import OperationFailed

    from agent_runtimes.pap.company import (
        OpenApiOperationExecutor,
        openapi_operation_of,
    )

    document = json.loads(json.dumps(OPENAPI))
    document["paths"]["/quote"]["post"]["x-pap"] = {
        "action": "quote_basket",
        "tool": "quote",
        "summary": "Quote {items}",
    }
    company = json.loads(json.dumps(COMPANY))
    company["pap"]["company"]["extensions"] = ["operations"]
    agent = addressed(Answers({"total": 9.5}), {**company, "openapi": document})
    assert openapi_operation_of(agent, "quote_basket") == "quote"

    class Declared:
        action = "quote_basket"

    class Approved:
        terms = {"items": [4]}

    executor = OpenApiOperationExecutor(Declared(), "quote", agent)
    done = await executor.perform(Approved(), "u-1")  # type: ignore[arg-type]
    assert done.data == {"total": 9.5}

    class Wrong:
        terms = {"items": "four"}

    with pytest.raises(OperationFailed):
        await executor.perform(Wrong(), "u-1")  # type: ignore[arg-type]


def test_a_private_page_sends_a_browser_to_sign_in_with_datalayer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from urllib.parse import parse_qs, urlparse

    from agent_runtimes.addresses import browser_sign_in

    monkeypatch.setenv("DATALAYER_IAM_PUBLIC_URL", "https://iam.example")
    agent = addressed(
        Answers(),
        policy=AddressPolicy("private", owner_uid="owner"),
        token_checker=_uid_of,
    )
    client = TestClient(web_app(agent), base_url="https://shop.web.datalayer.ai")
    page = client.get("/", headers={"accept": "text/html"}, follow_redirects=False)
    assert page.status_code == 303
    assert page.headers["location"] == "/.datalayer/sign-in?next=%2F"
    # A program is answered 401, as before.
    assert client.get("/api/agent").status_code == 401
    document = client.get("/.datalayer/client.json").json()
    assert (
        document["client_id"] == "https://shop.web.datalayer.ai/.datalayer/client.json"
    )
    assert document["redirect_uris"] == [
        "https://shop.web.datalayer.ai/.datalayer/callback"
    ]
    sign_in = client.get("/.datalayer/sign-in?next=/api/agent", follow_redirects=False)
    location = urlparse(sign_in.headers["location"])
    query = parse_qs(location.query)
    assert f"{location.scheme}://{location.netloc}{location.path}" == (
        "https://iam.example/api/iam/v1/oauth/authorize"
    )
    assert query["scope"] == ["openid"] and query["code_challenge_method"] == ["S256"]
    assert browser_sign_in.PENDING_COOKIE in sign_in.headers["set-cookie"]
    # A callback with another state is refused.
    assert client.get("/.datalayer/callback?code=c&state=other").status_code == 400
    # Signed in, the cookie is read as a bearer token: its owner opens the page.
    signed = client.get(
        "/api/agent", headers={"cookie": f"{browser_sign_in.COOKIE}=key-owner"}
    )
    assert signed.status_code == 200
    assert browser_sign_in.safe_next("//evil.example") == "/"


def test_a_companys_device_link_sends_the_person_on_to_studio() -> None:
    class Company:
        def asgi(self) -> Any:
            raise AssertionError("not the company's")

    agent = addressed(Answers(), COMPANY)
    client = TestClient(AgentHost(_main_server(), agent, "shop-agent", Company()))
    went = client.get(
        "/pap/device?code=ABCD-EFGH&other=1",
        headers={"host": "shop.agent.datalayer.ai"},
        follow_redirects=False,
    )
    assert went.status_code == 303
    assert (
        went.headers["location"]
        == "https://datalayer.ai/pap/device?slug=shop&code=ABCD-EFGH"
    )


@pytest.mark.asyncio
async def test_an_api_key_is_asked_of_iam_as_a_bearer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.addresses.access import iam_key_checker

    seen: List[Dict[str, str]] = []

    def whoami(request: httpx.Request) -> httpx.Response:
        seen.append(dict(request.headers))
        if request.headers.get("authorization") == "Bearer the-key":
            return httpx.Response(200, json={"profile": {"uid": "u-1"}})
        return httpx.Response(401, json={})

    real = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: real(transport=httpx.MockTransport(whoami), **kwargs),
    )
    assert await iam_key_checker("https://iam.example")("the-key") == "u-1"
    assert await iam_key_checker("https://iam.example")("another") is None


@pytest.mark.asyncio
async def test_the_mcp_server_answers_at_its_own_host_and_no_other() -> None:
    from agent_runtimes.addresses.mcp import mcp_app

    initialize = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "check", "version": "1"},
        },
    }
    headers = {"accept": "application/json, text/event-stream"}
    async with served(mcp_app(addressed(Answers()))) as url:
        async with httpx.AsyncClient(timeout=30) as client:
            own = await client.post(
                f"{url}/mcp",
                json=initialize,
                headers={**headers, "host": "shop.mcp.datalayer.ai"},
            )
            other = await client.post(
                f"{url}/mcp",
                json=initialize,
                headers={**headers, "host": "evil.example"},
            )
    assert own.status_code == 200, own.text
    assert other.status_code == 421


def test_an_agent_at_its_address_answers_over_a2a_whatever_it_was_made_for(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.addresses import servers
    from agent_runtimes.routes import a2a, acp

    registered: List[Any] = []
    monkeypatch.setattr(
        a2a, "register_a2a_agent", lambda agent, card: registered.append((agent, card))
    )
    monkeypatch.setitem(acp._agents, "made-for-chat", ("adapter", None))
    servers._answer_over_a2a("made-for-chat", addressed(Answers()))
    assert registered[0][0] == "adapter"
    assert registered[0][1].url == "/api/v1/a2a/agents/made-for-chat"
    # Not made here, or answering over A2A already: nothing.
    registered.clear()
    servers._answer_over_a2a("nobody", addressed(Answers()))
    assert registered == []


def test_the_agent_host_serves_the_a2a_card_its_application_serves_at_its_own_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from types import SimpleNamespace

    from agent_runtimes.routes import a2a

    async def card(_: Any) -> JSONResponse:
        return JSONResponse(
            {"name": "Shop", "url": "http://inside/api/v1/a2a/agents/shop-agent"}
        )

    served = Starlette(routes=[Route("/.well-known/agent-card.json", card)])
    monkeypatch.setitem(
        a2a._a2a_agents, "shop-agent", SimpleNamespace(app=served, card=None)
    )
    client = TestClient(AgentHost(_main_server(), addressed(Answers()), "shop-agent"))
    said = client.get(
        "/.well-known/agent-card.json", headers={"host": "shop.agent.datalayer.ai"}
    ).json()
    assert said == {"name": "Shop", "url": "https://shop.agent.datalayer.ai/a2a/"}


# --- a company's MCP server is an OAuth protected resource (PAP 1.0 §4.5, §7) -----------

MCP_URL = "https://shop.mcp.datalayer.ai/mcp"
MCP_DOCUMENT = "https://shop.mcp.datalayer.ai/.well-known/oauth-protected-resource/mcp"
#: The MCP server's own host, which its transport answers at (and the loopback).
AT_ITS_HOST = {"host": "shop.mcp.datalayer.ai"}


def _secured(document: Dict[str, Any]) -> Dict[str, Any]:
    """``document`` with `quote` requiring `orders:read` (OpenAPI ``security``)."""
    import copy

    secured = copy.deepcopy(document)
    secured["paths"]["/quote"]["post"]["security"] = [{"company": ["orders:read"]}]
    return secured


COMPANY_WITH_A_SCOPED_OPERATION = {
    **COMPANY,
    "openapi": _secured(OPENAPI),
    "pap": {
        **COMPANY["pap"],
        "company": {
            **COMPANY["pap"]["company"],
            "scopes": [
                {"name": "orders:read", "description": "Read your orders"},
                {"name": "orders:write", "description": "Change your orders"},
            ],
        },
    },
}


class _IssuedHere:
    """A company whose issuer issued tokens: one for its MCP server and one default, to
    a personal agent; and one for its MCP server to another MCP client (the SDK's
    public clients), whose account is ``mcp_client_account``. Each is the SDK's own
    record of an access token."""

    def __init__(
        self,
        scopes: tuple[str, ...] = ("orders:read",),
        mcp_client_account: str = "friend",
    ) -> None:
        from datetime import datetime, timedelta, timezone
        from types import SimpleNamespace

        from personal_agent_protocol.company.store import IssuedAccessToken

        self.asked: List[tuple[str, str]] = []
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        issued = {
            "for-the-mcp-server": IssuedAccessToken(
                client_id="https://atlas.example/agent",
                account_id="friend",
                scopes=scopes,
                expires_at=expires_at,
                family="family-1",
                resource=MCP_URL,
            ),
            # The default token: issued for no resource, for the company's own endpoints.
            "the-default": IssuedAccessToken(
                client_id="https://atlas.example/agent",
                account_id="friend",
                scopes=scopes,
                expires_at=expires_at,
                family="family-1",
            ),
            "another-clients": IssuedAccessToken(
                client_id="mcpc_Yx2b7Qd_Kp8mR3vT1nWc4A",
                account_id=mcp_client_account,
                scopes=scopes,
                expires_at=expires_at,
                family="family-2",
                resource=MCP_URL,
                public=True,
            ),
        }
        self.issued = issued

        async def access_token_for(token: str, resource: str) -> Any:
            self.asked.append((token, resource))
            found = issued.get(token)
            return found if found is not None and found.resource == resource else None

        async def _access_token(token: str) -> Any:
            return issued.get(token)

        self.service = SimpleNamespace(
            access_token_for=access_token_for, _access_token=_access_token
        )


def _company_agent(
    policy: AddressPolicy,
    spec: Dict[str, Any] = COMPANY,
    company: Any = None,
    *answers: Any,
) -> AddressedAgent:
    agent = addressed(
        Answers(*answers),
        spec,
        policy=policy,
        key_checker=_uid_of,
        token_checker=_uid_of,
    )
    agent.company = company or _IssuedHere()
    # What checked tokens before the company's own were added (`servers.company_of`).
    agent.platform_tokens = _uid_of
    return agent


PRIVATE = AddressPolicy("private", owner_uid="owner", allowed=frozenset({"friend"}))
HELLO = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
QUOTE = {
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {"name": "quote", "arguments": {"items": [1]}},
}


def test_a_companys_mcp_server_publishes_its_protected_resource_metadata() -> None:
    """Its ``resource`` is its ``url`` as ``poppy.json`` lists it, and its authorization
    server the company's issuer (§7), open to anybody, at both well-known paths."""
    from agent_runtimes.addresses.mcp import mcp_app

    agent = _company_agent(PRIVATE)
    mcp_api = next(api for api in poppy_document(agent)["apis"] if api["type"] == "mcp")
    with TestClient(mcp_app(agent)) as client:
        for path in (
            "/.well-known/oauth-protected-resource/mcp",
            "/.well-known/oauth-protected-resource",
        ):
            said = client.get(path)
            assert said.status_code == 200
            assert said.json() == {
                "resource": MCP_URL,
                "authorization_servers": ["https://shop.agent.datalayer.ai"],
                "scopes_supported": ["orders:read"],
                "bearer_methods_supported": ["header"],
                "resource_name": "Shop",
            }
        assert said.json()["resource"] == mcp_api["url"]
        assert client.get("/healthz").status_code == 200


def test_the_companys_issuer_lists_its_mcp_server_and_would_issue_for_it() -> None:
    """``protected_resources`` of the issuer's metadata agrees with the MCP server's
    document (§3.2), and the company is configured to issue tokens for it (§4.5)."""
    from personal_agent_protocol.company import build_company

    from agent_runtimes.pap.company import company_config

    agent = _company_agent(PRIVATE)
    config = company_config(
        agent.app.name,
        agent.hosts.host("agent"),  # type: ignore[union-attr]
        agent.app.pap.company,
        resource_servers=(agent.hosts.mcp,),  # type: ignore[union-attr]
    )
    assert config.resource_servers == (MCP_URL,)
    metadata = build_company(config, http_client=httpx.AsyncClient()).oauth_metadata()
    assert metadata["issuer"] == "https://shop.agent.datalayer.ai"
    assert metadata["protected_resources"] == [
        "https://shop.agent.datalayer.ai",
        MCP_URL,
    ]


def test_a_private_companys_mcp_server_challenges_a_caller_it_does_not_know() -> None:
    from agent_runtimes.addresses.mcp import mcp_app

    with TestClient(mcp_app(_company_agent(PRIVATE))) as client:
        refused = client.post("/mcp", json=HELLO, headers=AT_ITS_HOST)
        assert refused.status_code == 401
        assert refused.headers["www-authenticate"] == (
            f'Bearer resource_metadata="{MCP_DOCUMENT}"'
        )
        # An API key nobody knows is no way in either.
        unknown = client.post(
            "/mcp", json=HELLO, headers={**AT_ITS_HOST, "X-API-Key": "nobody's"}
        )
        assert unknown.status_code == 401


def test_it_takes_the_companys_token_issued_for_it_and_no_other() -> None:
    """§4.5: a token issued for a ``resource`` is accepted only at that service; a
    token not issued for it gets ``invalid_token`` with ``resource_metadata`` (§7)."""
    from agent_runtimes.addresses.mcp import mcp_app

    company = _IssuedHere()
    accept = {**AT_ITS_HOST, "Accept": "application/json, text/event-stream"}
    with TestClient(mcp_app(_company_agent(PRIVATE, COMPANY, company))) as client:
        issued_for_it = client.post(
            "/mcp",
            json=HELLO,
            headers={**accept, "Authorization": "Bearer for-the-mcp-server"},
        )
        assert issued_for_it.status_code not in (401, 403)
        default = client.post(
            "/mcp",
            json=HELLO,
            headers={**accept, "Authorization": "Bearer the-default-token"},
        )
        assert default.status_code == 401
        challenge = default.headers["www-authenticate"]
        assert 'error="invalid_token"' in challenge
        assert f'resource_metadata="{MCP_DOCUMENT}"' in challenge
    # Asked of the company for this server's own url, nothing else.
    assert company.asked[0] == ("for-the-mcp-server", MCP_URL)


def test_who_may_call_a_private_one_is_as_before() -> None:
    """A Datalayer API key or token of the owner or of somebody allowed; somebody else
    known is refused (403), as at every other address."""
    from agent_runtimes.addresses.mcp import mcp_app

    accept = {**AT_ITS_HOST, "Accept": "application/json, text/event-stream"}
    with TestClient(mcp_app(_company_agent(PRIVATE))) as client:
        for way_in in (
            {"X-API-Key": "key-owner"},
            {"X-API-Key": "key-friend"},
            {"Authorization": "Bearer key-owner"},
        ):
            assert (
                client.post(
                    "/mcp", json=HELLO, headers={**accept, **way_in}
                ).status_code
                == 200
            )
        for way_in in (
            {"X-API-Key": "key-other"},
            {"Authorization": "Bearer key-other"},
        ):
            refused = client.post("/mcp", json=HELLO, headers={**accept, **way_in})
            assert refused.status_code == 403
            assert refused.json()["error"] == "access_denied"


def test_a_company_token_is_held_to_the_scopes_an_operation_requires() -> None:
    """An operation's OpenAPI ``security`` names its scopes: a company token without
    them is ``insufficient_scope`` (403) naming them (§7); a Datalayer key is its
    holder's own authority."""
    from agent_runtimes.addresses.mcp import mcp_app, operation_scopes

    without = _company_agent(
        PRIVATE, COMPANY_WITH_A_SCOPED_OPERATION, _IssuedHere(("orders:write",))
    )
    assert operation_scopes(without) == {"quote": ("orders:read",)}
    accept = {**AT_ITS_HOST, "Accept": "application/json, text/event-stream"}
    with TestClient(mcp_app(without)) as client:
        refused = client.post(
            "/mcp",
            json=QUOTE,
            headers={**accept, "Authorization": "Bearer for-the-mcp-server"},
        )
        assert refused.status_code == 403
        challenge = refused.headers["www-authenticate"]
        assert (
            'error="insufficient_scope"' in challenge
            and 'scope="orders:read"' in challenge
        )
        by_key = client.post(
            "/mcp", json=QUOTE, headers={**accept, "X-API-Key": "key-owner"}
        )
        assert by_key.status_code not in (401, 403)
    held = _company_agent(PRIVATE, COMPANY_WITH_A_SCOPED_OPERATION, _IssuedHere())
    with TestClient(mcp_app(held)) as client:
        allowed = client.post(
            "/mcp",
            json=QUOTE,
            headers={**accept, "Authorization": "Bearer for-the-mcp-server"},
        )
        assert allowed.status_code not in (401, 403)


@pytest.mark.asyncio
async def test_a_public_companys_mcp_server_stays_open_to_anybody() -> None:
    from agent_runtimes.addresses.mcp import mcp_app

    agent = _company_agent(
        AddressPolicy("public"), COMPANY_WITH_A_SCOPED_OPERATION, None, {"total": 3}
    )
    async with served(mcp_app(agent)) as url:
        async with httpx.AsyncClient() as client:
            document = await client.get(
                f"{url}/.well-known/oauth-protected-resource/mcp"
            )
            assert document.json()["authorization_servers"] == [
                "https://shop.agent.datalayer.ai"
            ]
            # A token that is wrong is said to be, open or not.
            wrong = await client.post(
                f"{url}/mcp", json=HELLO, headers={"Authorization": "Bearer invented"}
            )
            assert wrong.status_code == 401
        async with connected(f"{url}/mcp") as session:
            assert {tool.name for tool in (await session.list_tools()).tools} == {
                "getProduct",
                "quote",
            }
            answer = await session.call_tool("quote", {"items": [1, 2]})
            assert answer.structured_content == {"total": 3}


def test_an_application_that_is_no_company_keeps_its_access_check() -> None:
    """No issuer to name: no protected resource metadata, and the 401 it had."""
    from agent_runtimes.addresses.mcp import mcp_app

    agent = addressed(
        Answers(),
        policy=AddressPolicy("private", owner_uid="owner"),
        key_checker=_uid_of,
    )
    with TestClient(mcp_app(agent)) as client:
        refused = client.post("/mcp", json=HELLO, headers=AT_ITS_HOST)
        assert refused.status_code == 401
        assert refused.headers["www-authenticate"] == 'Bearer realm="datalayer"'
        assert (
            client.get("/.well-known/oauth-protected-resource/mcp").status_code == 401
        )


# --- other MCP clients (a private company's "Let other MCP clients sign in") -----------


def _with_an_approved_operation() -> Dict[str, Any]:
    """The company, its ``quote`` operation one a person approves (``x-pap``)."""
    document = json.loads(json.dumps(OPENAPI))
    document["paths"]["/quote"]["post"]["x-pap"] = {
        "action": "quote_basket",
        "tool": "quote",
        "summary": "Quote {items}",
    }
    company = json.loads(json.dumps(COMPANY))
    company["pap"]["company"]["extensions"] = ["operations"]
    company["pap"]["company"]["scopes"].append(
        {"name": "orders:write", "description": "Change your orders"}
    )
    return {**company, "openapi": document}


def test_a_company_offers_other_mcp_clients_nothing_unless_its_owner_said_so() -> None:
    from datetime import timedelta

    from personal_agent_protocol.company import build_company

    from agent_runtimes.addresses.hosts import consent_page
    from agent_runtimes.pap.company import company_config

    agent = _company_agent(PRIVATE)
    assert agent.mcp_clients is False
    said = {
        "name": agent.app.name,
        "domain": agent.hosts.host("agent"),  # type: ignore[union-attr]
        "company": agent.app.pap.company,
        "resource_servers": (MCP_URL,),
    }
    off = company_config(**said)
    assert (off.direct, off.public_clients, off.client_registration) == (
        False,
        False,
        False,
    )
    metadata = build_company(off, http_client=httpx.AsyncClient()).oauth_metadata()
    assert metadata["token_endpoint_auth_methods_supported"] == ["private_key_jwt"]
    assert "registration_endpoint" not in metadata
    assert "authorization_endpoint" not in metadata

    page = consent_page("shop")
    assert page == "https://datalayer.ai/pap/consent?slug=shop&request={request_id}"
    on = company_config(**said, mcp_clients=True, consent_page=page)
    assert (on.direct, on.public_clients, on.client_registration) == (True, True, True)
    assert on.consent_page == page
    assert on.public_client_refresh_lifetime == timedelta(days=30)
    # The company's own scopes, never the protocol's browser sign-in.
    assert on.public_scopes == ("orders:read",)
    metadata = build_company(on, http_client=httpx.AsyncClient()).oauth_metadata()
    assert metadata["token_endpoint_auth_methods_supported"] == [
        "private_key_jwt",
        "none",
    ]
    issuer = "https://shop.agent.datalayer.ai"
    assert metadata["registration_endpoint"] == f"{issuer}/oauth/register"
    assert metadata["authorization_endpoint"] == f"{issuer}/oauth/authorize"
    assert metadata["code_challenge_methods_supported"] == ["S256"]
    # Never without the page a person allows them on, nor without its MCP address.
    for missing in ({"consent_page": page}, {"resource_servers": (MCP_URL,)}):
        with pytest.raises(ValueError, match="consent page"):
            company_config(
                **{**said, "resource_servers": (), **missing, "mcp_clients": True}
            )


def test_only_a_private_deployment_that_says_so_lets_them_in() -> None:
    from agent_runtimes.addresses.servers import mcp_clients_of

    public = AddressPolicy("public")
    assert mcp_clients_of({"mcp_clients": True}, PRIVATE) is True
    assert mcp_clients_of({"mcp_clients": True}, public) is False
    assert mcp_clients_of({}, PRIVATE) is False
    assert mcp_clients_of({"mcp_clients": "yes"}, PRIVATE) is False


@pytest.mark.asyncio
async def test_another_mcp_client_calls_what_its_scopes_allow_as_the_person() -> None:
    from agent_runtimes.addresses.mcp import NEEDS_A_PERSONAL_AGENT, mcp_app

    spec = _with_an_approved_operation()
    agent = _company_agent(PRIVATE, spec, None, {"title": "A lamp", "price": 12.5})
    agent.mcp_clients = True
    recorded: List[Any] = []
    agent.calls = type("Calls", (), {"record": staticmethod(recorded.append)})()
    theirs = {"Authorization": "Bearer another-clients"}
    async with served(mcp_app(agent)) as url:
        async with connected(f"{url}/mcp", theirs) as session:
            assert {tool.name for tool in (await session.list_tools()).tools} == {
                "getProduct",
                "quote",
            }
            answer = await session.call_tool("getProduct", {"product_id": 7})
            assert answer.is_error is not True
            assert answer.structured_content == {"title": "A lamp", "price": 12.5}
            # What a person approves is not done for it: nothing was asked of the agent.
            refused = await session.call_tool("quote", {"items": [1]})
            assert refused.is_error is True
            assert NEEDS_A_PERSONAL_AGENT in refused.content[0].text
    # The one call made is recorded as the person's who allowed the client.
    assert [(call.operation, call.person, call.status) for call in recorded] == [
        ("getProduct", "friend", 200)
    ]


def test_a_company_that_takes_none_refuses_another_mcp_clients_token() -> None:
    from agent_runtimes.addresses.mcp import mcp_app

    accept = {**AT_ITS_HOST, "Accept": "application/json, text/event-stream"}
    theirs = {**accept, "Authorization": "Bearer another-clients"}
    # The switch off: its token is nobody's here, a personal agent's is as before.
    agent = _company_agent(PRIVATE)
    with TestClient(mcp_app(agent)) as client:
        assert client.post("/mcp", json=HELLO, headers=theirs).status_code == 401
        mine = {**accept, "Authorization": "Bearer for-the-mcp-server"}
        assert client.post("/mcp", json=HELLO, headers=mine).status_code not in (
            401,
            403,
        )
    # On, for somebody the owner does not let in (any more): refused, as anybody else is.
    stranger = _company_agent(PRIVATE, COMPANY, _IssuedHere(mcp_client_account="other"))
    stranger.mcp_clients = True
    with TestClient(mcp_app(stranger)) as client:
        assert client.post("/mcp", json=HELLO, headers=theirs).status_code == 403


@pytest.mark.asyncio
async def test_another_mcp_clients_token_is_nobodys_at_the_other_addresses() -> None:
    """Issued for its MCP address alone: at its agent, API and web hosts the access
    check does not know it. Nor a personal agent's token issued for the MCP server: a
    company accepts a token issued for a resource only at that service (Poppy 1.0
    §4.5). There a personal agent's default token, issued for no resource, says whose
    it is."""
    from agent_runtimes.addresses.mcp import mcp_client_caller
    from agent_runtimes.addresses.servers import pap_token_checker

    agent = _company_agent(PRIVATE)
    agent.mcp_clients = True
    check = pap_token_checker(agent)
    assert await check("the-default") == "friend"
    assert await check("for-the-mcp-server") is None
    assert await check("another-clients") is None
    assert await check("invented") is None
    # At its MCP address it is the person who allowed it; no other bearer is.
    caller = await mcp_client_caller(
        agent,
        {"authorization": "Bearer another-clients", "x-forwarded-for": "203.0.113.9"},
    )
    assert caller is not None
    assert (caller.kind, caller.uid, caller.address) == (
        "token",
        "friend",
        "203.0.113.9",
    )
    for other in ("Bearer for-the-mcp-server", "Bearer key-owner", "Basic abc", ""):
        assert await mcp_client_caller(agent, {"Authorization": other}) is None
    agent.mcp_clients = False
    with pytest.raises(OperationError) as refused:
        await mcp_client_caller(agent, {"Authorization": "Bearer another-clients"})
    assert refused.value.status == 403


@pytest.mark.asyncio
async def test_a_company_that_lists_its_personal_agents_takes_other_clients_apart() -> (
    None
):
    from agent_runtimes.pap.company import RegisteredAgents

    listed = RegisteredAgents(["https://atlas.example/agent"])
    assert await listed.allows("https://atlas.example/agent") is True
    assert await listed.allows("mcpc_Yx2b7Qd_Kp8mR3vT1nWc4A") is False
    assert await listed.allows_public("mcpc_Yx2b7Qd_Kp8mR3vT1nWc4A") is False
    taking = RegisteredAgents(["https://atlas.example/agent"], public_clients=True)
    assert await taking.allows_public("mcpc_Yx2b7Qd_Kp8mR3vT1nWc4A") is True
    assert await taking.allows("https://other.example/agent") is False


@pytest.mark.asyncio
async def test_requests_nobody_signed_are_capped_by_address() -> None:
    from agent_runtimes.addresses.servers import UnsignedRequestsCap

    now = [0.0]
    cap = UnsignedRequestsCap(2, clock=lambda: now[0])
    assert await cap.admit("registration:203.0.113.9", None) is None
    assert await cap.admit("registration:203.0.113.9", None) is None
    wait = await cap.admit("registration:203.0.113.9", None)
    assert wait is not None and 0 < wait <= 61
    # Another address, and the other kind of request, have their own counts.
    assert await cap.admit("registration:203.0.113.10", None) is None
    assert await cap.admit("public:203.0.113.9", None) is None
    # A personal agent's requests are not counted here.
    for _ in range(5):
        assert await cap.admit("https://atlas.example/agent", "friend") is None
    now[0] = 61.0
    assert await cap.admit("registration:203.0.113.9", None) is None


def test_the_companys_poppy_document_is_the_same_with_the_switch_on() -> None:
    """Its sign-in for personal agents is what it was: what it offers other MCP clients
    is in its issuer's metadata, where they read it."""
    agent = _company_agent(PRIVATE)
    before = poppy_document(agent)
    agent.mcp_clients = True
    after = poppy_document(agent)
    assert after["apis"] == before["apis"]
    assert after["organization"] == before["organization"]
