# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An operation a person approves (``x-pap``) needs their approval at every address.

Decided 18 November 2026, after a company's API placed a proposed order at once: at
its API, its MCP server and its web page such an operation is refused
``403 approval_required`` to anybody, a key of its owner's included, and nothing is
done. A personal agent calling the API in its Session gets the operation to approve
from the company's own service (the PAP SDK), sends the same request again with the
person's approval, and the action is performed once; a repeat is answered with what it
came to. An operation that needs no approval is answered as before.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

import httpx
import pytest
from fastapi.testclient import TestClient
from personal_agent_protocol import (
    APPROVAL_SURFACES,
    PAIRWISE_USER_ID_STORES,
    SqlitePairwiseUserIdStore,
)
from personal_agent_protocol.apis import ApiClient
from personal_agent_protocol.company import ApiCall
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    ClockPlugin,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
    personal_agent_reactor,
)
from personal_agent_protocol.models import Approval
from reactor import PluginManifest

from agent_runtimes.addresses.access import AddressPolicy
from agent_runtimes.addresses.api import api_app
from agent_runtimes.addresses.operations import (
    APPROVAL_REQUIRED,
    NEEDS_APPROVAL,
    OperationError,
)
from agent_runtimes.pap import (
    A2AApplication,
    PapCompanyCapability,
    PapPersonalAgentCapability,
)
from agent_runtimes.pap.company import ApprovedOperationsApi
from agent_runtimes.tests.test_addresses import (
    COMPANY,
    OPENAPI,
    Answers,
    _uid_of,
    addressed,
)

DOMAIN = "shop.example"
API = "https://shop.api.datalayer.ai"
ORDER = {"total": 9.5}


def _shop() -> Dict[str, Any]:
    """The company: `quote` needs no approval; `order` (POST /orders) is one a person
    approves, under `orders:write`.
    """
    document = json.loads(json.dumps(OPENAPI))
    document["paths"]["/orders"] = json.loads(json.dumps(document["paths"]["/quote"]))
    order = document["paths"]["/orders"]["post"]
    order["operationId"] = "order"
    order["x-pap"] = {
        "action": "orders.place",
        "tool": "place_order",
        "summary": "Order {items}",
        "scope": "orders:write",
    }
    company = json.loads(json.dumps(COMPANY))
    said = company["pap"]["company"]
    said["extensions"] = ["operations"]
    if not any(scope["name"] == "orders:write" for scope in said["scopes"]):
        said["scopes"].append({"name": "orders:write", "description": "Place an order"})
    return {**company, "openapi": document}


class _Always(Answers):
    """A model that answers every call the same, and keeps what it was asked."""

    def __init__(self, answer: Any) -> None:
        super().__init__()
        self.answer = answer

    def __call__(self, messages: Any, info: Any) -> Any:
        self.answers = [self.answer]
        return super().__call__(messages, info)


def _agent(policy: AddressPolicy | None = None) -> Any:
    model = _Always(ORDER)
    agent = addressed(
        model,
        _shop(),
        policy=policy or AddressPolicy("public"),
        key_checker=_uid_of,
        token_checker=_uid_of,
    )
    agent.model = model
    return agent


def _calls(agent: Any) -> int:
    """How many times the application's agent was asked."""
    return len(agent.model.prompts)


# --- without an approval, at every address: refused, nothing done ---------------


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"X-API-Key": "key-owner"},
        {"Authorization": "Bearer key-owner"},
    ],
    ids=["anybody", "its owner's key", "its owner's token"],
)
def test_the_api_refuses_an_approved_operation_to_any_caller_and_does_nothing(
    headers: Dict[str, str],
) -> None:
    agent = _agent()
    client = TestClient(api_app(agent))
    refused = client.post("/orders", json={"items": [1]}, headers=headers)
    assert refused.status_code == 403
    assert refused.json() == {"error": APPROVAL_REQUIRED, "detail": NEEDS_APPROVAL}
    assert _calls(agent) == 0
    # An operation that needs no approval is answered as before.
    assert client.post("/quote", json={"items": [1]}, headers=headers).json() == ORDER
    assert _calls(agent) == 1


def test_a_private_companys_api_still_asks_who_calls_first() -> None:
    private = AddressPolicy("private", owner_uid="owner", allowed=frozenset())
    client = TestClient(api_app(_agent(private)))
    assert client.post("/orders", json={"items": [1]}).status_code == 401
    known = client.post(
        "/orders", json={"items": [1]}, headers={"X-API-Key": "key-owner"}
    )
    assert known.status_code == 403 and known.json()["error"] == APPROVAL_REQUIRED


