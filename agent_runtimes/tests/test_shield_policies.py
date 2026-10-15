# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The policy side of SHIELD Phase 2 on the runtime (SH-50, SH-31, SH-32, SH-54, SH-35).

IAM's documents in force on a managed runtime and fail closed without them;
the organization's tightening over the Appspec's and the session's; a rule a
person adds to a running session, on a harness and on a pydantic-ai
application alike; the model budget soft then hard; the same action over
every face, the same answer.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List

import pytest
from agent_shield.policy import (
    Action,
    Harnesses,
    Limits,
    Policy,
    Rule,
    Threshold,
    class_of,
    decide,
    default_policy,
)
from agent_shield.saas import PolicyUnavailable, ServedPolicies
from fastapi.testclient import TestClient
from pydantic_ai import Agent
from pydantic_ai.messages import ModelResponse, TextPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agent_runtimes.adapters.acp_agent import HarnessRefused, harness_agent
from agent_runtimes.adapters.base import AgentContext
from agent_runtimes.guardrails import managed_policies
from agent_runtimes.guardrails.managed_policies import (
    account_of_token,
    runtime_policies,
)
from agent_runtimes.guardrails.session_rules import (
    SessionRuleRefused,
    SessionRules,
    session_rules,
    tightened,
)
from agent_runtimes.guardrails.shield_budget import (
    ShieldBudgetCapability,
    ShieldBudgetExceeded,
)
from agent_runtimes.guardrails.shield_policy import (
    harness_refusal,
    policies_in_force,
    policies_of,
)
from agent_runtimes.loop.apps import opening, plugins, principal, sessions
from agent_runtimes.loop.apps.loading import load_app
from agent_runtimes.loop.apps.plugins import rules_for
from agent_runtimes.loop.apps.record import _SESSION
from agent_runtimes.loop.apps.rules import SESSION_RULE
from agent_runtimes.routes import agents
from agent_runtimes.routes import apps as routes
from agent_runtimes.routes.agui import unregister_agui_agent
from agent_runtimes.tests.test_acp_agent import an_agent, fake_harness
from agent_runtimes.tests.test_app_sessions import (
    ASSISTANT,
    Runtime,
    Verifier,
    as_,
    events_of,
)

NOW = datetime.now(timezone.utc)

ORGANIZATION = Policy(
    scope="organization",
    version=2,
    rules=[Rule(name="execute asks", decision="ask", classes=["execute"])],
    limits=Limits(model_tokens=Threshold(soft=70, hard=150)),
    harnesses=Harnesses(admit=["fake", "claude-code"]),
)


def served(*policies: Policy, minutes: float = 10) -> ServedPolicies:
    expires = NOW + timedelta(minutes=minutes)
    return ServedPolicies(
        policies=[p.model_copy(update={"expires": expires}) for p in policies],
        expires=expires,
        versions={f"{p.scope}/org1": p.version for p in policies},
    )


class FakeIam:
    """IAM in a test: answers what it is told, or refuses."""

    def __init__(self, answer: Any) -> None:
        self.answer = answer
        self.calls = 0

    @property
    def where(self) -> str:
        return "IAM at https://iam.test"

    def fetch(self) -> ServedPolicies:
        self.calls += 1
        if isinstance(self.answer, Exception):
            raise self.answer
        return self.answer


@pytest.fixture
def managed() -> Iterator[FakeIam]:
    iam = FakeIam(served(ORGANIZATION))
    managed_policies.use_source(iam)
    runtime_policies().poll_seconds = 0.05
    yield iam
    managed_policies.use_source(None)
    runtime_policies().poll_seconds = 30.0
    session_rules().clear()


