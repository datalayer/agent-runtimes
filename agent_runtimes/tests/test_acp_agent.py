# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``ACPAgent``: a harness as a Datalayer agent (SHIELD.md SH-10 to SH-13, SH-18).

Every drill runs against the ACP SDK's own fake agent
(``fixtures/acp_fake_agent.py``, agent-shield's): the only Anthropic key at
hand has no credit, so Claude Code's live turn is the marked test at the end,
skipped until a funded key and the adapter are there.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from agent_shield.policy import KIND_CLASS, Context, class_of, decide

from agent_runtimes.adapters.acp_agent import (
    WORKSPACE_VARIABLE,
    ACPAgent,
    HarnessRefused,
    LentToolset,
    harness_agent,
    harness_environment,
    harness_workspace,
    launch_command,
    lent_toolsets,
)
from agent_runtimes.adapters.base import AgentContext, StreamEvent
from agent_runtimes.guardrails.shield_policy import policies_of, rules_policy
from agent_runtimes.guardrails.tool_approvals import ToolApprovalRejectedError
from agent_runtimes.types import (
    AppRuleSpec,
    HarnessAcpSpec,
    HarnessHonoursSpec,
    HarnessRegisterEntry,
    HarnessSkillsSpec,
    HarnessSpec,
    HarnessTermsSpec,
)

FAKE = Path(__file__).parent / "fixtures" / "acp_fake_agent.py"


def fake_harness(**overrides: Any) -> HarnessSpec:
    fields: dict[str, Any] = dict(
        id="fake",
        name="Fake agent",
        description="The ACP SDK's fake agent",
        acp=HarnessAcpSpec(
            command=sys.executable, args=[str(FAKE)], mcp="lend", load_session=True
        ),
        terms=HarnessTermsSpec(served_to_third_parties="permitted"),
        skills=HarnessSkillsSpec(format="none"),
        honours=HarnessHonoursSpec(model=False, subagents=True),
        registered=HarnessRegisterEntry(adapter="fake", version="0.0.1"),
    )
    fields.update(overrides)
    return HarnessSpec(**fields)


class Approvals:
    """The runtime's approvals, answering as told: ``approve``, ``reject`` or ``hang``."""

    def __init__(self, answer: str = "approve") -> None:
        self.answer = answer
        self.asked: list[dict[str, Any]] = []

    async def request_and_wait(
        self, tool_name: str, tool_args: dict[str, Any], tool_call_id: str | None = None
    ) -> dict[str, Any]:
        self.asked.append({"tool": tool_name, "args": tool_args, "id": tool_call_id})
        if self.answer == "reject":
            raise ToolApprovalRejectedError(tool_name, "not today")
        if self.answer == "hang":
            await asyncio.sleep(3600)
        return {"status": "approved", "id": "approval-1", "tool_name": tool_name}


class Recorder:
    """What the record would keep of the run."""

    def __init__(self) -> None:
        self.entries: list[tuple[str, str, dict[str, Any]]] = []
        self.started: list[str] = []
        self.flushed: list[str] = []

    def start(self, session: str, **_: Any) -> None:
        self.started.append(session)

    def ran(self, session: str) -> None:
        self.entries.append(("run", session, {}))

    def add(
        self, kind: str, summary: str, payload: dict[str, Any] | None = None
    ) -> None:
        self.entries.append((kind, summary, payload or {}))

    def answered(self, tool: str, under: str, outcome: str, note: str = "") -> None:
        self.entries.append(
            ("approval", f"{tool}: {outcome}", {"under": under, "note": note})
        )

    def turned(self, asked: str, answered: str, spoken: Any = None) -> None:
        self.entries.append(("turn", asked, {"answered": answered}))

    def ended(
        self, status: str, summary: str, payload: dict[str, Any] | None = None
    ) -> None:
        self.entries.append(("output", summary, {"status": status, **(payload or {})}))

    async def flush(self, session: str) -> None:
        self.flushed.append(session)

    def kinds(self) -> list[str]:
        return [kind for kind, _, _ in self.entries]


class Store:
    """A protocol state store with one kind."""

    def __init__(self) -> None:
        self.kept: dict[str, dict[str, Any]] = {}

    async def get(self, kind: str, key: str) -> dict[str, Any] | None:
        return self.kept.get(f"{kind}:{key}")

    async def put(self, kind: str, key: str, value: dict[str, Any]) -> None:
        self.kept[f"{kind}:{key}"] = value


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    (tmp_path / "README.md").write_text("# A readme\nread me\n", encoding="utf-8")
    return tmp_path


def an_agent(workspace: Path, **kwargs: Any) -> ACPAgent:
    kwargs.setdefault("policies", policies_of(None))
    return ACPAgent(
        agent_id="fake",
        harness=fake_harness(),
        command=[sys.executable, str(FAKE)],
        workspace=workspace,
        **kwargs,
    )


async def turn(
    agent: ACPAgent, prompt: str, session: str = "s1", **context: Any
) -> list[StreamEvent]:
    return [
        event
        async for event in agent.stream(
            prompt, AgentContext(session_id=session, **context)
        )
    ]


def texts(events: list[StreamEvent]) -> str:
    return "".join(str(e.data) for e in events if e.type == "text")


def of(events: list[StreamEvent], kind: str) -> list[Any]:
    return [e.data for e in events if e.type == kind]


class TestLaunchingAndNegotiating:
    pytestmark = pytest.mark.asyncio

    async def test_initialize_launches_and_reads_what_the_agent_advertises(
        self, workspace: Path
    ) -> None:
        agent = an_agent(workspace)
        await agent.initialize()
        try:
            assert agent.advertised is not None
            assert agent.advertised.agent_info.name == "fake-agent"
            assert agent.loads_sessions
            assert agent.name == "Fake agent" and agent.version == "0.0.1"
            assert agent.get_tools() == []
        finally:
            await agent.cleanup()
        assert agent.started is False

    async def test_what_the_spec_asked_that_the_agent_lacks_is_refused(
        self, workspace: Path
    ) -> None:
        # The fake advertises loadSession; a spec that asks it of an agent
        # without it is refused the same way, through `advertised_problems`.
        from acp.schema import AgentCapabilities, InitializeResponse

        from agent_runtimes.adapters.acp_agent import advertised_problems

        answer = InitializeResponse(
            protocol_version=1, agent_capabilities=AgentCapabilities(load_session=False)
        )
        assert advertised_problems(fake_harness(), answer) == [
            "Fake agent advertises no loadSession, which its spec says it answers."
        ]
        assert (
            advertised_problems(
                fake_harness(acp=HarnessAcpSpec(command="x", mcp="lend")), answer
            )
            == []
        )

    async def test_a_command_that_does_not_start_is_a_sentence(
        self, workspace: Path
    ) -> None:
        agent = ACPAgent(
            agent_id="x",
            harness=fake_harness(),
            command=["/no/such/agent"],
            workspace=workspace,
        )
        with pytest.raises(HarnessRefused, match="did not start"):
            await agent.initialize()

    async def test_cleanup_ends_the_process(self, workspace: Path) -> None:
        agent = an_agent(workspace)
        await agent.initialize()
        process = agent.channel.process
        await turn(agent, "hello")
        await agent.cleanup()
        assert process.returncode is not None


class TestEveryUpdateKind:
    pytestmark = pytest.mark.asyncio

    """§4.1's table, one row at a time, on the fake agent."""

    async def test_text_thought_and_done(self, workspace: Path) -> None:
        agent = an_agent(workspace)
        try:
            events = await turn(agent, "hello")
        finally:
            await agent.cleanup()
        assert [e.type for e in events] == ["thought", "text", "done"]
        assert of(events, "thought") == ["thinking"] and texts(events) == "done"
        assert of(events, "done")[0]["stop_reason"] == "end_turn"

    async def test_a_plan(self, workspace: Path) -> None:
        agent = an_agent(workspace)
        try:
            events = await turn(agent, "plan")
        finally:
            await agent.cleanup()
        [plan] = of(events, "plan")
        assert plan == {
            "steps": [
                {"content": "step one", "priority": "medium", "status": "in_progress"}
            ]
        }

    async def test_an_edit_inside_the_workspace_is_done_shown_as_a_diff_and_written(
        self, workspace: Path
    ) -> None:
        approvals = Approvals()
        agent = an_agent(workspace, approvals=approvals)
        try:
            events = await turn(agent, "edit")
        finally:
            await agent.cleanup()
        # The agent's own tool call, pending and awaiting while it asks.
        calls = of(events, "tool_call")
        said = next(c for c in calls if c["id"] == "c1")
        assert said["kind"] == "edit" and said["awaiting"] == "approval"
        assert said["arguments"] == {"path": "hello.txt"}
        # The permission decided by decision 5 without asking anybody.
        assert approvals.asked == []
        # The Shield's own row for fs/write_text_file, decided and done.
        shield = next(c for c in calls if c["id"].startswith("shield_"))
        assert shield["name"] == "Write hello.txt — do it" and shield["kind"] == "edit"
        results = of(events, "tool_result")
        written = next(r for r in results if r["id"] == shield["id"])
        assert written["status"] == "completed"
        assert written["display"] == [
            {
                "display": "diff",
                "path": "hello.txt",
                "old_text": None,
                "new_text": "hello, shield\n",
            }
        ]
        assert (workspace / "hello.txt").read_text() == "hello, shield\n"
        done = next(r for r in results if r["id"] == "c1")
        assert done["display"][0]["display"] == "diff"
        assert of(events, "done")[0]["stop_reason"] == "end_turn"

    async def test_a_read_inside_the_workspace(self, workspace: Path) -> None:
        agent = an_agent(workspace)
        try:
            events = await turn(agent, "read")
        finally:
            await agent.cleanup()
        shield = next(
            c for c in of(events, "tool_call") if c["id"].startswith("shield_")
        )
        assert shield["name"] == "Read README.md — do it" and shield["kind"] == "read"
        done = next(r for r in of(events, "tool_result") if r["id"] == "c2")
        assert done["display"] == [{"display": "text", "text": "# A readme\nread me\n"}]

    async def test_a_read_outside_the_workspace_is_refused_in_a_sentence(
        self, workspace: Path
    ) -> None:
        agent = an_agent(workspace)
        try:
            events = await turn(agent, "outside")
        finally:
            await agent.cleanup()
        assert "outside refused" in texts(events)
        assert "outside the workspace" in texts(events)
        failed = [r for r in of(events, "tool_result") if r["status"] == "failed"]
        assert failed and failed[0]["id"].startswith("shield_")

    async def test_a_command_is_asked_about_run_in_the_workspace_and_its_output_kept(
        self, workspace: Path
    ) -> None:
        approvals = Approvals()
        agent = an_agent(workspace, approvals=approvals)
        try:
            events = await turn(agent, "run echo hi")
        finally:
            await agent.cleanup()
        [asked] = approvals.asked
        assert (
            asked["tool"] == "Run `echo hi`"
            and "ask me first" in asked["args"]["sentence"]
        )
        result = next(r for r in of(events, "tool_result") if r["id"] == "c3")
        assert result["result"]["exit"] == 0 and result["result"]["output"] == "hi\n"
        terminal = next(
            c for c in of(events, "tool_call") if c["id"] == "c3" and c.get("display")
        )
        assert terminal["display"][0]["display"] == "terminal"

    async def test_a_command_with_nobody_to_ask_is_not_run(
        self, workspace: Path
    ) -> None:
        agent = an_agent(workspace)
        try:
            events = await turn(agent, "run echo hi")
        finally:
            await agent.cleanup()
        assert "nobody is here to ask" in texts(events)
        assert "run refused" in texts(events)

    async def test_a_malformed_update_ends_the_turn_with_a_sentence(
        self, workspace: Path
    ) -> None:
        agent = an_agent(workspace)
        try:
            events = await turn(agent, "bad")
        finally:
            await agent.cleanup()
        [done] = of(events, "done")
        assert done["stop_reason"] == "refusal"
        assert "names no kind" in done["sentence"]
        assert "[Shield] " in texts(events)

    async def test_a_fetch_with_no_allow_list_is_left_to_the_person(
        self, workspace: Path
    ) -> None:
        agent = an_agent(workspace)
        try:
            events = await turn(agent, "fetch")
        finally:
            await agent.cleanup()
        [done] = of(events, "done")
        assert (
            done["stop_reason"] == "refusal"
            and "no policy lists a host a fetch may reach" in done["sentence"]
        )

    async def test_run_collects_the_turn(self, workspace: Path) -> None:
        agent = an_agent(workspace)
        try:
            answer = await agent.run("hello", AgentContext(session_id="s"))
        finally:
            await agent.cleanup()
        assert answer.content == "done" and answer.metadata["stop_reason"] == "end_turn"

    async def test_a_turn_the_client_leaves_is_cancelled_and_the_next_one_runs(
        self, workspace: Path
    ) -> None:
        agent = an_agent(workspace)
        try:
            stream = agent.stream("slow", AgentContext(session_id="s"))
            first = await stream.__anext__()
            assert first.type == "thought"
            await stream.aclose()
            assert agent.started
            events = await turn(agent, "hello", session="s")
            assert texts(events) == "done"
        finally:
            await agent.cleanup()


class TestPermissionsAreRules:
    pytestmark = pytest.mark.asyncio

    """§4.5, SH-12: do it, ask me first, leave it to me; allow_always a session rule."""

    async def test_a_flagged_command_asks_and_the_persons_yes_is_handed_back(
        self, workspace: Path
    ) -> None:
        approvals = Approvals("approve")
        agent = an_agent(workspace, approvals=approvals)
        try:
            events = await turn(agent, "push")
        finally:
            await agent.cleanup()
        [asked] = approvals.asked
        assert (
            asked["tool"] == "git push origin main"
            and "git push" in asked["args"]["sentence"]
        )
        assert "option_id='allow'" in texts(events)
        awaiting = next(c for c in of(events, "tool_call") if c["id"] == "c4")
        assert awaiting["awaiting"] == "approval"

    async def test_the_persons_no_is_handed_back(self, workspace: Path) -> None:
        agent = an_agent(workspace, approvals=Approvals("reject"))
        try:
            events = await turn(agent, "push")
        finally:
            await agent.cleanup()
        assert "option_id='reject'" in texts(events)
        assert "declined — not today" in texts(events)

    async def test_always_becomes_a_session_rule(
        self, workspace: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from agent_shield.policy import Policy, Rule, default_policy

        # The session's own policy tightened to ask before edits (decision
        # 7's scope): the person's "always" is a rule of that scope, first.
        asks = Rule(name="ask before edits", decision="ask", classes=["write"])
        tightened = default_policy().model_copy(
            update={"rules": [asks, *default_policy().rules]}
        )
        approvals = Approvals("approve")
        agent = an_agent(workspace, approvals=approvals, policies=[tightened])

        async def always(_: Any) -> str:
            return "always, for this session"

        monkeypatch.setattr(agent, "_note_of", always)
        try:
            events = await turn(agent, "edit", session="t")
            # Asked twice for one edit: the agent's permission (kind `edit`),
            # then the Shield's own fs/write of the same path. Only the first
            # becomes a session rule: the Shield asks about its own actions
            # with the package's SHIELD_OPTIONS (allow, reject), which offer
            # no allow_always.
            assert [a["tool"] for a in approvals.asked] == [
                "Edit hello.txt",
                "Write hello.txt",
            ]
            state = agent.sessions[agent._acp_of["t"]]
            # The request names no path (its notification did), so the rule
            # names the kind: every edit of this session is allowed.
            assert [(r.name, r.kinds, r.paths) for r in state.session_rules] == [
                ("always: Edit hello.txt", ["edit"], [])
            ]
            assert (workspace / "hello.txt").exists()
            # The same session: the rule decides the agent's permission,
            # nobody asked; the Shield's write is asked.
            (workspace / "hello.txt").unlink()
            events = await turn(agent, "edit", session="t")
            assert [a["tool"] for a in approvals.asked][2:] == ["Write hello.txt"]
            assert (workspace / "hello.txt").exists()
            # Gone with the session: another session asks for the edit again.
            (workspace / "hello.txt").unlink()
            await turn(agent, "edit", session="u")
            assert [a["tool"] for a in approvals.asked][3:] == [
                "Edit hello.txt",
                "Write hello.txt",
            ]
            # And a rule of the application's (team scope) is never loosened
            # by a session rule (§6.3): it decides first.
            agent.policies[:] = [Policy(scope="team", rules=[asks]), tightened]
            (workspace / "hello.txt").unlink()
            await turn(agent, "edit", session="t")
            assert [a["tool"] for a in approvals.asked][5:] == [
                "Edit hello.txt",
                "Write hello.txt",
            ]
        finally:
            await agent.cleanup()

    async def test_a_turn_cancelled_while_asking_answers_cancelled(
        self, workspace: Path
    ) -> None:
        agent = an_agent(workspace, approvals=Approvals("hang"))
        try:
            stream = agent.stream("push", AgentContext(session_id="s"))
            seen = []
            while True:
                event = await asyncio.wait_for(stream.__anext__(), 10)
                seen.append(event)
                if (
                    event.type == "tool_call"
                    and event.data.get("awaiting") == "approval"
                ):
                    break
            await asyncio.wait_for(stream.aclose(), 10)
            events = await turn(agent, "hello", session="s")
            assert texts(events) == "done"
        finally:
            await agent.cleanup()

    async def test_the_applications_rules_decide_first(self, workspace: Path) -> None:
        app = SimpleNamespace(
            rules=[
                AppRuleSpec(
                    action="never change my files",
                    applies_to=["write"],
                    behaviour="leave_to_me",
                ),
                AppRuleSpec(
                    action="read freely",
                    applies_to=["read", "publish"],
                    behaviour="do_it",
                ),
                AppRuleSpec(
                    action="only if I asked", applies_to=["send"], behaviour="if_asked"
                ),
            ]
        )
        policy = rules_policy(app)
        assert policy is not None and policy.scope == "team"
        assert [(r.name, r.decision, r.classes) for r in policy.rules] == [
            ("never change my files", "deny", ["write"]),
            ("read freely", "allow", ["read"]),
            ("only if I asked", "ask", ["send"]),
        ]
        assert rules_policy(SimpleNamespace(rules=[])) is None
        agent = an_agent(workspace, policies=policies_of(app), approvals=Approvals())
        try:
            events = await turn(agent, "edit")
        finally:
            await agent.cleanup()
        assert "edit refused" in texts(events)
        assert "never change my files" in texts(events)
        assert not (workspace / "hello.txt").exists()


class TestKindsAreClasses:
    """SH-11: ACP kinds → F-10 classes, the package's table read both ways."""

    TABLE = {
        "read": ("read", "search", "fetch"),
        "write": ("edit", "move", "other"),
        "delete": ("delete",),
        "execute": ("execute",),
        None: ("think", "switch_mode"),
    }

    @pytest.mark.parametrize("kind", sorted(KIND_CLASS))
    def test_each_kind_to_its_class(self, kind: str) -> None:
        expected = next(cls for cls, kinds in self.TABLE.items() if kind in kinds)
        assert class_of(kind) == expected

    @pytest.mark.parametrize("action_class", [c for c in TABLE if c])
    def test_each_class_to_its_kinds(self, action_class: str) -> None:
        assert (
            tuple(k for k, c in KIND_CLASS.items() if c == action_class)
            == self.TABLE[action_class]
        )

    def test_the_table_is_the_whole_of_acp_and_other_fails_closed(self) -> None:
        assert set(KIND_CLASS) == {k for kinds in self.TABLE.values() for k in kinds}
        assert class_of("other") == "write"
        with pytest.raises(ValueError, match="not a tool kind ACP names"):
            class_of("teleport")

    def test_the_default_policy_decides_as_decision_5_says(
        self, tmp_path: Path
    ) -> None:
        from agent_shield.policy import Action

        context = Context(workspace=str(tmp_path))
        [policy] = policies_of(None)

        def verdict(**fields: Any) -> str:
            return decide(Action(**fields), context, [policy]).verdict

        assert (
            verdict(
                kind="read", title="r", path="a.py", inside=True, **{"class": "read"}
            )
            == "allow"
        )
        assert (
            verdict(
                kind="edit", title="e", path="a.py", inside=True, **{"class": "write"}
            )
            == "allow"
        )
        assert (
            verdict(
                kind="delete",
                title="d",
                path="a.py",
                inside=True,
                **{"class": "delete"},
            )
            == "ask"
        )
        assert (
            verdict(kind="execute", title="x", command="ls", **{"class": "execute"})
            == "ask"
        )
        assert (
            verdict(
                kind="read",
                title="r",
                path="/etc/passwd",
                inside=False,
                **{"class": "read"},
            )
            == "ask"
        )


class TestSessionsAndTheRecord:
    pytestmark = pytest.mark.asyncio

    """§4.8, SH-18: the session kept, loaded when advertised, a start-over said."""

    async def test_one_runtime_session_is_one_harness_session(
        self, workspace: Path
    ) -> None:
        agent = an_agent(workspace)
        try:
            await turn(agent, "hello", session="s")
            await turn(agent, "hello", session="s")
            await turn(agent, "hello", session="t")
        finally:
            await agent.cleanup()
        assert agent._acp_of == {"s": "fake_1", "t": "fake_2"}

    async def test_a_kept_session_is_loaded_and_the_replay_compared(
        self, workspace: Path
    ) -> None:
        store = Store()
        first = an_agent(workspace, state_store=store)
        try:
            await turn(first, "hello", session="s")
        finally:
            await first.cleanup()
        assert store.kept["harness_session:fake:s"]["acp_session_id"] == "fake_1"
        # A new process: the fake keeps no sessions across processes, so the
        # load is refused and the start-over is said — never pretended.
        second = an_agent(workspace, state_store=store)
        try:
            events = await turn(
                second,
                "hello",
                session="s",
                conversation_history=[{"role": "user", "content": "hi"}],
            )
        finally:
            await second.cleanup()
        assert "could not load its session fake_1" in texts(events)
        assert "it starts over" in texts(events)
        # The same process: the session loads, and the fake replays no user
        # turn while the record holds one — said.
        third = an_agent(workspace, state_store=store)
        try:
            await turn(third, "hello", session="s")
            third._acp_of.clear()
            third.sessions.clear()
            events = await turn(
                third,
                "hello",
                session="s",
                conversation_history=[{"role": "user", "content": "hi"}],
            )
        finally:
            await third.cleanup()
        assert (
            "replayed 0 turn(s) of its session fake_1; the record holds 1: they differ"
            in texts(events)
        )
        assert texts(events).endswith("done")

    async def test_a_conversation_with_no_kept_session_starts_over_and_says_so(
        self, workspace: Path
    ) -> None:
        agent = an_agent(workspace)
        try:
            events = await turn(
                agent,
                "hello",
                conversation_history=[{"role": "user", "content": "earlier"}],
            )
        finally:
            await agent.cleanup()
        assert texts(events).startswith(
            "[Shield] Fake agent's session is new: it starts over"
        )

    async def test_the_turn_its_decisions_and_actions_reach_the_record(
        self, workspace: Path
    ) -> None:
        recorder = Recorder()
        agent = an_agent(workspace, recorder=recorder, approvals=Approvals())
        try:
            await turn(agent, "edit", session="s")
            await turn(agent, "run echo hi", session="s")
        finally:
            await agent.cleanup()
        assert recorder.started == ["s", "s"] and recorder.flushed == ["s", "s"]
        kinds = recorder.kinds()
        assert kinds.count("turn") == 2 and kinds.count("output") == 2
        decisions = [(s, p) for k, s, p in recorder.entries if k == "decision"]
        assert any(
            "Edit hello.txt (hello.txt): do it" in s and p["behaviour"] == "do_it"
            for s, p in decisions
        )
        actions = [(s, p) for k, s, p in recorder.entries if k == "tool_call"]
        assert any(p.get("diff", {}).get("path") == "hello.txt" for _, p in actions)
        assert any(
            p.get("what") == "exit" and p.get("exit_code") == 0 for _, p in actions
        )
        approvals = [(s, p) for k, s, p in recorder.entries if k == "approval"]
        assert approvals and approvals[0][0] == "Run `echo hi`: approved"
        assert "ask me first" in approvals[0][1]["under"]
        turns = [(s, p) for k, s, p in recorder.entries if k == "turn"]
        assert turns[0] == ("edit", {"answered": "done"})


def connecting(*servers: str) -> SimpleNamespace:
    """An application connecting ``servers``, with no Rules."""
    return SimpleNamespace(
        connections=[SimpleNamespace(server=server) for server in servers], rules=[]
    )


class TestMcpLentThroughTheGateway:
    """SHIELD §4.4, SH-14: ``session/new.mcpServers`` is how a harness gets tools, never a credential."""

    GATEWAY = "https://mcp.datalayer.run/mcp"

    def test_the_toolsets_an_application_connects_are_the_gateways(self) -> None:
        lent = lent_toolsets(fake_harness(), connecting("earthdata", "datalayer"))
        assert lent == [
            LentToolset("earthdata", f"{self.GATEWAY}?only=earthdata"),
            LentToolset("datalayer", self.GATEWAY),
        ]
        assert lent_toolsets(fake_harness(), None) == []
        assert lent_toolsets(fake_harness(), connecting("earthdata:0.0.1")) == [
            LentToolset("earthdata", f"{self.GATEWAY}?only=earthdata")
        ]

    def test_a_connection_that_is_not_the_gateway_is_refused(self) -> None:
        with pytest.raises(
            HarnessRefused,
            match="'github' is not a toolset of the Datalayer MCP gateway",
        ):
            lent_toolsets(fake_harness(), connecting("github"))

    def test_own_lends_nothing_and_none_refuses_a_connecting_application(self) -> None:
        own = fake_harness(
            acp=HarnessAcpSpec(command=sys.executable, args=[str(FAKE)], mcp="own")
        )
        assert lent_toolsets(own, connecting("earthdata")) == []
        none = fake_harness(
            acp=HarnessAcpSpec(command=sys.executable, args=[str(FAKE)], mcp="none")
        )
        assert lent_toolsets(none, None) == []
        with pytest.raises(HarnessRefused, match="lent no MCP .* connects earthdata"):
            lent_toolsets(none, connecting("earthdata"))
        odd = fake_harness(
            acp=HarnessAcpSpec(command=sys.executable, args=[str(FAKE)], mcp="all")
        )
        with pytest.raises(HarnessRefused, match="acp.mcp: 'all'"):
            lent_toolsets(odd, None)

    def test_the_allow_list_is_the_team_policys(self) -> None:
        policies = policies_of(connecting("earthdata"), ["earthdata"])
        assert [p.scope for p in policies] == ["team", "session"]
        assert policies[0].mcp.allow == ["earthdata"] and policies[0].rules == []
        assert policies_of(None)[0].scope == "session"

    @pytest.mark.asyncio
    async def test_lent_as_http_with_the_bearer_when_the_agent_advertises_it(
        self, workspace: Path
    ) -> None:
        app = connecting("earthdata")
        lent = lent_toolsets(fake_harness(), app)
        agent = an_agent(
            workspace,
            lent=lent,
            policies=policies_of(app, [item.name for item in lent]),
            credential="tok-caller",
            environment={"FAKE_AGENT_MCP_HTTP": "1"},
        )
        try:
            events = await turn(agent, "mcp")
            assert agent.lends_over_http
            servers = agent._lent_servers("tok-run")
            assert servers[0].type == "http" and servers[0].url.endswith(
                "?only=earthdata"
            )
            assert servers[0].headers[0].name == "Authorization"
            assert servers[0].headers[0].value == "Bearer tok-run"
        finally:
            await agent.cleanup()
        assert "mcp: ['earthdata:http']" in texts(events)
        rows = agent.audit.rows
        assert any(r["event"] == "mcp" and r["decision"] == "allow" for r in rows)
        assert "tok-caller" not in repr(rows)

    @pytest.mark.asyncio
    async def test_lent_over_the_stdio_shim_holding_the_token_otherwise(
        self, workspace: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("AGENT_SHIELD_HOME", str(tmp_path / "shield"))
        app = connecting("earthdata")
        lent = lent_toolsets(fake_harness(), app)
        agent = an_agent(
            workspace,
            lent=lent,
            policies=policies_of(app, ["earthdata"]),
            credential="tok-caller",
        )
        try:
            events = await turn(agent, "mcp")
            assert not agent.lends_over_http
            [handle] = agent._handles
            held = tmp_path / "shield" / "lent" / handle
            assert held.is_file() and (held.stat().st_mode & 0o777) == 0o600
            assert "tok-caller" in held.read_text()
            servers = agent._lent_servers("tok-caller")
            assert servers[0].command == sys.executable
            assert servers[0].args[:3] == [
                "-m",
                "agent_runtimes.mcp.lent_stdio",
                "--lent",
            ]
            assert (
                "tok-caller" not in " ".join(servers[0].args) and servers[0].env == []
            )
        finally:
            await agent.cleanup()
        assert "mcp: ['earthdata:stdio']" in texts(events)
        assert not held.exists() and agent._handles == []

    @pytest.mark.asyncio
    async def test_a_server_not_on_the_allow_list_is_cut(self, workspace: Path) -> None:
        app = connecting("earthdata")
        agent = an_agent(
            workspace,
            lent=lent_toolsets(
                fake_harness(), connecting("earthdata", "odoo-accounting")
            ),
            policies=policies_of(app, ["earthdata"]),
            credential="tok-caller",
            environment={"FAKE_AGENT_MCP_HTTP": "1"},
        )
        try:
            events = await turn(agent, "mcp")
        finally:
            await agent.cleanup()
        assert "mcp: ['earthdata:http']" in texts(events)
        cut = [
            r
            for r in agent.audit.rows
            if r["event"] == "mcp" and r["decision"] == "deny"
        ]
        assert cut and cut[0]["name"] == "odoo-accounting"
        assert "not on the policy's mcp.allow list" in cut[0]["sentence"]

    @pytest.mark.asyncio
    async def test_nothing_is_lent_without_a_credential(self, workspace: Path) -> None:
        app = connecting("earthdata")
        agent = an_agent(
            workspace,
            lent=lent_toolsets(fake_harness(), app),
            policies=policies_of(app, ["earthdata"]),
        )
        try:
            events = await turn(agent, "mcp")
            assert not agent.sessions
            # The run's own token is what a session is opened with.
            events_with = await turn(agent, "mcp", metadata={"user_token": "tok-run"})
        finally:
            await agent.cleanup()
        [error] = of(events, "error")
        assert (
            "carries no credential to reach the gateway with: nothing is lent" in error
        )
        assert "mcp: ['earthdata:stdio']" in texts(events_with)

    @pytest.mark.skipif(
        not (
            os.environ.get("DATALAYER_LIVE_GATEWAY_TOKEN")
            and os.environ.get("DATALAYER_MCP_SERVER_URL")
        ),
        reason=(
            "the gateway drill runs under the r1 rc with its key in "
            "DATALAYER_LIVE_GATEWAY_TOKEN (conftest scrubs DATALAYER_API_KEY)"
        ),
    )
    @pytest.mark.asyncio
    async def test_a_lent_toolset_is_real_on_the_gateway(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Read-only against the gateway: the lent toolset lists its tools, and a tool outside it is refused."""
        import mcp.types as types
        from mcp.client.session import ClientSession
        from mcp.client.stdio import StdioServerParameters, stdio_client
        from mcp.client.streamable_http import streamable_http_client
        from mcp.shared._httpx_utils import create_mcp_http_client

        from agent_runtimes.mcp.lent_stdio import hold, release

        monkeypatch.setenv("AGENT_SHIELD_HOME", str(tmp_path / "shield"))
        token = os.environ["DATALAYER_LIVE_GATEWAY_TOKEN"]
        [lent] = lent_toolsets(fake_harness(), connecting("earthdata"))
        assert (
            lent.url
            == f"{os.environ['DATALAYER_MCP_SERVER_URL'].rstrip('/')}?only=earthdata"
        )
        # As an HTTP server: the lent URL with the lent header.
        http = create_mcp_http_client(headers={"Authorization": f"Bearer {token}"})
        async with streamable_http_client(lent.url, http_client=http) as streams:
            async with ClientSession(streams[0], streams[1]) as session:
                await session.initialize()
                names = {tool.name for tool in (await session.list_tools()).tools}
                assert names and "launch_sandbox" not in names
                outside = await session.send_request(
                    types.CallToolRequest(
                        method="tools/call",
                        params=types.CallToolRequestParams(
                            name="launch_sandbox", arguments={}
                        ),
                    ),
                    types.CallToolResult,
                )
                assert outside.is_error
        # Over the stdio shim: the same toolset, the token held by the shim's process.
        handle = hold(lent.name, lent.url, token)
        try:
            params = StdioServerParameters(
                command=sys.executable,
                args=["-m", "agent_runtimes.mcp.lent_stdio", "--lent", handle],
                env={
                    "AGENT_SHIELD_HOME": str(tmp_path / "shield"),
                    "PATH": os.environ["PATH"],
                },
            )
            async with stdio_client(params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    through_shim = {
                        tool.name for tool in (await session.list_tools()).tools
                    }
            assert through_shim == names
        finally:
            release(handle)


class TestResolvingACatalogueHarness:
    def test_an_npx_adapter_is_taken_from_the_shields_prefix_or_the_path_never_fetched(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from agent_runtimes.specs.harnesses import get_harness

        claude = get_harness("claude-code")
        monkeypatch.setattr(shutil, "which", lambda name: None)
        with pytest.raises(
            HarnessRefused, match="agent-shield setup --harness claude-code"
        ):
            launch_command(claude, home=tmp_path)
        installed = (
            tmp_path
            / "harnesses"
            / "claude-code@0.91.0"
            / "node_modules"
            / ".bin"
            / "claude-agent-acp"
        )
        installed.parent.mkdir(parents=True)
        installed.write_text("#!/bin/sh\n")
        assert launch_command(claude, home=tmp_path) == [str(installed)]
        monkeypatch.setattr(shutil, "which", lambda name: f"/usr/local/bin/{name}")
        assert launch_command(claude, home=tmp_path / "elsewhere") == [
            "/usr/local/bin/claude-agent-acp"
        ]
        gemini = get_harness("gemini-cli")
        assert launch_command(gemini, home=tmp_path / "elsewhere") == [
            "/usr/local/bin/gemini",
            "--experimental-acp",
        ]

    def test_a_declared_secret_missing_is_a_sentence(self) -> None:
        from agent_runtimes.specs.harnesses import get_harness

        claude = get_harness("claude-code")
        with pytest.raises(
            HarnessRefused, match="needs ANTHROPIC_API_KEY in the environment"
        ):
            harness_environment(claude, {})
        assert harness_environment(
            claude, {"ANTHROPIC_API_KEY": "k", "OTHER": "x"}
        ) == {"ANTHROPIC_API_KEY": "k"}
        assert harness_environment(get_harness("codex"), {"OPENAI_API_KEY": "k"}) == {
            "NO_BROWSER": "1",
            "OPENAI_API_KEY": "k",
        }

    def test_the_workspace_is_named_or_refused(self, tmp_path: Path) -> None:
        with pytest.raises(HarnessRefused, match=WORKSPACE_VARIABLE):
            harness_workspace({})
        with pytest.raises(HarnessRefused, match="not a directory"):
            harness_workspace({WORKSPACE_VARIABLE: str(tmp_path / "nope")})
        assert (
            harness_workspace({WORKSPACE_VARIABLE: str(tmp_path)}) == tmp_path.resolve()
        )

    def test_an_unknown_harness(self, tmp_path: Path) -> None:
        with pytest.raises(HarnessRefused, match="no harness named 'nope'"):
            harness_agent("a", "nope", environment={WORKSPACE_VARIABLE: str(tmp_path)})


@pytest.mark.live
@pytest.mark.asyncio
async def test_claude_code_live(tmp_path: Path) -> None:
    """The spike's harness, live: Claude Code through its pinned adapter (SH-03, SH-10).

    Runs when a funded ``ANTHROPIC_API_KEY`` is set and the adapter is installed
    (``agent-shield setup --harness claude-code``, or the image's install).
    """
    if not os.environ.get("ANTHROPIC_API_KEY") or not os.environ.get(
        "DATALAYER_LIVE_HARNESS"
    ):
        pytest.skip("needs ANTHROPIC_API_KEY and DATALAYER_LIVE_HARNESS=1")
    agent = harness_agent(
        "claude",
        "claude-code",
        approvals=Approvals(),
        environment={**os.environ, WORKSPACE_VARIABLE: str(tmp_path)},
    )
    await agent.initialize()
    try:
        events = await turn(
            agent, "Create hello.txt containing the word hello, then stop."
        )
    finally:
        await agent.cleanup()
    assert of(events, "done")[0]["stop_reason"] == "end_turn"
    assert (tmp_path / "hello.txt").exists()
