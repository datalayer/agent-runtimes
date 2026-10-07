# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The transcript's grammar in Python (LOOP A-06, A-14): the twin of
``sceneTranscript.ts`` gives the fixture's lines — the same fixture the
TypeScript test reads (``agent_runtimes/tests/fixtures/scene_transcript.json``).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

import pytest

from agent_runtimes.loop.scenes.transcript import (
    PERSON,
    SceneConnection,
    SceneMember,
    connection_of_tool,
    line_text,
    millis,
    time_text,
    transcript_of_record,
    transcript_of_spans,
    transcript_text,
)

FIXTURE = Path(__file__).parent / "fixtures" / "scene_transcript.json"


@pytest.fixture(scope="module")
def fixture() -> Dict[str, Any]:
    return json.loads(FIXTURE.read_text())


def members_of(data: List[Dict[str, Any]]) -> List[SceneMember]:
    return [
        SceneMember(
            id=member["id"],
            name=member["name"],
            connections=tuple(
                SceneConnection(
                    id=connection["id"],
                    name=connection["name"],
                    label=connection["label"],
                    tools=tuple(connection.get("tools", [])),
                    prefix=connection.get("prefix", ""),
                )
                for connection in member.get("connections", [])
            ),
        )
        for member in data
    ]


def test_every_case_of_the_fixture_gives_its_lines(fixture: Dict[str, Any]) -> None:
    members = members_of(fixture["members"])
    for case in fixture["cases"]:
        lines = transcript_of_spans(case["spans"], members)
        assert [line_text(line) for line in lines] == case["lines"], case["name"]
        if "kinds" in case:
            assert [line.kind for line in lines] == case["kinds"], case["name"]
        if "offsets" in case:
            assert [line.at - lines[0].at for line in lines] == case["offsets"], case[
                "name"
            ]
        if "open" in case:
            assert [line.open for line in lines] == case["open"], case["name"]
        if "failed" in case:
            assert [line.failed for line in lines] == case["failed"], case["name"]
        for never in case.get("never", []):
            # The call to the peer (Sales' own tool) is told by the A2A request, once.
            assert not any(line.text == never for line in lines), case["name"]


def test_the_scripted_scene_starts_with_the_person(fixture: Dict[str, Any]) -> None:
    members = members_of(fixture["members"])
    lines = transcript_of_spans(fixture["cases"][0]["spans"], members)
    assert (
        lines[0].who == PERSON and lines[0].to == "Sales" and lines[0].kind == "asked"
    )
    assert lines[2].to == "Odoo" and lines[2].kind == "called"


def test_a_finished_run_is_read_the_same_way(fixture: Dict[str, Any]) -> None:
    record = fixture["record"]
    member = members_of([record["member"]])[0]
    lines = transcript_of_record(record["entries"], member)
    assert [line_text(line) for line in lines] == record["lines"]
    # The question is placed where the turn began: with its first call.
    assert lines[0].at == millis(record["first_at"])
    without = record["without_conversations"]
    entries = [record["entries"][index] for index in without["entries"]]
    assert [
        line_text(line) for line in transcript_of_record(entries, member)
    ] == without["lines"]


def test_the_transcript_as_text_carries_each_line_s_time(
    fixture: Dict[str, Any],
) -> None:
    members = members_of(fixture["members"])
    lines = transcript_of_spans(fixture["cases"][0]["spans"], members)
    rows = transcript_text(lines).split("\n")
    assert len(rows) == 5
    assert (
        rows[2]
        == f"{time_text(lines[2].at)}  Accounting → Odoo: odoo_accounting_aged_balance"
    )
    assert rows[0].endswith(f"You → Sales: {lines[0].text}")


def test_a_tool_is_its_connection_s_by_name_then_by_prefix() -> None:
    odoo = SceneConnection(
        "odoo-accounting",
        "Odoo Accounting",
        "Odoo",
        ("odoo_accounting_aged_balance",),
        "odoo_accounting_",
    )
    assert connection_of_tool("odoo_accounting_aged_balance", [odoo]) is odoo
    assert connection_of_tool("gateway.odoo_accounting_aged_balance", [odoo]) is odoo
    assert connection_of_tool("odoo_accounting_list_journals", [odoo]) is odoo
    assert connection_of_tool("write_notebook", [odoo]) is None
