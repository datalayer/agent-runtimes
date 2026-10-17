# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The semantic agent events contract, tested by the runtime that emits the
events (DC-005, S-004).

`src/portable/semantic-events.json` is what a chat host (Slack, Discord)
reduces a session's AG-UI stream to; `src/portable/semanticOfAgUi.ts`
reduces every case of it. This side holds the cases to what the session
code emits: every AG-UI event type and custom event the session routes and
the loop's sessions emit has a case, every `loop.turn` state a case names is
one the runtime sets, and every question kind the runtime asks has a case.
No case stands for an event the runtime never sends.
"""

from __future__ import annotations

import inspect
import json
import re
from pathlib import Path

import ag_ui.core

import agent_runtimes
from agent_runtimes.loop.apps import external_turns
from agent_runtimes.loop.apps.sessions import question_of

PACKAGE = Path(agent_runtimes.__file__).parent
FIXTURE = PACKAGE.parent / "src" / "portable" / "semantic-events.json"

#: The modules whose events reach a host's session stream.
EMITTERS = [
    PACKAGE / "routes" / "apps.py",
    *sorted((PACKAGE / "loop" / "apps").glob("*.py")),
]


def _fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def _cased() -> list[dict]:
    return [event for case in _fixture()["cases"] for event in case["agui"]]


def _constant(name: str) -> str:
    """A module-level string constant of the package, by its name."""
    pattern = re.compile(rf'^{name}\s*=\s*"([^"]+)"', re.M)
    for path in PACKAGE.rglob("*.py"):
        found = pattern.search(path.read_text(encoding="utf-8"))
        if found:
            return found.group(1)
    raise AssertionError(f"No string constant {name} in agent_runtimes.")


def _emitted_custom_names() -> set[str]:
    names = set()
    for path in EMITTERS:
        source = path.read_text(encoding="utf-8")
        for value in re.findall(r"CustomEvent\(\s*name=([A-Z_]+|\"[^\"]+\")", source):
            names.add(value.strip('"') if value.startswith('"') else _constant(value))
    return names


def _emitted_types() -> set[str]:
    """The AG-UI event types the emitters build from `ag_ui.core` classes."""
    types = set()
    for path in EMITTERS:
        source = path.read_text(encoding="utf-8")
        for name in set(re.findall(r"\b([A-Z][A-Za-z]+Event)\(", source)):
            cls = getattr(ag_ui.core, name, None)
            if cls is None:
                continue  # pydantic-ai's own events, read before they are AG-UI
            default = cls.model_fields["type"].default
            types.add(getattr(default, "value", default))
    return types


def test_the_fixture_is_version_1_with_its_eleven_kinds():
    fixture = _fixture()
    assert fixture["version"] == 1
    assert len(fixture["kinds"]) == 11
    assert sorted(fixture["producers"]) == sorted(fixture["kinds"])


def test_every_event_type_the_session_code_emits_has_a_case():
    emitted = _emitted_types()
    # What a reader would miss if the scan read nothing.
    assert {"RUN_STARTED", "RUN_FINISHED", "RUN_ERROR", "CUSTOM"} <= emitted
    cased = {event["type"] for event in _cased()}
    assert emitted - cased == set()


def test_every_custom_event_the_session_code_emits_has_a_case():
    emitted = _emitted_custom_names()
    assert {"loop.session", "loop.turn"} <= emitted
    cased = {event["name"] for event in _cased() if event["type"] == "CUSTOM"}
    assert emitted - cased == set()


def test_no_case_is_a_custom_event_the_runtime_never_sends():
    # `reactor.ui` is in a case because a run stream must never carry it
    # (it comes over the ui socket, RU-W): a host ignores it.
    cased = {event["name"] for event in _cased() if event["type"] == "CUSTOM"}
    assert cased - _emitted_custom_names() == {"reactor.ui"}


def test_every_loop_turn_state_a_case_names_is_one_the_runtime_sets():
    source = inspect.getsource(external_turns)
    states = set(re.findall(r'\bstate(?::\s*str)?\s*=\s*"([a-z]+)"', source))
    assert states == {"running", "finished", "failed"}
    named = {
        event["value"]["state"]
        for event in _cased()
        if event["type"] == "CUSTOM" and event["name"] == external_turns.TURN_EVENT
    }
    assert named and named <= states


def test_every_question_kind_the_runtime_asks_has_a_case():
    asked = set(re.findall(r'"kind":\s*"([a-z]+)"', inspect.getsource(question_of)))
    assert asked == {"choice", "file", "form", "text"}
    cased = {
        event["result"]["asking"]["kind"]
        for event in _cased()
        if event["type"] == "RUN_FINISHED" and event.get("result")
    }
    assert asked <= cased
