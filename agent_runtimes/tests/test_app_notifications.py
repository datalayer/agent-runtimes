# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's notifications go through the channels it names (LOOP R-37).

When a rule or a Gate asks a person through the tool-approval path, the
channels of the application's ``notifications`` are told — through ai-agents,
with the principal's token on a deployment, with the person's in a Preview —
and each channel's outcome is written to its record; a channel Datalayer does
not offer is refused here in R-27's words. ai-agents is faked over HTTP, the
tool-approval path with its own method.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import pytest

from agent_runtimes.loop.apps.enforcement import AppRulesCapability
from agent_runtimes.loop.apps.guards import AppChecks, AppChecksCapability
from agent_runtimes.loop.apps.loading import load_app
from agent_runtimes.loop.apps.notifications import (
    APPROVAL_REQUESTED,
    AppNotifier,
    send_to_ai_agents,
)
from agent_runtimes.loop.apps.principal import (
    forget_principal_token,
    give_principal_token,
)
from agent_runtimes.loop.apps.record import AppRecorder
from agent_runtimes.loop.apps.rules import ASK_FIRST, Decision
from agent_runtimes.tests.test_agents_create_integration import (  # noqa: F401 - a fixture
    _DummyRequest,
    creation_spy,
)

APP: dict[str, Any] = {
    "schema": "loop.app/v1",
    "id": "triage",
    "name": "Inbox triage",
    "kind": "worker",
    "agent": "cog-crawler:0.0.1",
    "goal": "Sort the inbox.",
    "triggers": [{"type": "once", "at": "launch"}],
    "notifications": ["email", "slack:0.0.1", "teams"],
    "record": {"include": ["actions"]},
}


class AiAgents:
    """Fake ai-agents' `/apps/notifications`, over HTTP: what it was asked, what it answers."""

    def __init__(self) -> None:
        self.asked: list[httpx.Request] = []
        self.status = 200

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.asked.append(request)
        if self.status != 200:
            return httpx.Response(self.status, json={"detail": "refused"})
        body = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "success": True,
                "channels": [
                    {"channel": channel, "delivery": "sent", "detail": "ok"}
                    for channel in body["channels"]
                ],
            },
        )

    def body(self, index: int = 0) -> dict[str, Any]:
        return json.loads(self.asked[index].content)


@pytest.fixture
def ai_agents(monkeypatch):
    fake = AiAgents()
    real = httpx.AsyncClient

    def client(*args, **kwargs):
        return real(*args, transport=httpx.MockTransport(fake.handle), **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client)
    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", "https://ai-agents.example")
    monkeypatch.setenv("DATALAYER_USER_TOKEN", "the-persons-token")
    forget_principal_token("dep-1")
    yield fake
    forget_principal_token("dep-1")


def _notifier(deployment: str = "") -> tuple[AppNotifier, AppRecorder]:
    app = load_app(APP)
    sent: list[dict] = []

    async def keep(body: dict) -> None:
        sent.append(body)

    recorder = AppRecorder(
        app=app, app_uid="app-1", deployment_uid=deployment, send=keep
    )
    recorder.start("s-1")
    notifier = AppNotifier(
        app=app, recorder=recorder, app_uid="app-1", deployment_uid=deployment
    )
    return notifier, recorder


def _recorded(recorder: AppRecorder) -> list[dict]:
    return [e for e in recorder._pending.get("s-1", []) if e["kind"] == "notification"]


def test_a_deployment_sends_as_its_principal_through_the_channels_it_names(ai_agents):
    give_principal_token("dep-1", "narrowed", expires_in=3600)
    notifier, recorder = _notifier("dep-1")
    asyncio.run(notifier.approval_asked("gmail_send", "Sending a mail asks you first."))
    request = ai_agents.asked[0]
    assert (
        str(request.url)
        == "https://ai-agents.example/api/ai-agents/v1/apps/notifications"
    )
    assert request.headers["authorization"] == "Bearer narrowed"
    body = ai_agents.body()
    # The application's channels, versions dropped; Teams not sent: not offered.
    assert body["channels"] == ["email", "slack"]
    assert body["event"] == APPROVAL_REQUESTED
    assert body["app_uid"] == "app-1" and body["deployment_uid"] == "dep-1"
    assert body["session_uid"] == "s-1"
    assert body["title"] == "Inbox triage asks before it acts"
    assert (
        "gmail_send" in body["message"]
        and "Sending a mail asks you first." in body["message"]
    )
    # Each channel's outcome in the record, though `record.include` names none of them.
    recorded = _recorded(recorder)
    assert [(e["payload"]["channel"], e["payload"]["delivery"]) for e in recorded] == [
        ("teams", "refused"),
        ("email", "sent"),
        ("slack", "sent"),
    ]
    assert recorded[0]["payload"]["detail"] == (
        "Teams is not offered as a channel yet: nothing Inbox triage sends reaches it."
    )


def test_a_preview_sends_as_the_person(ai_agents):
    notifier, _ = _notifier()
    asyncio.run(notifier.approval_asked("gmail_send", "Asks first."))
    assert ai_agents.asked[0].headers["authorization"] == "Bearer the-persons-token"
    assert ai_agents.body()["deployment_uid"] == ""


