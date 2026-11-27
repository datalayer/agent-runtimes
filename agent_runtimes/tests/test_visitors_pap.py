# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A public application's own company connection, on the visitors' runtime.

ai-agents gives this runtime, with its own key, the principal's token of a
deployment that lets its visitors use one company in its owner's account: the
run reaches that company with it, and a visitor's turn may read, propose and
confirm there. Every other company, tool and deployment still only reads.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from agent_runtimes.apps import pap_connections, principal, visitors, visitors_pap
from agent_runtimes.apps.principal import gateway_toolsets_of_the_run
from agent_runtimes.apps.rules import ASK_FIRST, DO_IT
from agent_runtimes.mcp import datalayer_gateway
from agent_runtimes.models.models import remember_app_instance

AGENT = "agent-shopper-tryout"
SHOP = "online-shop.agent.datalayer.ai"
OTHER = "manzanita.examples.datalayer.run"
TOKEN = "visitors-principal-token"


def _app(*connections: dict[str, Any]) -> Any:
    return SimpleNamespace(pap=SimpleNamespace(connections=list(connections)))


@pytest.fixture
def world(monkeypatch: Any) -> Any:
    seen: list[dict[str, str]] = []

    def client(
        headers: dict[str, str] | None = None, **kwargs: Any
    ) -> httpx.AsyncClient:
        seen.append(dict(headers or {}))
        return httpx.AsyncClient(headers=headers)

    asked: list[tuple[str, str]] = []
    answers: dict[str, Any] = {}

    async def ask(deployment_uid: str, key: str) -> dict[str, Any]:
        asked.append((deployment_uid, key))
        answer = answers.get(deployment_uid)
        if answer is None:
            visitors_pap._REFUSED[deployment_uid] = 0.0 + __import__("time").time()
            raise principal.PrincipalTokenMissing("ai-agents answered 409.")
        visitors_pap._COMPANIES[deployment_uid] = {
            d: tuple(s) for d, s in answer["companies"].items()
        }
        return answer

    monkeypatch.setattr(datalayer_gateway, "tracing_client", client)
    monkeypatch.setattr(visitors_pap, "_ask", ask)
    monkeypatch.setenv(visitors.VISITORS_ENV, "chat-agent")
    monkeypatch.setenv(visitors_pap.KEY_ENV, "visitors-runtime-key")
    visitors_pap.forget()
    pap_connections.forget()
    pap_connections.remember_agent(
        AGENT,
        _app(
            {"company": SHOP, "as": "owner", "access": "write"},
            {"company": OTHER, "as": "user", "access": "write"},
        ),
    )
    remember_app_instance(
        AGENT, {"app_uid": "01SHOPPER", "deployment_uid": "dep-shopper"}
    )
    yield SimpleNamespace(seen=seen, asked=asked, answers=answers)
    remember_app_instance(AGENT, None)
    principal.forget_principal_token("dep-shopper")
    visitors_pap.forget()
    pap_connections.forget()


def _let_in(world: Any) -> None:
    world.answers["dep-shopper"] = {
        "access_token": TOKEN,
        "expires_in": 3600,
        "principal_uid": "p-shopper",
        "companies": {SHOP: ["catalog:read", "orders:write"]},
    }


@pytest.mark.asyncio
async def test_the_company_it_lets_its_visitors_use_is_reached_with_the_principals_token(
    world: Any,
) -> None:
    _let_in(world)
    toolsets = await gateway_toolsets_of_the_run(
        AGENT, [SimpleNamespace(id="datalayer")], "visitors-token"
    )
    # The owner's company alone, with the principal's token: the person's company is left out.
    assert (
        world.seen == [{"Authorization": f"Bearer {TOKEN}"}] * len(world.seen)
        and world.seen
    )
    assert len(toolsets) == 2
    # Asked once, with this runtime's key, which left the environment.
    assert world.asked == [("dep-shopper", "visitors-runtime-key")]
    import os

    assert visitors_pap.KEY_ENV not in os.environ


