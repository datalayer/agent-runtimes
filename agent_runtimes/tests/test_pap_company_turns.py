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

from typing import Any

import pytest
from pydantic_ai import Agent
from pydantic_ai.exceptions import SkipToolExecution
from pydantic_ai.messages import (
    ModelMessage,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agent_runtimes.loop.apps.enforcement import AppRuleBlockedError
from agent_runtimes.loop.apps.pap_company import (
    PapTurn,
    Performing,
    asked_for_said,
    enter_pap_turn,
    leave_pap_turn,
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
def turn():
    current = PapTurn()
    token = enter_pap_turn(current)
    yield current
    leave_pap_turn(token)


@pytest.mark.asyncio
async def test_a_declared_operation_is_proposed_not_made(turn: PapTurn) -> None:
    harness = Harness(company())
    with pytest.raises(SkipToolExecution) as skipped:
        await harness.call(SEND, TERMS)
    # The sentence is the tool's result: the run goes on and the model tells the person.
    assert skipped.value.result == (
        "Proposed to the person, not done: Send Your exchange to marta@example.com. "
        "It is done only once they confirm these exact terms; tell them so."
    )
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
async def test_a_proposal_does_not_end_the_turn(turn: PapTurn) -> None:
    # Found on r1, 13 October 2026: Exchange Desk's exchange_order, proposed in
    # a personal agent's turn over A2A, raised out of the run, which failed
    # whole (*The application could not answer just now*), nothing proposed.
    ran: list[dict] = []
    returned: list[ToolReturnPart] = []

    def model(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        returns = [
            part
            for message in messages
            for part in message.parts
            if isinstance(part, ToolReturnPart)
        ]
        if not returns:
            return ModelResponse(parts=[ToolCallPart(SEND, TERMS)])
        returned.extend(returns)
        return ModelResponse(parts=[TextPart("Proposed: confirm it to have it sent.")])

    harness = Harness(company())
    agent = Agent(FunctionModel(model), capabilities=[harness.capability])

    @agent.tool_plain(name=SEND)
    def send(to: str, subject: str) -> str:
        ran.append({"to": to, "subject": subject})
        return "sent"

    result = await agent.run("Send Marta her exchange.")
    assert result.output == "Proposed: confirm it to have it sent."
    assert ran == []
    [said] = returned
    assert str(said.content).startswith(
        "Proposed to the person, not done: Send Your exchange"
    )
    assert [proposal["action"] for proposal in turn.proposals] == ["mail.send"]
    # Its Rule's decision is in the record, as every decision is (found on r1,
    # 14 October 2026: Exchange Desk's proposal left none).
    assert [enforced.tool_name for enforced in harness.recorded] == [SEND]


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
    reading = pap_turn_of({"pap": {"account": "a", "client_id": "c"}})
    assert reading is not None and reading.ticket == ""
    performing = pap_turn_of({"pap": {"perform": {"ticket": "t-9"}}})
    assert performing is not None and performing.ticket == "t-9"
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
    assert asked_for_said(for_person) == (
        f"<asked-for>Asked over PACT by the personal agent {ISSUER} for a person signed in with Datalayer, "
        "their account 01ADA, who granted it: profile:read.</asked-for>"
    )
    alone: dict[str, Any] = {
        "pact": {"personal_agent": ISSUER, "person": None, "scopes": []}
    }
    assert asked_for_said(alone) == (
        f"<asked-for>Asked over PACT by the personal agent {ISSUER}, as itself: "
        "no person signed in here, so it holds no permission for anyone.</asked-for>"
    )
    # Nothing said for a message that is not a business's turn, or names no personal agent.
    assert (
        asked_for_said({"pap": {"perform": {"ticket": "t-9"}, "account": "acc-1"}})
        == ""
    )
    assert asked_for_said({"pact": {"person": "01ADA"}}) == ""
    assert asked_for_said(None) == ""


def test_under_profile_read_a_business_is_told_the_persons_handle_and_name() -> None:
    # Decided 2026-10-13 (AGENT_PROTOCOLS PR-13): profile:read tells a PACT business the
    # person's handle and display name, as ai-agents sends them; never without that grant.
    profile = {"handle": "ada", "name": "Ada Lovelace"}
    granted = {
        "pact": {
            "personal_agent": ISSUER,
            "person": "01ADA",
            "scopes": ["profile:read"],
            "profile": profile,
        }
    }
    assert asked_for_said(granted) == (
        f"<asked-for>Asked over PACT by the personal agent {ISSUER} for a person signed in with Datalayer, "
        "their account 01ADA (@ada, Ada Lovelace), who granted it: profile:read.</asked-for>"
    )
    not_granted = {"pact": {**granted["pact"], "scopes": ["trips:read"]}}
    assert "@ada" not in asked_for_said(not_granted)
    # A company's turn names the person by its own account alone.
    company = {
        "pap": {
            "account": "acc-1",
            "client_id": ISSUER,
            "scopes": ["profile:read"],
            "profile": profile,
        }
    }
    assert "@ada" not in asked_for_said(company)


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
    assert asked_for_said(forged) == ""


def test_the_runtime_tells_the_application_before_the_request() -> None:
    from pathlib import Path

    transport = (Path(__file__).parent.parent / "transports" / "a2a.py").read_text()
    assert "asked_for = asked_for_said(meta)" in transport
    assert 'prompt = f"{asked_for}\\n\\n{prompt}"' in transport


def test_a_turn_asked_of_its_company_says_who_asks_for_whom_and_what_was_granted() -> (
    None
):
    # Found on r1, 13 October 2026: never told, Exchange Desk asked a signed-in person to sign in.
    signed_in = {
        "pap": {
            "account": "acc-1",
            "client_id": ISSUER,
            "scopes": ["orders:read", "orders:write"],
        }
    }
    assert asked_for_said(signed_in) == (
        f"<asked-for>Asked over PAP by the personal agent {ISSUER} for a person signed in here, "
        "their account acc-1, who granted it: orders:read, orders:write.</asked-for>"
    )
    signed_out = {"pap": {"account": None, "client_id": ISSUER}}
    assert asked_for_said(signed_out) == (
        f"<asked-for>Asked over PAP by the personal agent {ISSUER}, as itself: "
        "no person signed in here, so it holds no permission for anyone.</asked-for>"
    )


@pytest.mark.asyncio
async def test_a_run_over_a2a_is_offered_the_tools_of_the_applications_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Found on r1, 13 October 2026: a personal agent asked Exchange Desk, shipped
    # with its app.py, to exchange an order, and its agent answered that it had
    # no exchange_order tool — a company's turn comes over A2A, outside a
    # session, and only a session added the tools of its code.
    from pathlib import Path

    import agentspecs

    from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter
    from agent_runtimes.loop.apps import principal, sessions
    from agent_runtimes.loop.apps.application import load_application_source
    from agent_runtimes.models import models

    source = Path(agentspecs.__file__).parent / "apps" / "exchange-desk" / "app.py"
    application = load_application_source(source.read_text(), "app.py")
    assert sessions.agent_code_toolset("a2a-desk") is None

    async def gateway(agent_id, toolsets, user_token):
        return list(toolsets)

    async def runtime_toolsets():
        return ["mcp"]

    monkeypatch.setattr(principal, "gateway_toolsets_of_the_run", gateway)
    monkeypatch.setattr(
        models, "app_instance_of", lambda agent_id: {"app_uid": "app-desk"}
    )
    adapter = PydanticAIAdapter.__new__(PydanticAIAdapter)
    adapter._agent_id = "a2a-desk"
    adapter._get_runtime_toolsets_async = runtime_toolsets  # type: ignore[method-assign]
    sessions.serve_agent_code("a2a-desk", application)
    try:
        mcp, own = await adapter._toolsets_of_the_run("persons-token")
        assert mcp == "mcp" and set(own.tools) == {"exchange_order"}
    finally:
        sessions.serve_agent_code("a2a-desk", None)
    # Without code, its runs are offered what they were.
    assert await adapter._toolsets_of_the_run("persons-token") == ["mcp"]