@pytest.mark.asyncio
@pytest.mark.parametrize("interface", ["api", "mcp", "web"])
async def test_no_address_calls_an_approved_operation_itself(interface: str) -> None:
    agent = _agent()
    with pytest.raises(OperationError) as refused:
        await agent.call("order", {"items": [1]}, interface=interface)
    assert (refused.value.status, refused.value.code) == (403, APPROVAL_REQUIRED)
    assert _calls(agent) == 0
    # Its executor, once the company verified the approval, is the one caller.
    assert await agent.call("order", {"items": [1]}, interface="agent") == ORDER


@pytest.mark.asyncio
async def test_the_mcp_server_refuses_an_approved_tool_to_anybody_and_does_nothing() -> (
    None
):
    from agent_runtimes.addresses.mcp import mcp_app
    from agent_runtimes.tests.test_addresses import _IssuedHere, connected, served

    agent = _agent()
    agent.company = _IssuedHere()
    agent.platform_tokens = _uid_of
    async with served(mcp_app(agent)) as url:
        for headers in (None, {"X-API-Key": "key-owner"}):
            async with connected(f"{url}/mcp", headers) as session:
                # Listed, so that a personal agent knows it exists; never done by a call.
                assert "order" in {
                    tool.name for tool in (await session.list_tools()).tools
                }
                refused = await session.call_tool("order", {"items": [1]})
                assert refused.is_error
                assert "403" in refused.content[0].text
                assert NEEDS_APPROVAL in refused.content[0].text
                # What needs no approval is answered as before.
                quoted = await session.call_tool("quote", {"items": [1]})
                assert quoted.structured_content == ORDER
    assert _calls(agent) == 2


# --- what the company's service is handed: the operation, never its effect ------


@pytest.mark.asyncio
async def test_the_api_contribution_proposes_and_performs_nothing() -> None:
    agent = _agent()
    api = ApprovedOperationsApi(agent)

    def call(**changes: Any) -> ApiCall:
        said: Dict[str, Any] = {
            "method": "POST",
            "path": "/orders",
            "query": {},
            "body": {"items": [1, 2]},
            "account_id": "acct_ada",
            "scopes": ("orders:read", "orders:write"),
            "client_id": "https://atlas.example/agent",
        }
        return ApiCall(**{**said, **changes})

    proposed = await api.handle(call())
    assert proposed.operation is not None and proposed.body is None
    assert proposed.operation.action == "orders.place"
    assert proposed.operation.terms == {"items": [1, 2]}
    assert proposed.operation.summary == "Order [1, 2]"
    assert proposed.operation.scopes == ("orders:write",)
    # Without the scope it names, or signed out: insufficient_scope, no operation.
    for lacking in (call(scopes=("orders:read",)), call(account_id=None)):
        refused = await api.handle(lacking)
        assert refused.operation is None
        assert (refused.status, refused.body["error"]) == (403, "insufficient_scope")
    # Inputs that are not the operation's are never proposed.
    wrong = await api.handle(call(body={"items": "one"}))
    assert wrong.operation is None and wrong.status == 400
    # What needs no approval is the API address's own to answer: not found here.
    assert (await api.handle(call(path="/quote"))).status == 404
    assert (await api.handle(call(method="GET"))).status == 404
    assert _calls(agent) == 0


@pytest.mark.asyncio
async def test_a_private_companys_contribution_admits_only_whom_its_owner_allows() -> (
    None
):
    private = AddressPolicy("private", owner_uid="owner", allowed=frozenset({"friend"}))
    api = ApprovedOperationsApi(_agent(private))
    said = dict(
        method="POST",
        path="/orders",
        query={},
        body={"items": [1]},
        scopes=("orders:write",),
        client_id="c",
    )
    assert (await api.handle(ApiCall(account_id="stranger", **said))).status == 403
    assert (
        await api.handle(ApiCall(account_id="friend", **said))
    ).operation is not None


def test_the_url_handed_to_the_company_is_the_one_the_agent_called() -> None:
    """Behind the ingress the server sees plain http and its own side of the connection;
    a Session JWT is signed for the public URL (found on r1, 18 November 2026: every
    such call was `invalid_session`)."""
    from types import SimpleNamespace

    from agent_runtimes.addresses.api import called_url

    def asked(url: str, path: str, query: str = "") -> Any:
        return SimpleNamespace(
            url=SimpleNamespace(path=path, query=query, __str__=lambda: url)
        )

    agent = _agent()
    assert (
        agent.hosts is not None and agent.hosts.api == "https://shop.api.datalayer.ai"
    )
    seen = asked("http://10.244.1.7:8767/orders", "/orders")
    assert called_url(agent, seen) == "https://shop.api.datalayer.ai/orders"
    with_query = asked(
        "http://shop.api.datalayer.ai/orders?a=1&b=2", "/orders", "a=1&b=2"
    )
    assert (
        called_url(agent, with_query) == "https://shop.api.datalayer.ai/orders?a=1&b=2"
    )
    # Served locally, with no public address: the URL the request carries.
    agent.hosts = None

    class Local:
        url = "http://127.0.0.1:8767/orders"

    assert called_url(agent, Local()) == "http://127.0.0.1:8767/orders"