@pytest.mark.asyncio
async def test_a_deployment_ai_agents_does_not_let_further_reaches_no_company(
    world: Any,
) -> None:
    toolsets = await gateway_toolsets_of_the_run(
        AGENT, [SimpleNamespace(id="datalayer")], "visitors-token"
    )
    assert world.seen == [] and len(toolsets) == 0
    # Refused, it is not asked again at every turn.
    await gateway_toolsets_of_the_run(
        AGENT, [SimpleNamespace(id="datalayer")], "visitors-token"
    )
    assert len(world.asked) == 1


@pytest.mark.asyncio
async def test_without_its_key_or_off_the_visitors_runtime_nothing_is_asked(
    world: Any, monkeypatch: Any
) -> None:
    _let_in(world)
    visitors_pap.forget()
    monkeypatch.delenv(visitors_pap.KEY_ENV)
    assert await visitors_pap.ensure("dep-shopper") is False
    monkeypatch.delenv(visitors.VISITORS_ENV)
    assert await visitors_pap.ensure("dep-shopper") is False
    assert world.asked == []


def _tool(domain: str, name: str) -> str:
    return f"{pap_connections.server_id(domain)}_{name}"


@pytest.mark.asyncio
async def test_a_visitor_proposes_and_confirms_there_and_nowhere_else(
    world: Any, monkeypatch: Any
) -> None:
    monkeypatch.setattr(visitors, "in_visitor_turn", lambda: True)
    visitors_pap._RUN_COMPANIES.set({SHOP: ("catalog:read", "orders:write")})
    propose, confirm = _tool(SHOP, "pap_propose"), _tool(SHOP, "pap_confirm")
    assert visitors.visitor_refusal(propose, ["write"], DO_IT) == ""
    assert visitors.visitor_refusal(confirm, ["write", "buy"], DO_IT) == ""
    # Another company: still only reads.
    assert "only reads" in visitors.visitor_refusal(
        _tool(OTHER, "pap_propose"), ["write"], DO_IT
    )
    # Another tool of the same company: never a sign-in, a disconnect or a message.
    assert "only reads" in visitors.visitor_refusal(
        _tool(SHOP, "pap_sign_in"), ["write"], DO_IT
    )
    assert "only reads" in visitors.visitor_refusal(
        _tool(SHOP, "pap_ask"), ["send"], DO_IT
    )
    # A rule that waits for a person: nobody is there.
    assert visitors.visitor_refusal(propose, ["write"], ASK_FIRST) != ""
    # Any other tool that does more than read.
    assert "only reads" in visitors.visitor_refusal("gmail.send", ["send"], DO_IT)


@pytest.mark.asyncio
async def test_another_deployments_run_lets_no_visitor_further(
    world: Any, monkeypatch: Any
) -> None:
    monkeypatch.setattr(visitors, "in_visitor_turn", lambda: True)
    visitors_pap._RUN_COMPANIES.set({})
    assert "only reads" in visitors.visitor_refusal(
        _tool(SHOP, "pap_propose"), ["write"], DO_IT
    )
    visitors_pap._RUN_COMPANIES.set(None)
    assert "only reads" in visitors.visitor_refusal(
        _tool(SHOP, "pap_confirm"), ["write", "buy"], DO_IT
    )


@pytest.mark.asyncio
async def test_a_scope_the_company_does_not_let_in_is_never_let_in(
    world: Any, monkeypatch: Any
) -> None:
    # ai-agents names the company only when the deployment's grant asks no more than the
    # permissions it lets visitors use; a deployment asking another is answered nothing.
    world.answers["dep-shopper"] = {
        "access_token": TOKEN,
        "expires_in": 3600,
        "principal_uid": "p",
        "companies": {},
    }
    assert await visitors_pap.ensure("dep-shopper") is False


# --- what the run is offered: three tools of that company, and no other --------


