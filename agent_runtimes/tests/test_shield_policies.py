# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Shield's policies on the runtime (SH-50, SH-31, SH-32, SH-54, SH-35).

IAM's documents in force on a managed runtime and fail closed without them;
the organization's tightening over the Appspec's and the session's; a rule a
person adds to a running session, on a harness and on a pydantic-ai
application alike; the model budget soft then hard; the same action over
every face, the same answer.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
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
from agent_runtimes.apps import opening, plugins, principal, sessions
from agent_runtimes.apps.loading import load_app
from agent_runtimes.apps.plugins import rules_for
from agent_runtimes.apps.record import _SESSION
from agent_runtimes.apps.rules import SESSION_RULE
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
from agent_runtimes.routes import agents
from agent_runtimes.routes import apps as routes
from agent_runtimes.routes.agui import unregister_agui_agent
from agent_runtimes.tests.test_acp_agent import an_agent, catalogued_fake, fake_harness
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

    @pytest.mark.asyncio
    async def test_a_change_pushed_over_ai_agents_socket_reaches_the_runtime_at_once(
        self, managed: FakeIam
    ) -> None:
        """SH-50's push: ai-agents broadcasts ``shield_policy_changed`` on the
        account's channel when IAM wrote a document; the runtime pulls IAM at
        once, without waiting for the poll."""
        import socket as sockets

        from websockets.asyncio.server import serve

        from agent_runtimes.guardrails.managed_policies import (
            SOCKET_EVENT,
            ai_agents_socket_url,
            runtime_policies,
        )

        assert ai_agents_socket_url(
            "https://r1.datalayer.run/api/ai-agents/v1", "t"
        ) == ("wss://r1.datalayer.run/api/ai-agents/v1/ws?token=t")
        connected: asyncio.Event = asyncio.Event()
        sockets_seen: List[Any] = []

        async def ai_agents(connection: Any) -> None:
            sockets_seen.append(connection)
            connected.set()
            async for _ in connection:
                pass

        with sockets.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        async with serve(ai_agents, "127.0.0.1", port):
            policies = runtime_policies()
            policies.poll_seconds = 3600.0  # the poll cannot be the one that told it
            policies.use_socket(f"ws://127.0.0.1:{port}/api/ai-agents/v1/ws?token=t")
            changed: List[List[Policy]] = []
            stop = policies.listen(
                lambda got: changed.append(list(got)), lambda _: None
            )
            try:
                assert [p.limits for p in policies.in_force()] == [ORGANIZATION.limits]
                await asyncio.wait_for(connected.wait(), 5.0)
                tightened = Policy(
                    scope="organization",
                    limits=Limits(model_tokens=Threshold(soft=1, hard=5)),
                )
                managed.answer = served(tightened)
                await sockets_seen[0].send(
                    json.dumps(
                        {
                            "channel": "user:acct",
                            "event": SOCKET_EVENT,
                            "data": {
                                "scope": "organization",
                                "subject_uid": "o",
                                "version": 2,
                            },
                        }
                    )
                )
                for _ in range(100):
                    if changed:
                        break
                    await asyncio.sleep(0.05)
                assert changed and [p.limits for p in changed[0]] == [
                    tightened.limits
                ], "told within a second, not the poll"
                assert policies.pushed == 1
                assert [p.limits for p in policies.in_force()] == [tightened.limits]
            finally:
                stop()
                policies.use_socket(None)

    def test_without_iam_and_without_a_copy_the_harness_is_refused_naming_iam(
        self, managed: FakeIam, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        catalogued_fake(monkeypatch)
        managed.answer = PolicyUnavailable(
            "IAM at https://iam.test could not be reached (timed out)"
        )
        managed_policies.use_source(managed)  # no copy yet
        with pytest.raises(HarnessRefused) as refused:
            harness_agent("a", "fake", workspace=tmp_path)
        assert str(refused.value) == (
            "The harness 'fake' is refused: The Shield cannot read its policy from IAM at https://iam.test "
            "(IAM at https://iam.test could not be reached (timed out)) and it holds no copy: no unexpired "
            "policy is held, so nothing is decided."
        )

    def test_without_a_token_and_without_iams_url_the_runtime_is_unmanaged_and_quiet(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        """A scene rehearsed in process, a test, a terminal with nothing of the
        platform's: the Rules and the platform's default alone, and nothing in the
        log about it."""
        managed_policies.use_source(None)
        monkeypatch.delenv("DATALAYER_IAM_URL", raising=False)
        monkeypatch.delenv("DATALAYER_USER_TOKEN", raising=False)
        with caplog.at_level(
            "WARNING", logger="agent_runtimes.guardrails.managed_policies"
        ):
            assert [p.scope for p in policies_in_force()] == ["session"]
        assert runtime_policies().is_managed is False
        assert not [r for r in caplog.records if "unmanaged" in r.getMessage()]
        managed_policies.use_source(None)

    def test_a_token_without_iams_url_runs_unmanaged_and_says_so(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        """A developer's shell or CI holds a token for the platform's services and no
        IAM URL: the Rules decide, as the proxy's file does, and the log says it once
        (1.5.37 refused every application run there)."""
        managed_policies.use_source(None)
        monkeypatch.delenv("DATALAYER_IAM_URL", raising=False)
        monkeypatch.setenv("DATALAYER_USER_TOKEN", "x.eyJ1aWQiOiAiYWNjdDEifQ.y")
        with caplog.at_level(
            "WARNING", logger="agent_runtimes.guardrails.managed_policies"
        ):
            assert [p.scope for p in policies_in_force()] == ["session"]
            assert runtime_policies().is_managed is False
            policies_in_force()
        said = [r for r in caplog.records if "runs unmanaged here" in r.getMessage()]
        assert len(said) == 1 and "DATALAYER_IAM_URL" in said[0].getMessage()
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
        catalogued_fake(monkeypatch)
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

    def test_the_platforms_credentials_rule_holds_on_datalayer(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A harness there calls through ai-inference, on the platform's credentials."""
        monkeypatch.setenv("AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE", "datalayer")
        monkeypatch.setenv("DATALAYER_AI_INFERENCE_URL", "https://r1.example")
        platform = Policy(
            scope="organization", harnesses=Harnesses(credentials="platform")
        )
        assert harness_refusal([platform, default_policy()], "claude-code") is None

    def test_the_platforms_credentials_rule_refuses_on_a_runtime_that_lends_the_accounts_own(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE", raising=False)
        platform = Policy(
            scope="organization", harnesses=Harnesses(credentials="platform")
        )
        assert "lends only the account's own declared secret" in str(
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
            "s",
            Rule(name="no sends", decision="deny", classes=["send"]),
            application=None,
            above=above,
        )
        # The application lets commands run; the organization's document, above it, asks.
        permissive = Policy(
            scope="team",
            rules=[Rule(name="Run commands", decision="allow", classes=["execute"])],
        )
        with pytest.raises(SessionRuleRefused) as refused:
            rules.add(
                "s",
                Rule(name="run freely", decision="allow", classes=["execute"]),
                application=permissive,
                above=above,
            )
        assert str(refused.value).startswith(
            "The session rule is refused, it would permit more than the organization's policy: "
            "the session rule 'run freely' says do it where the organization rule 'execute asks' says ask me first"
        )
        rules.add(
            "s",
            Rule(name="no sends", decision="ask", classes=["send"]),
            application=None,
            above=above,
        )
        assert [(r.name, r.decision) for r in rules.of("s")] == [("no sends", "ask")]
        rules.remove("s", "no sends")
        with pytest.raises(SessionRuleRefused, match="no rule named 'nope'"):
            rules.remove("s", "nope")
        rules.add("s", Rule(name="x", decision="deny"), application=None, above=above)
        rules.forget("s")
        assert rules.of("s") == []

    def test_a_pydantic_ai_calls_behaviour_is_the_strictest_of_the_apps_and_the_sessions(
        self, unmanaged: None
    ) -> None:
        session_rules().add(
            "s1",
            Rule(name="never write", decision="deny", classes=["write"]),
            application=None,
            above=[],
        )
        session_rules().add(
            "s1",
            Rule(name="ask to read", decision="ask", classes=["read"]),
            application=None,
            above=[],
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
                application=None,
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


class TestTheApplicationsRulesAreACeiling:
    """A session rule that loosens the application's own Rules is refused at once (SH-54)."""

    APP_RULES = Policy(
        scope="team",
        rules=[
            Rule(name="Edit files", decision="allow", classes=["write"]),
            Rule(name="Run commands", decision="ask", classes=["execute"]),
            Rule(name="Delete files", decision="deny", classes=["delete"]),
        ],
    )

    def test_a_rule_allowing_what_the_application_leaves_to_the_person_is_refused(
        self,
    ) -> None:
        rules = SessionRules()
        with pytest.raises(SessionRuleRefused) as refused:
            rules.add(
                "s",
                Rule(name="delete freely", decision="allow", classes=["delete"]),
                application=self.APP_RULES,
                above=[],
            )
        assert str(refused.value) == (
            "The session rule is refused, it would permit more than the application's Rules: "
            "the session rule 'delete freely' says do it where the application's rule "
            "'Delete files' says leave it to me; a session rule may only tighten the "
            "application's Rules."
        )
        assert rules.of("s") == [], "nothing was added"

    def test_asking_where_the_application_refuses_is_a_loosening_too(self) -> None:
        with pytest.raises(
            SessionRuleRefused, match="'Delete files' says leave it to me"
        ):
            SessionRules().add(
                "s",
                Rule(name="ask to delete", decision="ask", kinds=["delete"]),
                application=self.APP_RULES,
                above=[],
            )
        with pytest.raises(
            SessionRuleRefused, match="'Run commands' says ask me first"
        ):
            SessionRules().add(
                "s",
                Rule(name="run freely", decision="allow", classes=["execute"]),
                application=self.APP_RULES,
                above=[],
            )

    def test_the_implicit_default_is_part_of_the_ceiling(self) -> None:
        """Decided by the user, 21 October 2026: on a class the application's Rules
        do not name, reading is done and anything else asks first — a session rule
        that would do more is refused in a sentence naming that default."""
        rules = SessionRules()
        with pytest.raises(SessionRuleRefused) as refused:
            rules.add(
                "s",
                Rule(name="send freely", decision="allow", classes=["send"]),
                application=self.APP_RULES,
                above=[],
            )
        assert str(refused.value) == (
            "The session rule is refused, it would permit more than the application's Rules: "
            "the session rule 'send freely' says do it on send, of which the application's "
            "Rules say nothing, so its default holds: ask me first; a session rule may only "
            "tighten the application's Rules."
        )
        # A rule naming no class names every class: *do it* on all of them is refused on each unnamed one.
        with pytest.raises(SessionRuleRefused, match="on buy, of which") as everything:
            rules.add(
                "s",
                Rule(name="anything", decision="allow"),
                application=self.APP_RULES,
                above=[],
            )
        assert "on send, of which" in str(everything.value) and "on read" not in str(
            everything.value
        )
        # An application with no Rules at all has the same default.
        with pytest.raises(
            SessionRuleRefused,
            match="on execute, of which the application's Rules say nothing, so its default holds: ask me first",
        ):
            rules.add(
                "s",
                Rule(name="run freely", decision="allow", kinds=["execute"]),
                application=None,
                above=[],
            )
        # Reading is the default's *do it*: allowed, as is asking on what asks already.
        rules.add(
            "s",
            Rule(name="read freely", decision="allow", classes=["read"]),
            application=None,
            above=[],
        )
        rules.add(
            "s",
            Rule(name="ask to send", decision="ask", classes=["send"]),
            application=self.APP_RULES,
            above=[],
        )
        rules.add(
            "s",
            Rule(name="never buy", decision="deny", classes=["buy"]),
            application=None,
            above=[],
        )
        assert [r.name for r in rules.of("s")] == [
            "ask to send",
            "never buy",
            "read freely",
        ]

    def test_tightening_the_applications_rules_is_kept(self) -> None:
        rules = SessionRules()
        rules.add(
            "s",
            Rule(
                name="no rm", decision="deny", classes=["execute"], commands=[r"^rm\b"]
            ),
            application=self.APP_RULES,
            above=[],
        )
        rules.add(
            "s",
            Rule(name="ask before writing", decision="ask", classes=["write"]),
            application=self.APP_RULES,
            above=[],
        )
        # A class the application's Rules do not name is the application's default to tighten, not a loosening of a rule.
        rules.add(
            "s",
            Rule(name="read freely", decision="allow", classes=["read"]),
            application=self.APP_RULES,
            above=[],
        )
        assert [r.name for r in rules.of("s")] == [
            "no rm",
            "ask before writing",
            "read freely",
        ]

    def test_the_route_refuses_it_with_the_sentence(
        self, runtime: Runtime, remote: TestClient
    ) -> None:
        guarded = {
            **ASSISTANT,
            "rules": [
                {
                    "action": "Delete files",
                    "applies_to": ["delete"],
                    "behaviour": "leave_to_me",
                }
            ],
        }
        runtime.make("notes-assistant", guarded, {"app_uid": "app-1", "version": 3})
        events_of(
            remote.post(
                "/api/v1/apps/sessions",
                headers=as_("ada"),
                json={
                    "agent": "notes-assistant",
                    "app_uid": "app-1",
                    "version": 3,
                    "opener": "Hello",
                    "session": "session-0002",
                },
            )
        )
        refused = remote.post(
            "/api/v1/apps/sessions/session-0002/rules",
            headers=as_("ada"),
            json={"name": "delete freely", "decision": "allow", "classes": ["delete"]},
        )
        assert refused.status_code == 422, refused.text
        assert refused.json()["detail"].startswith(
            "The session rule is refused, it would permit more than the application's Rules: "
            "the session rule 'delete freely' says do it where the application's rule "
            "'Delete files' says leave it to me"
        )
        assert session_rules().of("session-0002") == []


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
        assert session_rules().of("session-0001") == [], "gone with the session"


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
    async def test_a_stream_the_client_leaves_early_is_still_counted_at_the_runs_end(
        self,
    ) -> None:
        """The streaming path, left as soon as the answer's text begins (as a
        terminal does), before the response is whole: what pydantic-ai
        counted for the run reaches the session's total at the run's end,
        and the third request is refused by the hard limit (SH-32, r1 drill
        of 15 October 2026)."""
        import json

        from pydantic_ai.messages import (
            PartDeltaEvent,
            TextPartDelta,
        )
        from pydantic_ai.models.function import DeltaToolCall

        async def stream(messages: Any, info: Any) -> Any:
            last = messages[-1]
            if any(getattr(p, "part_kind", "") == "tool-return" for p in last.parts):
                for _ in range(10):
                    yield "the answer "
            else:
                yield {
                    0: DeltaToolCall(name="decide", json_args=json.dumps({"q": "x"}))
                }

        asked: List[str] = []

        async def ask(sentence: str) -> None:
            asked.append(sentence)

        organization = Policy(
            scope="organization",
            limits=Limits(model_tokens=Threshold(soft=1, hard=250)),
        )
        budget = ShieldBudgetCapability(
            policies=lambda: [organization], session=lambda: "s", ask=ask
        )
        agent = Agent(
            FunctionModel(_model, stream_function=stream), capabilities=[budget]
        )

        @agent.tool_plain
        def decide(q: str) -> str:
            return "yes"

        async def leave_early(prompt: str) -> None:
            async with agent.run_stream_events(prompt) as events:
                async for event in events:
                    if isinstance(event, PartDeltaEvent) and isinstance(
                        event.delta, TextPartDelta
                    ):
                        break

        await leave_early("one")
        first = budget.spent("s")["model_tokens"]
        assert first > 0, (
            "the tool call's response and the left stream's text are counted"
        )
        assert budget.state_of("s").counted_in_run == {} or all(
            v > 0 for v in budget.state_of("s").counted_in_run.values()
        )
        await leave_early("two")
        second = budget.spent("s")["model_tokens"]
        assert second > first, "the second run's requests are counted onto the session"
        assert asked and asked[0].startswith(
            "a model request: ask me first — the session's model tokens spent would reach"
        )
        with pytest.raises(ShieldBudgetExceeded, match="over the hard limit of 250"):
            await leave_early("three")

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

    def test_a_request_through_ai_inference_is_priced_at_the_catalogues_list_price(
        self,
    ) -> None:
        """The runtime calls ai-inference as an OpenAI-compatible model named
        by the catalogue's id; genai-prices cannot place it under ``openai``,
        and every second request of a kept deployment was refused as unpriced
        (r1, 16 October 2026). The catalogue's price is the one ai-inference
        meters the call with."""
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.openai import OpenAIProvider
        from pydantic_ai.usage import RequestUsage

        from agent_runtimes.guardrails.shield_budget import catalogue_usd

        through_ai_inference = OpenAIChatModel(
            "bedrock:us.anthropic.claude-sonnet-4-6",
            provider=OpenAIProvider(
                base_url="https://ai-inference.example/v1", api_key="k"
            ),
        )
        usage = RequestUsage(input_tokens=1_000_000, output_tokens=100_000)
        assert catalogue_usd(through_ai_inference, usage) == pytest.approx(3.3 + 1.65)
        direct = SimpleNamespace(
            model_name="us.anthropic.claude-sonnet-4-6", system="bedrock"
        )
        assert catalogue_usd(direct, usage) == pytest.approx(3.3 + 1.65)
        assert (
            catalogue_usd(
                SimpleNamespace(model_name="nobody:priced", system="x"), usage
            )
            is None
        )
        assert catalogue_usd(None, usage) is None

    @pytest.mark.asyncio
    async def test_a_catalogue_model_is_held_to_a_spend_limit_request_after_request(
        self,
    ) -> None:
        class CatalogueModel(FunctionModel):
            @property
            def model_name(self) -> str:
                return "bedrock:us.anthropic.claude-sonnet-4-6"

        spend = Policy(scope="team", limits=Limits(spend=Threshold(soft=100, hard=200)))
        budget = ShieldBudgetCapability(policies=lambda: [spend], session=lambda: "s")
        agent = Agent(CatalogueModel(_model), capabilities=[budget])
        for _ in range(3):
            await agent.run("one")  # priced each time: never refused as unpriced
        state = budget.state_of("s")
        assert state.unpriced == "" and state.usd_pending > 0

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


class TestTheDeploymentsSpendLimit:
    """
    A deployment's spend limit, handed by ai-agents' keeper in its instance.

    Held for each session as a ``team`` document's ``limits.spend`` and said
    apart from the keeper's day (SH-32).
    """

    def test_it_is_a_team_document_soft_at_the_keepers_warning_share(self) -> None:
        from agent_runtimes.guardrails.shield_policy import (
            deployment_spend_limit,
            deployment_spend_policy,
            policies_of,
        )

        assert deployment_spend_limit({"app_uid": "a", "spend_limit": 500}) == 500.0
        assert deployment_spend_limit(None) == 0.0
        assert deployment_spend_limit({"app_uid": "a"}) == 0.0
        with pytest.raises(ValueError, match="below zero"):
            deployment_spend_limit({"spend_limit": -1})
        with pytest.raises(ValueError, match="not a number of credits"):
            deployment_spend_limit({"spend_limit": "lots"})
        document = deployment_spend_policy(500)
        assert document.scope == "team"
        assert (document.limits.spend.soft, document.limits.spend.hard) == (400, 500)
        assert document.rules == [] and document.limits.model_tokens is None
        with_limit = policies_of(None, spend_limit=500)
        assert [p.scope for p in with_limit] == ["team", "session"]
        assert [p.scope for p in policies_of(None)] == ["session"]

    @pytest.mark.asyncio
    async def test_the_sentence_tells_the_sessions_limit_from_the_keepers_day(
        self,
    ) -> None:
        from agent_runtimes.guardrails.shield_policy import (
            deployment_said,
            policies_of,
        )

        asked: List[str] = []

        async def ask(sentence: str) -> None:
            asked.append(sentence)

        recorded: List[Dict[str, Any]] = []
        budget = ShieldBudgetCapability(
            policies=lambda: policies_of(None, spend_limit=500),
            session=lambda: "s",
            ask=ask,
            record=recorded.append,
            said=lambda d, c, tokens, cost: deployment_said(
                d, c, tokens=tokens, cost=cost, spend_limit=500
            ),
        )
        state = budget.state_of("s")
        state.limits.spend, state.last_credits = 350, 60  # would reach 410: past 400
        await budget.before_model_request(None, "request")
        assert len(asked) == 1
        assert asked[0].startswith(
            "a model request: ask me first — the session's credits spent would reach 410, past the soft limit of 400"
        )
        assert (
            "the deployment's spend limit of 500 credits a day, held here for this session; its keeper "
            "holds the same 500 across the day and stops its computer when a day's spending reaches it"
            in asked[0]
        )
        state.limits.spend = 450  # would reach 510: over 500
        with pytest.raises(ShieldBudgetExceeded) as refused:
            await budget.before_model_request(None, "request")
        said = str(refused.value)
        assert (
            "over the hard limit of 500 — the deployment's spend limit of 500 credits a day"
            in said
        )
        assert said.endswith(
            "the owner raising the limit under Ship, or a person's word, would let it go on"
        )
        assert "in the team policy" not in said
        assert recorded[-1]["sentence"] == said and recorded[-1]["limit"] == "spend"

    @pytest.mark.asyncio
    async def test_a_stricter_organization_limit_keeps_its_own_words(self) -> None:
        from agent_runtimes.guardrails.shield_policy import (
            deployment_said,
            policies_of,
        )

        organization = Policy(
            scope="organization", limits=Limits(spend=Threshold(soft=100, hard=200))
        )
        budget = ShieldBudgetCapability(
            policies=lambda: policies_of(None, managed=[organization], spend_limit=500),
            session=lambda: "s",
            said=lambda d, c, tokens, cost: deployment_said(
                d, c, tokens=tokens, cost=cost, spend_limit=500
            ),
        )
        state = budget.state_of("s")
        state.limits.spend, state.last_credits = 190, 60
        with pytest.raises(ShieldBudgetExceeded) as refused:
            await budget.before_model_request(None, "request")
        assert "over the hard limit of 200 in the organization policy" in str(
            refused.value
        )
        assert "deployment" not in str(refused.value)


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
