# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application that is a PAP company: an operation is proposed, confirmed at its exact revision, performed once."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from agentspecs.apps import parse_app
from personal_agent_protocol.demo.kit import AgentIdentity
from personal_agent_protocol.models import Operation
from personal_agent_protocol.operations import approve, terms_digest

from agent_runtimes.loop.apps import Application
from agent_runtimes.loop.apps.pap_company import (
    PapTurn,
    Performing,
    enter_pap_turn,
    leave_pap_turn,
    pap_artifacts,
    performs,
    propose,
)

#: The one personal agent this company accepts: its `client_id` URL, as the
#: SDK's demo identity publishes it.
ATLAS = AgentIdentity(domain="atlas.example", name="Atlas").client_id

#: The Appspec: its `pap.company` block makes the application a company.
SPEC: dict[str, Any] = {
    "schema": "loop.app/v1",
    "id": "pap-company-role",
    "name": "PAP Company Role",
    "description": (
        "An application that is a company personal agents work with: an "
        "exchange is proposed, confirmed at its exact revision, done once."
    ),
    "kind": "chat",
    "agent": "example-blank:0.0.1",
    "instructions": (
        "Use explain_company_role. A chat message is never a confirmation: "
        "only the person confirms an operation's exact terms."
    ),
    "pap": {
        "company": {
            "enabled": True,
            # A personal agent may ask before the person signs in.
            "signed_out": True,
            "interfaces": ["agent", "openapi", "mcp"],
            "scopes": ["orders:read", "orders:write"],
            "extensions": ["operations"],
            "personal_agents": "registered",
            "registered_agents": [ATLAS],
            "operations": [
                {
                    "action": "orders.exchange",
                    "tool": "exchange_order",
                    "summary": "Exchange order {order_id} for size {size}",
                    "user_approval_required": True,
                }
            ],
        }
    },
}

app = Application.from_spec(SPEC)

#: What `exchange_order` did: the company's side effect, counted.
EXCHANGED: list[dict[str, Any]] = []


@app.tool(does="write")
async def exchange_order(order_id: str, size: str) -> dict[str, Any]:
    """Exchange an order for another size: the declared operation's tool."""

    EXCHANGED.append({"order_id": order_id, "size": size})
    return {"order_id": order_id, "size": size, "status": "exchanged"}


def _revision(proposal: dict[str, Any], revision: int) -> Operation:
    """The proposal as the company service shows it to the person: one revision."""

    return Operation(
        operation_id="op_exchange_A1001",
        revision=revision,
        state="proposed",
        summary=proposal["summary"],
        terms=proposal["terms"],
        expires_at=datetime(2026, 10, 25, tzinfo=timezone.utc),
        user_approval_required=True,
        confirmation=None,
        result=None,
    )


@app.tool(does="read")
async def explain_company_role() -> dict[str, Any]:
    """Walk one operation through the runtime's company gate; return only safe evidence."""

    spec = app.spec
    # The whole block, as agentspecs validates it; the runtime keeps the
    # operations, Datalayer's company service the rest.
    company = parse_app(dict(SPEC)).pap.company
    EXCHANGED.clear()

    # 1. A conversation turn asked by a personal agent: the model's call of the
    #    declared tool is proposed, never made.
    asked = PapTurn()
    token = enter_pap_turn(asked)
    try:
        first_said = propose(
            spec, "exchange_order", {"order_id": "A-1001", "size": "L"}
        )
        # Size L is out of stock: the next turn proposes the terms again, with XL.
        propose(spec, "exchange_order", {"order_id": "A-1001", "size": "XL"})
    finally:
        leave_pap_turn(token)
    [artifact] = pap_artifacts(asked)
    first, second = asked.proposals

    # 2. The company service shows the person each revision; they approved the
    #    first, which no longer matches what would be done.
    revision_1 = _revision(first, 1)
    revision_2 = _revision(second, 2)
    approval = approve(revision_1)
    stale = approval.revision != revision_2.revision or approval.digest != terms_digest(
        revision_2
    )
    confirmed = approve(revision_2)

    # 3. The perform turn, redeemed for the confirmed revision: the declared
    #    tool, with exactly those terms, once.
    performing = PapTurn(
        ticket="ticket-redeemed-once",
        performing=Performing(
            action=second["action"], tool="exchange_order", terms=second["terms"]
        ),
    )
    token = enter_pap_turn(performing)
    try:
        other_terms = performs(
            spec, "exchange_order", {"order_id": "A-1001", "size": "L"}
        )
        allowed = performs(spec, "exchange_order", second["terms"])
        if allowed:
            await exchange_order(**second["terms"])
        retried = performs(spec, "exchange_order", second["terms"])
    finally:
        leave_pap_turn(token)
    [performed] = pap_artifacts(performing)

    return {
        "company_enabled": company.enabled,
        "signed_out_allowed": company.signed_out,
        "interfaces": [interface.value for interface in company.interfaces],
        "scopes_offered": company.scopes,
        "personal_agents": company.personal_agents.value,
        "registered_agents": company.registered_agents,
        "declared_operations": [
            {
                "action": operation.action,
                "tool": operation.tool,
                "user_approval_required": operation.user_approval_required,
            }
            for operation in company.operations
        ],
        "the_model_was_told": first_said,
        "proposed_artifact_parts": [sorted(part["data"]) for part in artifact["parts"]],
        "proposed_summaries": [first["summary"], second["summary"]],
        "approval_of_revision_1_is_stale_for_revision_2": stale,
        "confirmed_revision": confirmed.revision,
        "other_terms_refused": other_terms is False,
        "confirmed_call_allowed": allowed is True,
        "retry_refused": retried is False,
        "performed": performed["parts"][0]["data"]["pap_performed"],
        "times_the_tool_ran": len(EXCHANGED),
    }