class _GatewayTools:
    """A company's toolset as the gateway serves it: every `pap` tool, by its own name."""

    def __init__(
        self, url: str, *, id: str, http_client: Any, renew_token: Any = None
    ) -> None:  # noqa: A002
        self.url, self.id, self.renew_token = url, id, renew_token
        _GatewayTools.made.append(self)

    made: list["_GatewayTools"] = []

    def filtered(self, offered: Any) -> "_Offered":
        return _Offered(self, offered)

    def prefixed(self, prefix: str) -> "_Named":
        return _Named(
            self, prefix, sorted(pap_connections.TOOL_CLASSES_BY_PROTOCOL["pap"])
        )


class _Offered:
    def __init__(self, wrapped: _GatewayTools, offered: Any) -> None:
        self.wrapped, self.offered, self.id = wrapped, offered, wrapped.id

    def prefixed(self, prefix: str) -> "_Named":
        every = sorted(pap_connections.TOOL_CLASSES_BY_PROTOCOL["pap"])
        return _Named(
            self,
            prefix,
            [name for name in every if self.offered(None, SimpleNamespace(name=name))],
        )


class _Named:
    def __init__(self, wrapped: Any, prefix: str, names: list[str]) -> None:
        self.id = wrapped.id
        self.tools = [f"{prefix}_{name}" for name in names]


def _company_tools(toolsets: list[Any]) -> list[str]:
    return sorted(
        tool for toolset in toolsets for tool in getattr(toolset, "tools", [])
    )


@pytest.mark.asyncio
async def test_a_visitors_run_is_offered_read_propose_and_confirm_at_that_company_and_no_other_tool(
    world: Any, monkeypatch: Any
) -> None:
    """Decided 18 November 2026: `pap_mcp_call` and every company tool outside the three are
    not offered to the model on the visitors' runtime — it could reach the order operation
    around the approval the gateway records."""
    monkeypatch.setattr(datalayer_gateway, "DisplayMCPToolset", _GatewayTools)
    _let_in(world)
    toolsets = await gateway_toolsets_of_the_run(AGENT, [], "visitors-token")
    assert _company_tools(toolsets) == sorted(
        _tool(SHOP, name) for name in ("pap_read", "pap_propose", "pap_confirm")
    )
    offered = {tool.rsplit("_pap_", 1)[1] for tool in _company_tools(toolsets)}
    assert offered == {"read", "propose", "confirm"}
    for left_out in (
        "pap_mcp_call",
        "pap_mcp_tools",
        "pap_sign_in",
        "pap_ask",
        "pap_disconnect",
        "pap_company",
    ):
        assert left_out in pap_connections.TOOL_CLASSES_BY_PROTOCOL["pap"]
        assert _tool(SHOP, left_out) not in _company_tools(toolsets)
    # The person's company (`as: user`) gets none: nobody is signed in.
    assert not any(
        OTHER in tool or pap_connections.server_id(OTHER) in tool
        for tool in _company_tools(toolsets)
    )
    # And the three are what a visitor's turn may call there (`VISITOR_COMPANY_TOOLS`).
    assert visitors_pap.VISITOR_COMPANY_TOOLS == frozenset(
        {"pap_read", "pap_propose", "pap_confirm"}
    )


@pytest.mark.asyncio
async def test_a_deployment_not_let_further_and_another_company_are_offered_no_company_tool(
    world: Any, monkeypatch: Any
) -> None:
    monkeypatch.setattr(datalayer_gateway, "DisplayMCPToolset", _GatewayTools)
    # ai-agents lets this deployment no further: no company tool at all.
    assert (
        _company_tools(await gateway_toolsets_of_the_run(AGENT, [], "visitors-token"))
        == []
    )
    # Let in at another company than the one its application names as its owner's: none either.
    visitors_pap.forget()
    monkeypatch.setenv(visitors_pap.KEY_ENV, "visitors-runtime-key")
    world.answers["dep-shopper"] = {
        "access_token": TOKEN,
        "expires_in": 3600,
        "principal_uid": "p-shopper",
        "companies": {OTHER: ["catalog:read"]},
    }
    assert (
        _company_tools(await gateway_toolsets_of_the_run(AGENT, [], "visitors-token"))
        == []
    )