# --- a personal agent, in its Session: approved, performed once, repeated ----------


class _Accounts:
    async def authenticate(self, credentials: Any, context: Any) -> None:
        return None

    async def check_code(self, code_reference: str, code: Any) -> bool:
        return False


class _Host:
    def __init__(self, folder: Path) -> None:
        self.pairwise = SqlitePairwiseUserIdStore(folder / "pairwise.sqlite")

    async def approve(self, request: Any) -> bool:
        return True

    def provide_contributions(self, contributions: Any) -> None:
        contributions.contribute(
            PAIRWISE_USER_ID_STORES, self.pairwise, contribution_id="host", order=50
        )
        contributions.contribute(
            APPROVAL_SURFACES, self, contribution_id="person", order=50
        )


@pytest.mark.asyncio
async def test_a_personal_agent_gets_the_operation_approves_it_and_it_is_done_once(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    agent = _agent()
    a2a = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(500))
    )
    company = PapCompanyCapability(
        name="Shop",
        domain=DOMAIN,
        company=agent.app.pap.company,
        application=A2AApplication("https://runtime.local/a2a/shop", http_client=a2a),
        accounts=_Accounts(),
        http_client=network.client(),
        address_resolver=network.resolve,
        plugins=[(PluginManifest(name="clock", version="1"), ClockPlugin(clock))],
        # At its addresses, as a deployed company is: its API beside its agent.
        hosted=True,
        operations=agent,
    )
    agent.company = company
    # As at its addresses (`servers.company_of`): its own default token names its account.
    from agent_runtimes.addresses.servers import pap_token_checker

    agent.access.token_checker = pap_token_checker(agent)
    network.add(DOMAIN, company.asgi())
    # Its API, at an address of its own, as a hosted company's is.
    network.add("shop.api.datalayer.ai", api_app(agent))
    http = network.client()
    reactor = personal_agent_reactor(
        PersonalAgentHost(atlas, clock),
        network=network,
        http_client=http,
        plugins=[(PluginManifest(name="host", version="1"), _Host(tmp_path))],
    )
    pap = PapPersonalAgentCapability(
        reactor=reactor, http_client=http, client_id=atlas.client_id
    )
    try:
        started = await pap.sign_in(DOMAIN, user_id="ada")
        assert started.code is not None
        await company.approve_device(started.code, account_id="acct_ada")
        clock.advance(10)
        assert (await pap.sign_in_status(DOMAIN, user_id="ada")).status == "signed_in"
        link = await pap._link("ada", DOMAIN)
        session = await pap._session(link)
        api = ApiClient(transport=pap._transport())
        body = {"items": [1, 2]}

        # What needs no approval is answered as before, to the personal agent too.
        quoted = await api.call(
            "POST", f"{API}/quote", session=session, token=link.token, body=body
        )
        assert (quoted.status, quoted.body) == (200, ORDER)
        asked_before = _calls(agent)

        # The order: refused with the operation to approve, nothing done.
        proposed = await api.call(
            "POST", f"{API}/orders", session=session, token=link.token, body=body
        )
        assert proposed.status == 403 and proposed.operation is not None
        operation = proposed.operation
        assert operation.terms == body and operation.summary == "Order [1, 2]"
        assert _calls(agent) == asked_before
        # Asked again without an approval: the same operation, still nothing done.
        again = await api.call(
            "POST", f"{API}/orders", session=session, token=link.token, body=body
        )
        assert again.operation is not None
        assert (again.operation.operation_id, again.operation.revision) == (
            operation.operation_id,
            operation.revision,
        )
        assert _calls(agent) == asked_before

        # The same request with the person's approval of that revision: done, once.
        approval = Approval(
            approver="user",
            operation_id=operation.operation_id,
            revision=operation.revision,
        )
        done = await api.call(
            "POST",
            f"{API}/orders",
            session=session,
            token=link.token,
            body=body,
            approval=approval,
        )
        assert done.status == 200
        assert done.body["data"] == ORDER
        assert _calls(agent) == asked_before + 1
        # Sent again: the original answer, and the action is not done twice.
        repeated = await api.call(
            "POST",
            f"{API}/orders",
            session=session,
            token=link.token,
            body=body,
            approval=approval,
        )
        assert (repeated.status, repeated.body) == (done.status, done.body)
        assert _calls(agent) == asked_before + 1
    finally:
        await a2a.aclose()