def test_a_deployment_without_its_principal_s_token_sends_nothing_and_says_so(
    ai_agents,
):
    notifier, recorder = _notifier("dep-1")
    outcomes = asyncio.run(
        notifier.notify(APPROVAL_REQUESTED, title="Asks", message="Asks first.")
    )
    assert ai_agents.asked == []
    failed = [o for o in outcomes if o["channel"] in ("email", "slack")]
    assert {o["delivery"] for o in failed} == {"failed"}
    assert all("nobody's name" in o["detail"] for o in failed)
    assert len(_recorded(recorder)) == 3


def test_ai_agents_refusing_is_recorded_not_raised(ai_agents):
    ai_agents.status = 403
    notifier, recorder = _notifier()
    asyncio.run(notifier.approval_asked("gmail_send", "Asks first."))
    sent = [
        e["payload"] for e in _recorded(recorder) if e["payload"]["channel"] != "teams"
    ]
    assert {p["delivery"] for p in sent} == {"failed"}
    assert all("403" in p["detail"] for p in sent)


def test_an_application_that_names_no_channel_sends_nothing(ai_agents):
    app = load_app({**APP, "notifications": []})
    assert (
        asyncio.run(
            AppNotifier(app=app).notify(APPROVAL_REQUESTED, title="x", message="y")
        )
        == []
    )
    assert ai_agents.asked == []


def test_send_to_ai_agents_answers_each_channel(ai_agents):
    answered = asyncio.run(
        send_to_ai_agents({"deployment_uid": "", "channels": ["email"]})
    )
    assert answered == [{"channel": "email", "delivery": "sent", "detail": "ok"}]


# --- when it is told: a person asked through the tool-approval path -----------------


@pytest.fixture
def approvals(monkeypatch):
    from agent_runtimes.guardrails.tool_approvals import ToolApprovalManager

    asked: list[str] = []

    async def request_and_wait(
        self, tool_name: str, tool_args: dict, **kwargs: Any
    ) -> Any:
        asked.append(tool_name)
        return None

    monkeypatch.setattr(ToolApprovalManager, "request_and_wait", request_and_wait)
    return asked


def test_a_rule_that_asks_tells_the_channels_before_asking(approvals):
    told: list[tuple[str, str]] = []

    async def notify(tool: str, sentence: str) -> None:
        assert approvals == [], "told before the question waits"
        told.append((tool, sentence))

    rules = AppRulesCapability(app=load_app(APP), notify=notify)
    decision = Decision(ASK_FIRST, "gmail_send", ("send",), "rule")
    asyncio.run(rules._ask("gmail_send", {}, decision))
    assert told == [("gmail_send", decision.sentence)]
    assert approvals == ["gmail_send"]


def test_a_question_asked_in_the_session_itself_tells_no_channel(approvals):
    told: list[str] = []

    async def notify(tool: str, sentence: str) -> None:
        told.append(tool)

    async def ask(tool: str, args: dict, decision: Decision) -> None:
        return None

    rules = AppRulesCapability(app=load_app(APP), notify=notify, ask=ask)
    asyncio.run(
        rules._ask(
            "gmail_send", {}, Decision(ASK_FIRST, "gmail_send", ("send",), "rule")
        )
    )
    assert told == [] and approvals == []


def test_a_gate_that_asks_tells_the_channels(approvals):
    told: list[tuple[str, str]] = []

    async def notify(tool: str, sentence: str) -> None:
        told.append((tool, sentence))

    checks = AppChecksCapability(checks=AppChecks.of(load_app(APP)), notify=notify)
    asyncio.run(checks._ask("gmail_send", {}, "A person reads it first."))
    assert told == [("gmail_send", "A person reads it first.")]
    assert approvals == ["gmail_send"]


# --- the agent the runtime makes for an application ------------------------------------


def test_an_applications_agent_is_given_its_channels_not_its_agents(
    creation_spy: dict[str, Any],
) -> None:
    from agent_runtimes.notifications import NotificationsCapability
    from agent_runtimes.routes.agents import CreateAgentRequest, create_agent

    spy = creation_spy
    request = CreateAgentRequest(
        name="triage-notifies",
        transport="vercel-ai",
        # An agent whose own spec names channels: an application's are used instead.
        app_spec={**APP, "agent": "example-notifications:0.0.1"},
        app_instance={"app_uid": "app-1"},
    )
    asyncio.run(create_agent(request, _DummyRequest()))
    capabilities = spy["pydantic_kwargs"]["capabilities"]
    assert not any(isinstance(c, NotificationsCapability) for c in capabilities)
    rules = next(c for c in capabilities if isinstance(c, AppRulesCapability))
    checks = next(c for c in capabilities if isinstance(c, AppChecksCapability))
    assert rules.notify is not None and checks.notify is not None
    notifier = rules.notify.__self__
    assert isinstance(notifier, AppNotifier)
    assert notifier.channels() == ["email", "slack", "teams"]
    assert notifier.app_uid == "app-1" and notifier.deployment_uid == ""