@pytest.mark.asyncio
async def test_a_signed_in_persons_run_keeps_every_company_tool(
    world: Any, monkeypatch: Any
) -> None:
    """Only the visitors' runtime narrows the list: elsewhere the company's toolset is whole."""
    monkeypatch.setattr(datalayer_gateway, "DisplayMCPToolset", _GatewayTools)
    toolsets = datalayer_gateway.toolsets_for_the_run(
        [],
        "principal",
        users_token="person",
        companies=((pap_connections.server_id(SHOP), "owner"),),
    )
    assert _tool(SHOP, "pap_mcp_call") in _company_tools(toolsets)
    assert len(_company_tools(toolsets)) == len(
        pap_connections.TOOL_CLASSES_BY_PROTOCOL["pap"]
    )


def test_the_filter_offers_the_names_given_and_no_other() -> None:
    offered = datalayer_gateway._only(visitors_pap.VISITOR_COMPANY_TOOLS)
    names = sorted(pap_connections.TOOL_CLASSES_BY_PROTOCOL["pap"])
    assert [name for name in names if offered(None, SimpleNamespace(name=name))] == [
        "pap_confirm",
        "pap_propose",
        "pap_read",
    ]


# --- the execution its token was issued for has ended: renewed once --------


@pytest.mark.asyncio
async def test_an_ended_execution_drops_the_token_and_asks_ai_agents_once(
    world: Any, monkeypatch: Any
) -> None:
    """Decided 19 November 2026: after the deployment moved to a new spec version, the
    gateway refused every call with the token held; the visitors' runtime drops it,
    asks for a new one once, and the call is asked again with it."""
    monkeypatch.setattr(datalayer_gateway, "DisplayMCPToolset", _GatewayTools)
    _GatewayTools.made.clear()
    _let_in(world)
    await gateway_toolsets_of_the_run(AGENT, [], "visitors-token")
    (company,) = _GatewayTools.made
    assert company.renew_token is not None
    world.answers["dep-shopper"] = {
        **world.answers["dep-shopper"],
        "access_token": "renewed",
    }
    assert await company.renew_token(TOKEN) == "renewed"
    assert principal.principal_token("dep-shopper") == "renewed"
    # Another toolset of the run, still with the old token: given the new one, ai-agents not asked again.
    assert await company.renew_token(TOKEN) == "renewed"
    assert len(world.asked) == 2


@pytest.mark.asyncio
async def test_concurrent_ended_calls_ask_ai_agents_once(
    world: Any, monkeypatch: Any
) -> None:
    import asyncio

    monkeypatch.setattr(datalayer_gateway, "DisplayMCPToolset", _GatewayTools)
    _GatewayTools.made.clear()
    _let_in(world)
    await gateway_toolsets_of_the_run(AGENT, [], "visitors-token")
    (company,) = _GatewayTools.made
    world.answers["dep-shopper"] = {
        **world.answers["dep-shopper"],
        "access_token": "renewed",
    }
    assert await asyncio.gather(
        company.renew_token(TOKEN), company.renew_token(TOKEN)
    ) == ["renewed", "renewed"]
    assert len(world.asked) == 2


@pytest.mark.asyncio
async def test_an_ended_execution_ai_agents_will_not_renew_gives_no_token(
    world: Any, monkeypatch: Any
) -> None:
    monkeypatch.setattr(datalayer_gateway, "DisplayMCPToolset", _GatewayTools)
    _GatewayTools.made.clear()
    _let_in(world)
    await gateway_toolsets_of_the_run(AGENT, [], "visitors-token")
    (company,) = _GatewayTools.made
    del world.answers["dep-shopper"]
    assert await company.renew_token(TOKEN) == ""
    # The ended token is not kept: the next turn reaches no company with it.
    assert principal.principal_token("dep-shopper") is None