@pytest.fixture
def unmanaged(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.delenv("DATALAYER_USER_TOKEN", raising=False)
    managed_policies.use_source(None)
    yield
    session_rules().clear()


def act(kind: str, **fields: Any) -> Action:
    return Action(kind=kind, title=kind, **{"class": class_of(kind)}, **fields)


# --- SH-50: the documents from IAM, fail closed ----------------------------------------


class TestManagedFromIam:
    def test_iams_documents_decide_first_above_the_appspecs_and_the_default(
        self, managed: FakeIam
    ) -> None:
        policies = policies_in_force()
        assert [p.scope for p in policies] == ["organization", "session"]
        decision = decide(act("execute", command="pytest"), _ctx(), policies)
        assert (
            decision.verdict == "ask"
            and decision.scope == "organization"
            and decision.rule == "execute asks"
        )
        assert managed.calls == 1
        policies_in_force()
        assert managed.calls == 1, "the copy is honoured until it expires"

    def test_without_iam_and_without_a_copy_the_harness_is_refused_naming_iam(
        self, managed: FakeIam, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from agent_runtimes.specs import harnesses

        monkeypatch.setitem(harnesses.HARNESS_CATALOGUE, "fake", fake_harness())
        managed.answer = PolicyUnavailable(
            "IAM at https://iam.test could not be reached (timed out)"
        )
        managed_policies.use_source(managed)  # no copy yet
        with pytest.raises(HarnessRefused) as refused:
            harness_agent("a", "fake", workspace=tmp_path)
        assert str(refused.value) == (
            "The harness 'fake' is refused: The Shield cannot read its policy from IAM at https://iam.test "
            "(IAM at https://iam.test could not be reached (timed out)) and it holds no copy: no unexpired "
            "policy is held, so nothing is decided (SHIELD decision 11)."
        )

    def test_a_token_without_iams_url_is_refused_never_run_unmanaged(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        managed_policies.use_source(None)
        monkeypatch.delenv("DATALAYER_IAM_URL", raising=False)
        monkeypatch.setenv("DATALAYER_USER_TOKEN", "x.eyJ1aWQiOiAiYWNjdDEifQ.y")
        with pytest.raises(
            PolicyUnavailable, match="has a token but no DATALAYER_IAM_URL"
        ):
            policies_in_force()
        managed_policies.use_source(None)

    @pytest.mark.asyncio
    async def test_any_reader_on_a_managed_runtime_keeps_it_watching(
        self, managed: FakeIam
    ) -> None:
        policies_in_force()
        watcher = runtime_policies()._watcher
        assert watcher is not None and not watcher.done()
        managed.answer = served(ORGANIZATION.model_copy(update={"version": 5}))
        await asyncio.sleep(0.2)
        assert policies_in_force()[0].version == 5, (
            "the poll keeps the copy fresh for every reader"
        )
        runtime_policies().stop_watching()

    def test_an_unmanaged_runtime_decides_with_the_rules_and_the_default_alone(
        self, unmanaged: None
    ) -> None:
        assert [p.scope for p in policies_in_force()] == ["session"]
        assert not runtime_policies().is_managed

    def test_the_account_is_read_from_the_tokens_claims_in_every_layout(self) -> None:
        import base64
        import json

        def token(claims: Dict[str, Any]) -> str:
            body = (
                base64.urlsafe_b64encode(json.dumps(claims).encode())
                .decode()
                .rstrip("=")
            )
            return f"h.{body}.s"

        assert account_of_token(token({"user": {"uid": "u1"}})) == "u1"
        assert account_of_token(token({"sub": {"uid": "u2"}})) == "u2"
        assert account_of_token(token({"uid": "u3", "roles": []})) == "u3"
        assert account_of_token(token({"sub": "u4"})) == "u4"
        assert (
            account_of_token("not a token") == ""
            and account_of_token(token({"x": 1})) == ""
        )

    @pytest.mark.asyncio
    async def test_a_tightened_organization_policy_reaches_a_running_harness_and_an_outage_refuses_all(
        self, managed: FakeIam, tmp_path: Path
    ) -> None:
        agent = an_agent(
            tmp_path,
            policies=policies_in_force(),
            policy_maker=lambda m: policies_of(None, managed=m),
        )
        try:
            await agent.initialize()
            session, _ = await agent._session_for(
                AgentContext(session_id="s"), asyncio.Queue()
            )
            state = agent.sessions[session]
            assert (
                agent.decide(state, act("delete", path="a.py", inside=True)).verdict
                == "ask"
            )
            managed.answer = served(
                ORGANIZATION.model_copy(
                    update={
                        "version": 3,
                        "rules": [
                            *ORGANIZATION.rules,
                            Rule(name="no delete", decision="deny", classes=["delete"]),
                        ],
                    }
                )
            )
            await asyncio.sleep(0.3)
            decision = agent.decide(state, act("delete", path="a.py", inside=True))
            assert (
                decision.verdict == "deny"
                and decision.rule == "no delete"
                and decision.scope == "organization"
            )
            # The next pull fails with every copy expired: nothing is decided, in the sentence.
            managed.answer = PolicyUnavailable("IAM at https://iam.test answered 503")
            runtime_policies().managed().kept = served(ORGANIZATION, minutes=-1)  # type: ignore[union-attr]
            await asyncio.sleep(0.3)
            refused = agent.decide(state, act("read", path="a.py", inside=True))
            assert (
                refused.verdict == "deny"
                and "The Shield cannot read its policy from IAM at https://iam.test"
                in refused.sentence
            )
            assert "its copy expired" in refused.sentence
            # IAM back: in force again.
            managed.answer = served(ORGANIZATION)
            await asyncio.sleep(0.3)
            assert (
                agent.decide(state, act("read", path="a.py", inside=True)).verdict
                == "allow"
            )
        finally:
            await agent.cleanup()
        assert agent._stop_listening is None


# --- the harnesses an organization admits ----------------------------------------------


class TestAdmittedHarnesses:
    def test_a_harness_the_organization_does_not_admit_is_refused_in_a_sentence(
        self, managed: FakeIam, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from agent_runtimes.specs import harnesses

        monkeypatch.setitem(harnesses.HARNESS_CATALOGUE, "fake", fake_harness())
        policies = policies_in_force()
        assert harness_refusal(policies, "fake") is None
        assert harness_refusal(policies, "codex") == (
            "The harness 'codex' is refused: the harness 'codex' is not one the organization policy admits (fake, claude-code)."
        )
        managed.answer = served(
            ORGANIZATION.model_copy(update={"harnesses": Harnesses(admit=["codex"])})
        )
        managed_policies.use_source(managed)
        with pytest.raises(
            HarnessRefused, match="not one the organization policy admits"
        ):
            harness_agent("a", "fake", workspace=tmp_path)

    def test_the_platforms_credentials_rule_refuses_on_a_runtime_that_lends_the_accounts_own(
        self,
    ) -> None:
        platform = Policy(
            scope="organization", harnesses=Harnesses(credentials="platform")
        )
        assert "SHIELD decision 3" in str(
            harness_refusal([platform, default_policy()], "claude-code")
        )
        either = Policy(scope="organization", harnesses=Harnesses(credentials="either"))
        assert harness_refusal([either, default_policy()], "claude-code") is None


# --- SH-31: the three levels on the runtime -----------------------------------------------


def _ctx():
    from agent_shield.policy import Context

    return Context(workspace="/w")


class TestThreeLevels:
    def test_the_organizations_tightening_the_appspecs_and_the_default_in_every_order(
        self, managed: FakeIam
    ) -> None:
        from itertools import permutations
        from types import SimpleNamespace

        # The Appspec's Rules say *do it* on writing; the organization says writing asks.
        app = SimpleNamespace(
            rules=[
                SimpleNamespace(
                    action="write freely", applies_to=["write"], behaviour="do_it"
                )
            ]
        )
        organization = ORGANIZATION.model_copy(
            update={
                "rules": [Rule(name="writing asks", decision="ask", classes=["write"])]
            }
        )
        levels = policies_of(app, managed=[organization])
        assert [p.scope for p in levels] == ["organization", "team", "session"]
        for order in permutations(levels):
            decision = decide(
                act("edit", path="a.py", inside=True), _ctx(), list(order)
            )
            assert (decision.verdict, decision.scope, decision.rule) == (
                "ask",
                "organization",
                "writing asks",
            ), order
        # Without the organization's word, the Appspec's rule decides before the default.
        decision = decide(act("edit", path="a.py", inside=True), _ctx(), levels[1:])
        assert (decision.verdict, decision.scope, decision.rule) == (
            "allow",
            "team",
            "write freely",
        )


# --- SH-54: a rule added to a running session ----------------------------------------------


class TestSessionRules:
    def test_a_rule_tightens_and_one_that_would_loosen_the_organizations_is_refused(
        self,
    ) -> None:
        rules = SessionRules()
        above = [ORGANIZATION]
        rules.add(
            "s", Rule(name="no sends", decision="deny", classes=["send"]), above=above
        )
        with pytest.raises(SessionRuleRefused) as refused:
            rules.add(
                "s",
                Rule(name="run freely", decision="allow", classes=["execute"]),
                above=above,
            )
        assert str(refused.value).startswith(
            "The session rule is refused, it would permit more than the organization's policy: "
            "the session rule 'run freely' says do it where the organization rule 'execute asks' says ask me first"
        )
        rules.add(
            "s", Rule(name="no sends", decision="ask", classes=["send"]), above=above
        )
        assert [(r.name, r.decision) for r in rules.of("s")] == [("no sends", "ask")]
        rules.remove("s", "no sends")
        with pytest.raises(SessionRuleRefused, match="no rule named 'nope'"):
            rules.remove("s", "nope")
        rules.add("s", Rule(name="x", decision="deny"), above=above)
        rules.forget("s")
        assert rules.of("s") == []

    def test_a_pydantic_ai_calls_behaviour_is_the_strictest_of_the_apps_and_the_sessions(
        self, unmanaged: None
    ) -> None:
        session_rules().add(
            "s1", Rule(name="never write", decision="deny", classes=["write"]), above=[]
        )
        session_rules().add(
            "s1", Rule(name="ask to read", decision="ask", classes=["read"]), above=[]
        )
        assert tightened("s1", ["write"], "do_it") == ("leave_to_me", "never write")
        assert tightened("s1", ["read"], "do_it") == ("ask_first", "ask to read")
        assert tightened("s1", ["read"], "leave_to_me") == ("leave_to_me", None)
        assert tightened("", ["write"], "do_it") == ("do_it", None)
        assert tightened("s2", ["write"], "do_it") == ("do_it", None)
        app = load_app(ASSISTANT)
        token = _SESSION.set("s1")
        try:
            enforced = rules_for(app).decide(
                "write_computer_file", {"path": "a", "content": "b"}
            )
        finally:
            _SESSION.reset(token)
        assert (
            enforced.decision.behaviour == "leave_to_me"
            and enforced.decision.because == SESSION_RULE
        )
        assert (
            enforced.decision.sentence
            == "Your rule for this session “never write”: leave it to you."
        )

    @pytest.mark.asyncio
    async def test_a_harness_session_reads_the_persons_rules_at_every_decision(
        self, unmanaged: None, tmp_path: Path
    ) -> None:
        agent = an_agent(tmp_path)
        try:
            await agent.initialize()
            acp, _ = await agent._session_for(
                AgentContext(session_id="run-1"), asyncio.Queue()
            )
            state = agent.sessions[acp]
            assert (
                agent.decide(state, act("read", path="a.py", inside=True)).verdict
                == "allow"
            )
            session_rules().add(
                "run-1",
                Rule(name="no reads", decision="deny", classes=["read"]),
                above=[],
            )
            decision = agent.decide(state, act("read", path="a.py", inside=True))
            assert (
                decision.verdict == "deny"
                and decision.rule == "no reads"
                and decision.scope == "session"
            )
            in_force = agent.rules_in_force_of("run-1")
            assert in_force is not None and [
                r["name"] for r in in_force["session_rules"]
            ] == ["no reads"]
            assert agent.rules_in_force_of("other") is None
        finally:
            await agent.cleanup()


@pytest.fixture()
def runtime(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, unmanaged: None
) -> Iterator[Runtime]:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(plugins, "PLATFORM", plugins.PluginPlatform())
    monkeypatch.setattr(routes, "VERIFIER", Verifier())
    opening.use_opener(_lets_everybody_in)
    made = Runtime()
    yield made
    for agent_id in list(made.models):
        unregister_agui_agent(agent_id)
        agents._agentspecs.pop(agent_id, None)
    sessions.forget_sessions()
    principal.use_asker(None)
    opening.use_opener(None)


async def _lets_everybody_in(deployment: str, bearer: str):
    return 200, ""


@pytest.fixture()
def remote(runtime: Runtime) -> Iterator[TestClient]:
    from agent_runtimes.app import create_app

    with TestClient(create_app(), client=("10.0.0.4", 50000)) as client:
        yield client


class TestTheSessionRulesRoutes:
    def test_a_person_adds_tightens_reads_and_removes_a_rule_on_a_running_session(
        self, runtime: Runtime, remote: TestClient
    ) -> None:
        runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
        events_of(
            remote.post(
                "/api/v1/apps/sessions",
                headers=as_("ada"),
                json={
                    "agent": "notes-assistant",
                    "app_uid": "app-1",
                    "version": 3,
                    "opener": "Hello",
                    "session": "session-0001",
                },
            )
        )
        before = remote.get(
            "/api/v1/apps/sessions/session-0001/rules", headers=as_("ada")
        )
        assert before.status_code == 200, before.text
        assert before.json()["session_rules"] == [] and before.json()["harness"] is None
        assert [p["scope"] for p in before.json()["policies"]] == ["session"]
        added = remote.post(
            "/api/v1/apps/sessions/session-0001/rules",
            headers=as_("ada"),
            json={"name": "no sends", "decision": "deny", "classes": ["send"]},
        )
        assert added.status_code == 200, added.text
        assert [(r["name"], r["decision"]) for r in added.json()["session_rules"]] == [
            ("no sends", "deny")
        ]
        assert session_rules().of("session-0001")[0].name == "no sends"
        bad = remote.post(
            "/api/v1/apps/sessions/session-0001/rules",
            headers=as_("ada"),
            json={"name": "x", "decision": "maybe", "classes": ["send"]},
        )
        assert bad.status_code == 422 and "decision" in bad.json()["detail"]
        gone = remote.delete(
            "/api/v1/apps/sessions/session-0001/rules/no%20sends", headers=as_("ada")
        )
        assert gone.status_code == 200 and gone.json()["session_rules"] == []
        assert (
            remote.delete(
                "/api/v1/apps/sessions/session-0001/rules/nope", headers=as_("ada")
            ).status_code
            == 404
        )
        # Somebody else's session is not said to exist.
        assert (
            remote.get(
                "/api/v1/apps/sessions/session-0001/rules", headers=as_("bob")
            ).status_code
            == 404
        )
        remote.post(
            "/api/v1/apps/sessions/session-0001/rules",
            headers=as_("ada"),
            json={"name": "x", "decision": "deny"},
        )
        assert (
            remote.post(
                "/api/v1/apps/sessions/session-0001/end", headers=as_("ada")
            ).status_code
            == 200
        )
        assert session_rules().of("session-0001") == [], (
            "gone with the session (decision 7)"
        )


# --- SH-32: the budget, soft then hard -------------------------------------------------------


def _model(messages: Any, info: AgentInfo) -> ModelResponse:
    return ModelResponse(
        parts=[TextPart("an answer of a few words, as the fake model gives")]
    )


class TestTheModelBudget:
    @pytest.mark.asyncio
    async def test_a_budget_crossed_softly_asks_then_crossed_hard_refuses_with_what_would_let_it_go_on(
        self,
    ) -> None:
        asked: List[str] = []

        async def ask(sentence: str) -> None:
            asked.append(sentence)

        budget = ShieldBudgetCapability(
            policies=lambda: [ORGANIZATION, default_policy()],
            session=lambda: "s",
            ask=ask,
        )
        agent = Agent(FunctionModel(_model), capabilities=[budget])
        first = await agent.run("one")
        spent = first.usage.input_tokens + first.usage.output_tokens
        assert budget.spent("s") == {"model_tokens": spent, "spend": 0} and asked == []
        await agent.run("two")  # past the soft threshold of 70: asked once, allowed
        assert len(asked) == 1 and asked[0].startswith(
            "a model request: ask me first — the session's model tokens spent would reach"
        )
        assert (
            "past the soft limit of 70 in the organization policy; the hard limit is 150"
            in asked[0]
        )
        with pytest.raises(ShieldBudgetExceeded) as refused:
            await agent.run("three")
        assert (
            "over the hard limit of 150 in the organization policy; a cheaper model, a wider budget, or a person's word would let it go on"
            in str(refused.value)
        )
        assert len(asked) == 1, "the soft threshold asks once"

    @pytest.mark.asyncio
    async def test_a_person_refusing_at_the_soft_threshold_ends_the_run_in_the_sentence(
        self,
    ) -> None:
        from agent_runtimes.guardrails.common import GuardrailBlockedError

        async def refuse(sentence: str) -> None:
            raise GuardrailBlockedError("rejected by ada")

        budget = ShieldBudgetCapability(
            policies=lambda: [ORGANIZATION], session=lambda: "s", ask=refuse
        )
        agent = Agent(FunctionModel(_model), capabilities=[budget])
        await agent.run("one")
        with pytest.raises(
            ShieldBudgetExceeded,
            match="the person did not allow it \\(rejected by ada\\)",
        ):
            await agent.run("two")

    @pytest.mark.asyncio
    async def test_a_spend_limit_cannot_be_held_on_a_model_nobody_priced_and_says_so(
        self,
    ) -> None:
        spend = Policy(
            scope="organization", limits=Limits(spend=Threshold(soft=100, hard=200))
        )
        budget = ShieldBudgetCapability(policies=lambda: [spend], session=lambda: "s")
        agent = Agent(FunctionModel(_model), capabilities=[budget])
        await agent.run(
            "one"
        )  # the first request cannot know the price; after it, the model is known unpriced
        with pytest.raises(
            ShieldBudgetExceeded,
            match="the price of function:.* is unknown, so the spend limit cannot be held",
        ):
            await agent.run("two")
        free = ShieldBudgetCapability(
            policies=lambda: [default_policy()], session=lambda: "s"
        )
        agent = Agent(FunctionModel(_model), capabilities=[free])
        for _ in range(3):
            await agent.run("fine")  # no model limit anywhere: every request is done

    @pytest.mark.asyncio
    async def test_each_session_has_its_own_budget(self) -> None:
        current = {"session": "a"}
        budget = ShieldBudgetCapability(
            policies=lambda: [ORGANIZATION],
            session=lambda: current["session"],
            ask=_allow,
        )
        agent = Agent(FunctionModel(_model), capabilities=[budget])
        await agent.run("one")
        await agent.run("two")
        current["session"] = "b"
        await agent.run("one")
        assert budget.spent("b")["model_tokens"] < budget.spent("a")["model_tokens"]
        budget.forget("a")
        assert budget.spent("a") == {"model_tokens": 0, "spend": 0}


async def _allow(sentence: str) -> None:
    return None


# --- SH-35: the conformance table on the runtime --------------------------------------------

FACES = ("mcp", "a2a", "acp", "ag-ui", "embed")
TABLE = [
    (
        "read",
        {"path": "src/a.py", "inside": True},
        "allow",
        "session",
        "read inside the workspace",
    ),
    ("execute", {"command": "pytest -q"}, "ask", "organization", "execute asks"),
    ("delete", {"path": "src/a.py", "inside": True}, "ask", "session", "delete"),
    ("fetch", {"url": "https://example.com"}, "deny", None, None),
]


class TestConformanceAcrossFaces:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(("kind", "fields", "verdict", "scope", "rule"), TABLE)
    async def test_the_same_action_over_every_face_gets_the_same_answer_from_the_one_agent(
        self,
        managed: FakeIam,
        tmp_path: Path,
        kind: str,
        fields: Dict[str, Any],
        verdict: str,
        scope: Any,
        rule: Any,
    ) -> None:
        agent = an_agent(tmp_path, policies=policies_in_force())
        try:
            await agent.initialize()
            acp, _ = await agent._session_for(
                AgentContext(session_id="s"), asyncio.Queue()
            )
            state = agent.sessions[acp]
            answers = {
                face: agent.decide(
                    state,
                    Action(
                        kind=kind,
                        title=f"{kind} over {face}",
                        **{"class": class_of(kind)},
                        **fields,
                    ),
                    count_as=face,
                )
                for face in FACES
            }
        finally:
            await agent.cleanup()
        for face, decision in answers.items():
            assert (decision.verdict, decision.scope, decision.rule) == (
                verdict,
                scope,
                rule,
            ), face
