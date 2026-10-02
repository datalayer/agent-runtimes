# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Applications: the catalogue generated from agentspecs 0.0.15, and its rules.

An application is an agent with an interface, rules, tests and a place to
run. A rule is written in a person's words and decided on what a tool does;
the decision is written in agentspecs, here, and in TypeScript, and
`APP_BEHAVIOURS` — what agentspecs decided — is what each has to reproduce.
"""

import re
import subprocess
import sys
from pathlib import Path

import pytest

from agent_runtimes.loop.apps import (
    BEHAVIOURS,
    DEFAULT_BEHAVIOURS,
    behaviour_for,
    classes_of,
    condition_holds,
    decision_for,
    is_comparable,
    is_pattern,
    is_read_only,
    matches,
    split_ref,
    strictest,
    tool_behaviours,
    tool_escalations,
)
from agent_runtimes.specs.actions import (
    ACTION_CLASSES,
    APP_BEHAVIOURS,
    APP_ESCALATIONS,
    SERVER_ACTIONS,
    TOOL_ACTIONS,
)
from agent_runtimes.specs.apps import APP_CATALOGUE, get_app, list_apps
from agent_runtimes.types import ActionConditionSpec, AppSpec

REPO = Path(__file__).resolve().parents[2]

#: A name, a pattern, and whether the one matches the other: `*` is any run
#: of characters, `?` any one, nothing else is special, and case counts. The
#: TypeScript rules are tested on the same table.
PATTERNS = [
    ("search_gmail_messages", "*gmail*", True),
    ("search_drive_files", "*gmail*", False),
    ("get_a", "get_?", True),
    ("get_ab", "get_?", False),
    ("a.b", "a.b", True),
    ("axb", "a.b", False),
    ("a[1]", "a[1]", True),
    ("a1", "a[1]", False),
    ("a[!b]c", "a[!b]c", True),
    ("axc", "a[!b]c", False),
    ("[", "[", True),
    ("a{b}", "a{b}", True),
    ("a|b", "a|b", True),
    ("a", "a|b", False),
    ("a+", "a+", True),
    ("aa", "a+", False),
    ("Search", "search", False),
    ("", "*", True),
    ("line\nbreak", "line*", True),
]
CODEGEN = REPO / "scripts" / "codegen"
CLONE = REPO / "agentspecs" / "agentspecs"


def app(**changes: object) -> AppSpec:
    """A small chat application, with what a test changes."""
    data: dict = {
        "id": "desk",
        "name": "Desk",
        "kind": "chat",
        "agent": "cog-crawler:0.0.1",
        "connections": [{"server": "google-workspace:0.0.1", "access": "write"}],
    }
    data.update(changes)
    return AppSpec.model_validate(data)


def rule(applies_to: list[str], behaviour: str) -> dict:
    """A rule on classes or tools, as an application writes it."""
    return {
        "action": f"The rule on {', '.join(applies_to)}",
        "applies_to": applies_to,
        "behaviour": behaviour,
    }


class TestTheCatalogue:
    def test_it_has_one_application_of_each_kind(self) -> None:
        assert {found.kind for found in list_apps()} == {
            "chat",
            "widget",
            "decision",
            "worker",
        }
        assert [found.id for found in list_apps("worker")] == ["inbox-triage"]
        assert get_app("web-research") is APP_CATALOGUE["web-research"]
        assert get_app("web-research:0.0.1") is APP_CATALOGUE["web-research"]
        assert get_app("nope") is None

    def test_an_application_arrives_with_its_layout_and_its_setup(self) -> None:
        triage = APP_CATALOGUE["inbox-triage"]
        assert triage.interface.layout == "split"
        assert triage.record.retention_days == 365
        assert triage.connections[0].acts_as == "user"
        assert triage.connections[0].only == ["*gmail*"]
        assert any("not enabled" in line for line in triage.setup)
        assert APP_CATALOGUE["web-research"].setup == []
        assert APP_CATALOGUE["web-research"].interface.layout == "chat"

    def test_a_decision_arrives_whole(self) -> None:
        decision = APP_CATALOGUE["ship-or-fix"].decision
        assert decision is not None
        assert decision.criteria[0].measure == "pass_rate"
        assert decision.scenarios[0].weights["Pass rate"] == 4
        assert decision.min_confidence == 0.6


class TestActionClasses:
    def test_every_tool_of_the_catalogue_has_a_class(self) -> None:
        assert [tool for tool, classes in TOOL_ACTIONS.items() if not classes] == []
        assert all(
            item in ACTION_CLASSES
            for classes in TOOL_ACTIONS.values()
            for item in classes
        )

    def test_a_server_that_was_not_checked_classes_nothing(self) -> None:
        for identity, actions in SERVER_ACTIONS.items():
            assert bool(actions.checked) == bool(actions.tools), identity

    def test_classes_are_read_by_reference(self) -> None:
        assert classes_of("tavily.tavily_search") == ["read"]
        assert classes_of("google-workspace:0.0.1.send_gmail_message") == ["send"]
        assert classes_of("runtime-send-mail:0.0.1") == ["send"]
        assert classes_of("chart.generate_pie_chart") == ["read"]
        assert split_ref("runtime-send-mail") == (None, "runtime-send-mail")

    def test_a_pattern_means_what_it_means_in_agentspecs(self) -> None:
        for name, pattern, expected in PATTERNS:
            assert matches(name, pattern) is expected, (name, pattern)
        assert is_pattern("generate_*") and is_pattern("get_?")
        assert not is_pattern("a[1]") and not is_pattern("plain_name")

    def test_an_argument_is_compared_as_what_it_is(self) -> None:
        condition = ActionConditionSpec(argument="mode", equals=["Delete", 3, True])
        assert condition_holds(condition, {"mode": "delete"})
        assert condition_holds(condition, {"mode": 3})
        assert condition_holds(condition, {"mode": True})
        # True is not 1, and a list is not a word.
        assert not condition_holds(condition, {"mode": 1})
        assert not condition_holds(condition, {"mode": ["delete"]})
        assert not condition_holds(condition, {"other": "delete"})
        # A number no reader holds exactly equals nothing: not even itself.
        safe = 2**53 - 1
        exact = ActionConditionSpec(argument="amount", equals=[safe])
        assert condition_holds(exact, {"amount": safe})
        assert not condition_holds(exact, {"amount": safe + 1})
        assert not is_comparable(safe + 2) and not is_comparable(1e20)
        assert not is_comparable(float("inf")) and not is_comparable(float("nan"))
        assert is_comparable(2.5) and is_comparable(-3) and is_comparable("word")
        assert not is_comparable(None) and not is_comparable(["x"])
        among = ActionConditionSpec(argument="ids", includes=["TRASH"])
        assert condition_holds(among, {"ids": ["INBOX", "trash"]})
        assert condition_holds(among, {"ids": "TRASH"})
        assert not condition_holds(among, {"ids": ["INBOX"]})

    def test_an_unknown_tool_has_no_class_and_is_never_a_reader(self) -> None:
        assert classes_of("github.create_issue") == []
        assert classes_of("google-workspace.a_tool_added_tomorrow") == []
        assert classes_of("no-such-server.anything") == []
        assert not is_read_only([])
        assert is_read_only(["read"])
        assert not is_read_only(["read", "write"])


class TestWhatARuleDecides:
    def test_it_agrees_with_agentspecs_on_every_tool_of_every_application(self) -> None:
        assert set(APP_BEHAVIOURS) == set(APP_CATALOGUE)
        for identity, expected in APP_BEHAVIOURS.items():
            assert tool_behaviours(APP_CATALOGUE[identity]) == expected, identity
        for identity, escalations in APP_ESCALATIONS.items():
            assert tool_escalations(APP_CATALOGUE[identity]) == escalations, identity
        assert APP_ESCALATIONS["inbox-triage"]

    def test_reading_needs_no_rule_and_what_acts_waits_for_a_person(self) -> None:
        assert DEFAULT_BEHAVIOURS["read"] == "do_it"
        assert all(
            DEFAULT_BEHAVIOURS[item] == "ask_first"
            for item in ACTION_CLASSES
            if item != "read"
        )
        plain = app()
        assert behaviour_for(plain, "google-workspace.search_gmail_messages") == "do_it"
        assert (
            behaviour_for(plain, "google-workspace.draft_gmail_message") == "ask_first"
        )
        assert (
            behaviour_for(plain, "google-workspace.send_gmail_message") == "ask_first"
        )

    @pytest.mark.parametrize("action", ACTION_CLASSES)
    @pytest.mark.parametrize("behaviour", BEHAVIOURS)
    def test_a_rule_on_a_class_decides_every_tool_of_that_class(
        self, action: str, behaviour: str
    ) -> None:
        ruled = app(rules=[rule([action], behaviour)])
        decided = behaviour_for(ruled, "google-workspace.some_tool", classes=[action])
        assert decided == behaviour

    def test_a_tool_of_several_classes_takes_the_most_restricted(self) -> None:
        assert strictest(["do_it", "ask_first", "if_asked"]) == "ask_first"
        ruled = app(rules=[rule(["write"], "do_it"), rule(["delete"], "leave_to_me")])
        assert behaviour_for(ruled, "google-workspace.manage_event") == "leave_to_me"
        assert behaviour_for(ruled, "google-workspace.draft_gmail_message") == "do_it"

    def test_a_rule_that_names_a_tool_wins_over_the_rule_on_its_class(self) -> None:
        ruled = app(
            rules=[
                rule(["write"], "ask_first"),
                rule(["google-workspace:0.0.1.modify_gmail_message_labels"], "do_it"),
            ]
        )
        label = "google-workspace.modify_gmail_message_labels"
        archive = {"remove_label_ids": ["INBOX"]}
        assert behaviour_for(ruled, label, arguments=archive) == "do_it"
        assert (
            behaviour_for(ruled, "google-workspace.draft_gmail_message") == "ask_first"
        )

    def test_what_a_tool_does_can_depend_on_what_it_is_asked(self) -> None:
        label = "google-workspace.modify_gmail_message_labels"
        assert classes_of(label, {"remove_label_ids": ["INBOX"]}) == ["write"]
        assert classes_of(label, {"add_label_ids": ["STARRED", "trash"]}) == [
            "write",
            "delete",
        ]
        assert classes_of(label) == ["write", "delete"]
        assert classes_of("google-workspace.update_drive_file", {"trashed": 1}) == [
            "write"
        ]
        ruled = app(rules=[rule([label], "do_it")])
        # Labelling is done; trashing is a deletion no rule lets through.
        starred = {"add_label_ids": ["STARRED"]}
        trash = {"add_label_ids": ["TRASH"]}
        assert behaviour_for(ruled, label, arguments=starred) == "do_it"
        assert behaviour_for(ruled, label, arguments=trash) == "ask_first"
        # Nobody said what it is asked: the worst it can do.
        assert behaviour_for(ruled, label) == "ask_first"
        forbidden = app(rules=[rule([label], "do_it"), rule(["delete"], "leave_to_me")])
        assert behaviour_for(forbidden, label, arguments=trash) == "leave_to_me"

    def test_a_tool_nobody_classed_is_left_to_the_person(self) -> None:
        tool = "google-workspace.a_tool_added_tomorrow"
        assert behaviour_for(app(), tool) == "leave_to_me"
        assert (
            behaviour_for(app(rules=[rule([tool], "ask_first")]), tool) == "ask_first"
        )

    def test_an_application_reaches_nothing_it_does_not_name(self) -> None:
        assert behaviour_for(app(), "tavily.tavily_search") == "leave_to_me"
        scoped = app(
            connections=[
                {"server": "google-workspace", "access": "write", "only": ["*gmail*"]}
            ]
        )
        assert (
            behaviour_for(scoped, "google-workspace.search_gmail_messages") == "do_it"
        )
        assert (
            behaviour_for(scoped, "google-workspace.search_drive_files")
            == "leave_to_me"
        )

    def test_a_connection_that_only_reads_carries_no_tool_that_acts(self) -> None:
        reader = app(
            connections=[{"server": "google-workspace", "access": "read"}],
            rules=[rule(["send"], "do_it")],
        )
        assert (
            behaviour_for(reader, "google-workspace.search_gmail_messages") == "do_it"
        )
        assert (
            behaviour_for(reader, "google-workspace.send_gmail_message")
            == "leave_to_me"
        )

    def test_inbox_triage_sends_on_approval_and_deletes_nothing(self) -> None:
        decided = tool_behaviours(APP_CATALOGUE["inbox-triage"])
        assert decided["google-workspace.send_gmail_message"] == "ask_first"
        assert decided["google-workspace.manage_gmail_filter"] == "ask_first"
        assert decided["google-workspace.search_drive_files"] == "leave_to_me"
        triage = APP_CATALOGUE["inbox-triage"]
        for tool, behaviour in decided.items():
            if behaviour == "do_it":
                assert "gmail" in tool
                assert set(classes_of(tool, {})) <= {"read", "write"}, tool
        for tool, arguments in (
            ("manage_gmail_label", {"action": "delete"}),
            ("modify_gmail_message_labels", {"add_label_ids": ["TRASH"]}),
            ("batch_modify_gmail_message_labels", {"add_label_ids": ["SPAM"]}),
        ):
            ref = f"google-workspace.{tool}"
            assert behaviour_for(triage, ref, arguments=arguments) == "leave_to_me"

    def test_a_decision_says_why(self) -> None:
        triage = APP_CATALOGUE["inbox-triage"]
        prefix = "google-workspace."
        cases = [
            ("send_gmail_message", {}, "ask_first", "rule_on_class", "Send a message"),
            ("search_gmail_messages", {}, "do_it", "default", ""),
            (
                "modify_gmail_message_labels",
                {"remove_label_ids": ["INBOX"]},
                "do_it",
                "rule_on_tool",
                "Label and archive a message",
            ),
            (
                "modify_gmail_message_labels",
                {"add_label_ids": ["TRASH"]},
                "leave_to_me",
                "rule_on_class",
                "Delete anything",
            ),
            ("search_drive_files", {}, "leave_to_me", "left_out", ""),
            ("a_tool_added_tomorrow_gmail", {}, "leave_to_me", "unclassed", ""),
        ]
        for tool, arguments, behaviour, because, said in cases:
            decision = decision_for(triage, prefix + tool, arguments=arguments)
            assert (decision.behaviour, decision.because, decision.rule) == (
                behaviour,
                because,
                said,
            ), tool
            assert decision.sentence.endswith(".")
        apart = decision_for(triage, "tavily.tavily_search")
        assert apart.because == "not_connected"
        reader = app(connections=[{"server": "google-workspace", "access": "read"}])
        blocked = decision_for(reader, prefix + "send_gmail_message")
        assert (blocked.behaviour, blocked.because) == ("leave_to_me", "read_only")
        assert "only reads" in blocked.sentence
        # It is the same decision `behaviour_for` gives, for every tool.
        for tool in tool_behaviours(triage):
            assert decision_for(triage, tool, arguments={}).behaviour == behaviour_for(
                triage, tool, arguments={}
            )

    def test_an_application_has_a_face_and_its_permissions(self) -> None:
        faces = [found.emoji for found in list_apps()]
        assert len(set(faces)) == len(faces)
        permissions = APP_CATALOGUE["inbox-triage"].permissions
        assert permissions.spaces == []
        assert not (permissions.computer.browse or permissions.computer.shell)
        assert app().emoji == "\U0001f440"


def _said(text: str) -> str:
    """What a generated file says, whatever a formatter did to it.

    `make specs` runs ruff and prettier over what the generator writes:
    quotes, commas, line breaks and escapes move, and nothing else does.
    """
    return re.sub(r"[\s'\",\\]", "", text)


COMMITTED = {
    "--python-output": REPO / "agent_runtimes" / "specs" / "apps.py",
    "--typescript-output": REPO / "src" / "specs" / "apps.ts",
    "--actions-python-output": REPO / "agent_runtimes" / "specs" / "actions.py",
    "--actions-typescript-output": REPO / "src" / "specs" / "actions.ts",
}


@pytest.mark.skipif(not (CLONE / "apps").is_dir(), reason="needs the agentspecs clone")
class TestTheGenerator:
    def test_what_is_committed_is_what_it_writes(self, tmp_path: Path) -> None:
        outputs = {flag: tmp_path / path.name for flag, path in COMMITTED.items()}
        arguments = [str(part) for pair in outputs.items() for part in pair]
        subprocess.run(  # noqa: S603 - our own generator, on our own files
            [
                sys.executable,
                str(CODEGEN / "generate_apps.py"),
                "--specs-dir",
                str(CLONE / "apps"),
                *arguments,
            ],
            check=True,
            capture_output=True,
        )
        for flag, written in outputs.items():
            committed = COMMITTED[flag]
            assert _said(written.read_text()) == _said(committed.read_text()), (
                f"{committed.relative_to(REPO)} is not what `make specs` writes today: "
                "run it again"
            )

    def test_a_change_of_one_word_is_seen(self) -> None:
        text = COMMITTED["--actions-python-output"].read_text()
        assert "ask_first" in text
        assert _said(text) != _said(text.replace("ask_first", "do_it", 1))
        # And a formatter's change is not one.
        assert _said(text) == _said(text.replace('"', "'").replace(",\n", "\n"))
