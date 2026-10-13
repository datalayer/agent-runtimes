# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""The companies an application works with as a personal agent (PAP_DATALAYER ADR-1, B-02, B-03).

Each is the gateway's `pap` toolset for that company, reached in the
person's name, its tools named with the company; the Rules decide them by
the gateway's own table, and a connection that reads gives only what reads.
"""

import pytest

from agent_runtimes.loop.apps import pap_connections
from agent_runtimes.loop.apps.enforcement import AppRuleBlockedError
from agent_runtimes.mcp.datalayer_gateway import toolsets_for_the_run
from agent_runtimes.specs.apps import APP_CATALOGUE
from agent_runtimes.tests.test_apps_enforcement import Harness
from agent_runtimes.types import AppSpec


def app() -> AppSpec:
    triage = APP_CATALOGUE["inbox-triage"]
    return AppSpec.model_validate(
        {
            **triage.model_dump(by_alias=True),
            "pap": {
                "connections": [
                    {
                        "id": "orders",
                        "company": "manzanita.example",
                        "access": "write",
                        "as": "user",
                    },
                    {"id": "books", "company": "Ledgerly.example", "access": "read"},
                ]
            },
        }
    )


@pytest.fixture(autouse=True)
def clean():  # type: ignore[no-untyped-def]
    pap_connections.forget()
    yield
    pap_connections.forget()


def test_each_company_is_the_gateways_pap_toolset_in_the_persons_name() -> None:
    pap_connections.remember_agent("agent-1", app())
    companies = pap_connections.companies_of_agent("agent-1")
    assert companies == (
        ("pap_ledgerly_example", "user"),
        ("pap_manzanita_example", "user"),
    )
    built = toolsets_for_the_run(
        [], "principal-token", users_token="person-token", companies=companies
    )
    assert [toolset.prefix for toolset in built] == [
        "pap_ledgerly_example",
        "pap_manzanita_example",
    ]
    transport = built[1].wrapped.client.transport
    assert transport.url.endswith("/mcp?only=pap&pap-company=manzanita.example")
    # In the person's name: their token, never the application's own.
    assert (
        transport.httpx_client_factory().headers["authorization"]
        == "Bearer person-token"
    )
    # Forgotten with its application.
    pap_connections.remember_agent("agent-1", None)
    assert pap_connections.companies_of_agent("agent-1") == ()


def test_a_company_reached_as_its_owner_is_reached_with_the_applications_token() -> (
    None
):
    spec = app().model_copy(deep=True)
    spec.pap.connections[0]["as"] = "owner"
    pap_connections.remember_agent("agent-2", spec)
    built = toolsets_for_the_run(
        [],
        "principal-token",
        users_token="person-token",
        companies=pap_connections.companies_of_agent("agent-2"),
    )
    assert (
        built[1]
        .wrapped.client.transport.httpx_client_factory()
        .headers["authorization"]
        == "Bearer principal-token"
    )


@pytest.mark.asyncio
async def test_the_rules_decide_a_companys_tools_by_what_they_do() -> None:
    spec = app()
    pap_connections.remember_agent("agent-3", spec)
    harness = Harness(spec)
    ask = "pap_manzanita_example_pap_ask"
    assert await harness.call(ask, {"message": "Where is my order?"}) == {
        "message": "Where is my order?"
    }
    # A message to the company goes out in the person's name: `send` (R-02, decided 13 October 2026).
    assert harness.recorded[-1].decision.classes == ("send",)
    assert pap_connections.classes_of("pap_manzanita_example_pap_confirm") == (
        "write",
        "buy",
    )
    # A connection that reads gives only what reads.
    capability = harness.capability
    assert capability.given("pap_ledgerly_example_pap_read") is True
    # Sending is not reading: a connection that only reads does not converse (U-15's rule).
    assert capability.given("pap_ledgerly_example_pap_ask") is False
    assert capability.given("pap_ledgerly_example_pap_confirm") is False
    assert capability.given("pap_manzanita_example_pap_confirm") is True
    assert pap_connections.classes_of("pap_unknown_example_pap_ask") is None


@pytest.mark.asyncio
async def test_a_confirmation_is_asked_once_by_the_gateway_with_the_terms() -> None:
    spec = app().model_copy(
        update={
            "rules": [
                AppSpec.model_validate(
                    {
                        **app().model_dump(by_alias=True),
                        "rules": [
                            {
                                "action": "Buy or change things",
                                "applies_to": ["write", "buy"],
                                "behaviour": "ask_first",
                            }
                        ],
                    }
                ).rules[0]
            ]
        }
    )
    pap_connections.remember_agent("agent-4", spec)
    # Whatever rule would ask first, the runtime does not: the gateway asks the
    # person with the company's own terms, once (PAP_DATALAYER R-04, R-05).
    harness = Harness(spec)
    args = {"operation_ref": "op_1", "revision": 1}
    # *Ask me first* reaches the gateway, whatever the model sent: no approval
    # in advance stands in for the person there.
    sent = {**args, "ask_the_person": False}
    assert await harness.call("pap_manzanita_example_pap_confirm", sent) == {
        **args,
        "ask_the_person": True,
    }
    assert harness.asked == []
    assert harness.recorded[-1].decision.because == "the_gateway_asks_the_person"
    # *Do it if I asked*: the gateway asks unless an approval in advance covers the terms.
    if_asked = spec.model_copy(
        update={"rules": [spec.rules[0].model_copy(update={"behaviour": "if_asked"})]}
    )
    pap_connections.remember_agent("agent-5", if_asked)
    harness = Harness(if_asked)
    assert await harness.call(
        "pap_manzanita_example_pap_confirm", {**args, "ask_the_person": True}
    ) == {**args, "ask_the_person": False}
    assert (
        harness.recorded[-1].decision.because
        == "the_gateway_asks_unless_approved_in_advance"
    )
    # What the Maker leaves to the person stays theirs, at the company.
    with pytest.raises(AppRuleBlockedError) as refused:
        await Harness(app()).call("pap_manzanita_example_pap_confirm", args)
    assert "nothing was confirmed" in str(refused.value)
    assert "https://manzanita.example" in str(refused.value)


def test_the_pap_tools_are_classed_as_agentspecs_classes_them() -> None:
    """AGENT_PROTOCOLS PR-54: the runtime's table is agentspecs' `protocol-tools`,
    generated — the gateway reads the same — and every commerce operation too."""
    from agentspecs.actions import protocol_tool_classes, protocol_tool_names

    from agent_runtimes.loop.apps.pap_connections import TOOL_CLASSES
    from agent_runtimes.protocols.agentic_commerce import (
        ACTION_CLASSES as ACP_CLASSES,
    )
    from agent_runtimes.protocols.ucp import ACTION_CLASSES as UCP_CLASSES

    def of(protocol: str) -> dict:
        return {
            name: tuple(item.value for item in protocol_tool_classes(protocol, name))
            for name in protocol_tool_names(protocol)
        }

    assert TOOL_CLASSES == of("pap")
    assert TOOL_CLASSES["pap_confirm"] == ("write", "buy")
    # The tables name the gateway's tools; the clients' operations are the same without the prefix.
    assert {f"ucp_{name}": (cls,) for name, cls in UCP_CLASSES.items()} == of("ucp")
    assert {f"acp_{name}": (cls,) for name, cls in ACP_CLASSES.items()} == of(
        "agentic-commerce"
    )


def business() -> AppSpec:
    """Travel Desk: a person's agent at Example Air over PACT (AGENT_PROTOCOLS PI-20)."""
    return APP_CATALOGUE["travel-desk"].model_copy(deep=True)


