# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""An application that is a company personal agents work with (PAP_DATALAYER B-04).

Asked through the company service, a declared operation is proposed, never
made; made only in the turn its confirmation was redeemed for, with the
confirmed terms, once. Outside such a turn the rules decide as always.
"""

import pytest

from agent_runtimes.loop.apps.enforcement import AppRuleBlockedError
from agent_runtimes.loop.apps.pap_company import (
    PapTurn,
    Performing,
    enter_pap_turn,
    leave_pap_turn,
    pact_turn_said,
    pap_artifacts,
    pap_turn_of,
    summary_of,
)
from agent_runtimes.specs.apps import APP_CATALOGUE
from agent_runtimes.tests.test_apps_enforcement import Harness
from agent_runtimes.types import AppSpec

SEND = "google-workspace__send_gmail_message"
SEARCH = "google-workspace__search_gmail_messages"
TERMS = {"to": "marta@example.com", "subject": "Your exchange"}


def company() -> AppSpec:
    triage = APP_CATALOGUE["inbox-triage"]
    return AppSpec.model_validate(
        {
            **triage.model_dump(by_alias=True),
            "pap": {
                "company": {
                    "enabled": True,
                    "extensions": ["operations"],
                    "operations": [
                        {
                            "action": "mail.send",
                            "tool": SEND,
                            "summary": "Send {subject} to {to}",
                        }
                    ],
                }
            },
        }
    )


@pytest.fixture
def turn():  # type: ignore[no-untyped-def]
    current = PapTurn()
    token = enter_pap_turn(current)
    yield current
    leave_pap_turn(token)


@pytest.mark.asyncio
async def test_a_declared_operation_is_proposed_not_made(turn: PapTurn) -> None:
    harness = Harness(company())
    with pytest.raises(AppRuleBlockedError, match="Proposed to the person, not done"):
        await harness.call(SEND, TERMS)
    # Nobody was asked and nothing ran: the person confirms at the company.
    assert harness.asked == []
    assert turn.proposals == [
        {
            "action": "mail.send",
            "summary": "Send Your exchange to marta@example.com",
            "terms": TERMS,
        }
    ]
    [artifact] = pap_artifacts(turn)
    assert artifact["parts"][0]["data"] == {"pap_operation": turn.proposals[0]}
    # Reading is done as always.
    assert await harness.call(SEARCH, {"query": "is:unread"}) == {"query": "is:unread"}


@pytest.mark.asyncio
async def test_outside_a_company_turn_the_rules_decide_as_always() -> None:
    harness = Harness(company())
    assert await harness.call(SEND, TERMS) == TERMS
    assert [tool for tool, _ in harness.asked] == [SEND]


@pytest.mark.asyncio
async def test_the_confirmed_call_is_made_once_with_its_terms(turn: PapTurn) -> None:
    turn.ticket = "t-1"
    turn.performing = Performing(action="mail.send", tool=SEND, terms=dict(TERMS))
    harness = Harness(company())
    with pytest.raises(
        AppRuleBlockedError, match="Only the operation the person confirmed"
    ):
        await harness.call(SEND, {**TERMS, "to": "someone@else.example"})
    assert await harness.call(SEND, TERMS) == TERMS
    # Confirmed once, made once; and nobody was asked again.
    with pytest.raises(AppRuleBlockedError):
        await harness.call(SEND, TERMS)
    assert harness.asked == []
    assert turn.proposals == []
    [artifact] = pap_artifacts(turn)
    assert artifact["parts"][0]["data"] == {
        "pap_performed": {"action": "mail.send", "done": True}
    }


@pytest.mark.asyncio
async def test_a_tool_the_appspec_does_not_declare_for_the_action_is_not_made(
    turn: PapTurn,
) -> None:
    turn.ticket = "t-2"
    turn.performing = Performing(action="mail.send", tool=SEARCH, terms={"query": "x"})
    harness = Harness(company())
    with pytest.raises(AppRuleBlockedError):
        await harness.call(SEND, TERMS)
    # Reading stays possible; the mismatched call never counts as the operation.
    assert await harness.call(SEARCH, {"query": "x"}) == {"query": "x"}
    assert turn.performing.done is False


def test_a_message_names_its_company_turn_and_a_ticket_only_when_performing() -> None:
    assert pap_turn_of({"other": {}}) is None
    assert pap_turn_of({"pap": {"account": "a", "client_id": "c"}}).ticket == ""
    assert pap_turn_of({"pap": {"perform": {"ticket": "t-9"}}}).ticket == "t-9"
    assert summary_of("Send {subject} to {to}", {"to": "x"}) == "Send ? to x"


ISSUER = "https://prod1.datalayer.run/api/iam/v1/pap/agents/01ERRAND"


def test_a_turn_asked_of_its_pact_business_says_who_asks_for_whom_and_what_was_granted() -> (
    None
):
    # Found on r1, 13 October 2026 (AGENT_PROTOCOLS PR-13): never told, the business
    # answered a person who had signed in and granted profile:read that nobody had.
    for_person = {
        "pact": {
            "personal_agent": ISSUER,
            "person": "01ADA",
            "scopes": ["profile:read"],
        }
    }
    assert pact_turn_said(for_person) == (
        f"[Asked over PACT by the personal agent {ISSUER} for a person signed in with Datalayer, "
        "their account 01ADA, who granted it: profile:read.]"
    )
    alone = {"pact": {"personal_agent": ISSUER, "person": None, "scopes": []}}
    assert pact_turn_said(alone) == (
        f"[Asked over PACT by the personal agent {ISSUER}, as itself: "
        "no person signed in here, so it holds no permission for anyone.]"
    )
    # Nothing said for a message that is not a business's turn, or names no personal agent.
    assert pact_turn_said({"pap": {}}) == ""
    assert pact_turn_said({"pact": {"person": "01ADA"}}) == ""
    assert pact_turn_said(None) == ""


def test_a_visitor_never_says_for_whom_a_business_is_asked() -> None:
    from agent_runtimes.guardrails.model_budget import DELEGATION_META_KEY
    from agent_runtimes.loop.apps.visitors import A2A_VISITOR_FIELD

    forged = {
        "pact": {
            "personal_agent": ISSUER,
            "person": "01ADA",
            "scopes": ["profile:read"],
        },
        DELEGATION_META_KEY: {A2A_VISITOR_FIELD: "visitor-1"},
    }
    assert pact_turn_said(forged) == ""


def test_the_runtime_tells_the_application_before_the_request() -> None:
    from pathlib import Path

    transport = (Path(__file__).parent.parent / "transports" / "a2a.py").read_text()
    assert "asked_for = pact_turn_said(meta)" in transport
    assert 'prompt = f"{asked_for}\\n\\n{prompt}"' in transport