def test_a_pact_business_is_the_gateways_pact_toolset_in_the_persons_name() -> None:
    spec = business()
    assert [c["brand"] for c in spec.pact.connections] == ["air.examples.datalayer.run"]
    pap_connections.remember_agent("agent-6", spec)
    companies = pap_connections.companies_of_agent("agent-6")
    assert companies == (("pact_air_examples_datalayer_run", "user"),)
    assert pap_connections.protocol_of("pact_air_examples_datalayer_run") == "pact"
    assert pap_connections.domain_of("pact_air_examples_datalayer_run") == "air.examples.datalayer.run"
    (built,) = toolsets_for_the_run(
        [], "principal-token", users_token="person-token", companies=companies
    )
    assert built.prefix == "pact_air_examples_datalayer_run"
    transport = built.wrapped.client.transport
    assert transport.url.endswith("/mcp?only=pact&pact-brand=air.examples.datalayer.run")
    assert (
        transport.httpx_client_factory().headers["authorization"]
        == "Bearer person-token"
    )


@pytest.mark.asyncio
async def test_the_rules_decide_a_businesss_pact_tools_by_what_they_do() -> None:
    spec = business()
    pap_connections.remember_agent("agent-7", spec)
    harness = Harness(spec)
    ask = "pact_air_examples_datalayer_run_pact_ask"
    assert await harness.call(ask, {"message": "When is my flight?"}) == {
        "message": "When is my flight?"
    }
    assert harness.recorded[-1].decision.classes == ("read",)
    assert pap_connections.classes_of("pact_air_examples_datalayer_run_pact_ask_for_person") == (
        "write",
    )
    # A PAP tool's name under a PACT server is no tool of it.
    assert pap_connections.classes_of("pact_air_examples_datalayer_run_pap_confirm") is None
    # The level of its connection decides what is given.
    access = spec.pact.connections[0].get("access") or "read"
    given = harness.capability.given("pact_air_examples_datalayer_run_pact_ask_for_person")
    assert given is (access == "write")
    assert harness.capability.given("pact_air_examples_datalayer_run_pact_ask") is True


def test_a_pact_server_is_named_apart_from_a_pap_one() -> None:
    assert pap_connections.server_id("air.example", "pact") == "pact_air_example"
    assert pap_connections.server_id("air.example") == "pap_air_example"
    assert pap_connections.server_id("store.example", "ucp") == "ucp_store_example"
    with pytest.raises(ValueError, match="no gateway toolset"):
        pap_connections.server_id("air.example", "tap")


def shop() -> AppSpec:
    """Shopping Desk: a person's agent at Example Store over UCP (AGENT_PROTOCOLS PI-20)."""
    spec = APP_CATALOGUE["shopping-desk"].model_copy(deep=True)
    # Example Outfitters only read: a connection that reads buys nothing.
    store, outfitters = spec.commerce.merchants
    spec.commerce.merchants = [
        store,
        {"id": outfitters["id"], "protocol": "acp", "merchant": outfitters["merchant"]},
    ]
    return spec


def test_a_merchant_is_the_gateways_commerce_toolset_in_the_persons_name() -> None:
    pap_connections.remember_agent("agent-8", shop())
    companies = pap_connections.companies_of_agent("agent-8")
    assert companies == (
        ("acp_outfitters_examples_datalayer_run", "user"),
        ("ucp_store_examples_datalayer_run", "user"),
    )
    assert pap_connections.protocol_of("ucp_store_examples_datalayer_run") == "ucp"
    built = toolsets_for_the_run(
        [], "principal-token", users_token="person-token", companies=companies
    )
    urls = sorted(each.wrapped.client.transport.url for each in built)
    assert urls[0].endswith("/mcp?only=acp&acp-merchant=outfitters.examples.datalayer.run")
    assert urls[1].endswith("/mcp?only=ucp&ucp-merchant=store.examples.datalayer.run")


@pytest.mark.asyncio
async def test_a_purchase_is_always_asked_by_the_gateway_never_twice() -> None:
    """Decided 2026-10-13: whatever the rule on buying says, the gateway asks the
    person with the exact checkout; the runtime does not ask again. A connection
    that only reads buys nothing."""
    spec = shop()
    pap_connections.remember_agent("agent-9", spec)
    assert pap_connections.classes_of("ucp_store_examples_datalayer_run_ucp_complete") == ("buy",)
    assert pap_connections.is_purchase("ucp_store_examples_datalayer_run_ucp_complete")
    assert not pap_connections.is_purchase("ucp_store_examples_datalayer_run_ucp_search")
    for behaviour in ("do_it", "ask_first", "if_asked"):
        decided = spec.model_copy(
            update={
                "rules": [
                    rule.model_copy(update={"behaviour": behaviour})
                    for rule in spec.rules
                ]
            }
        )
        pap_connections.remember_agent("agent-9", decided)
        harness = Harness(decided)
        args = {"checkout_id": "chk_1"}
        assert await harness.call("ucp_store_examples_datalayer_run_ucp_complete", args) == args
        assert harness.asked == []
        assert harness.recorded[-1].decision.because == "the_gateway_asks_the_person"
    harness = Harness(spec)
    assert harness.capability.given("ucp_store_examples_datalayer_run_ucp_complete") is True
    assert harness.capability.given("acp_outfitters_examples_datalayer_run_acp_complete") is False
    assert harness.capability.given("acp_outfitters_examples_datalayer_run_acp_get_checkout") is True
