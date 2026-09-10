# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A report document back out as Markdown and CSV (BENCHMARK.md, B4-08).

What people wrote and what the runs produced read in the order they are in
the document, each block knowing whether it is evidence; the CSV keeps the
CLI's columns first and adds a row per block and per decision.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

from agent_runtimes.evals.lexical import REPORT_SECTIONS, lexical_blocks, lexical_markdown
from agent_runtimes.evals.report import REPORT_OBJECT_COLUMNS, write_report_object_csv

GOLDEN = Path(__file__).parent / "golden"

EVIDENCE = {"evidence": {"evalset": "evalset-1", "launch": "launch-128"}}


def _text(words: str, fmt: int = 0) -> dict:
    return {"type": "text", "text": words, "format": fmt}


DOCUMENT = {
    "root": {
        "children": [
            {"type": "heading", "tag": "h2", "children": [_text("Overview and rankings")], "$": EVIDENCE},
            {"type": "paragraph", "children": [_text("Our reading: "), _text("it regressed", 1), _text(" on "), _text("duplicates", 2), _text("; see "), _text("df.duplicated()", 16)]},
            {"type": "list", "listType": "bullet", "children": [{"type": "listitem", "children": [_text("one")]}, {"type": "listitem", "children": [_text("two")]}]},
            {
                "type": "table",
                "$": EVIDENCE,
                "children": [
                    {"type": "tablerow", "children": [{"type": "tablecell", "children": [{"type": "paragraph", "children": [_text("Subject")]}]}, {"type": "tablecell", "children": [{"type": "paragraph", "children": [_text("Pass rate")]}]}]},
                    {"type": "tablerow", "children": [{"type": "tablecell", "children": [{"type": "paragraph", "children": [_text("agent | a")]}]}, {"type": "tablecell", "children": [{"type": "paragraph", "children": [_text("92%")]}]}]},
                ],
            },
            {"type": "report-evidence", "source": "df.duplicated().sum()", "outputs": [{"output_type": "execute_result", "data": {"text/plain": "157"}}], "caption": "the duplicates"},
            {"type": "paragraph", "children": []},
        ]
    }
}


def test_the_document_reads_as_markdown_in_its_order():
    markdown = lexical_markdown(DOCUMENT)
    assert markdown.startswith("## Overview and rankings\n\nOur reading: **it regressed** on *duplicates*; see `df.duplicated()`")
    assert "- one\n- two" in markdown
    assert "| Subject | Pass rate |\n| --- | --- |\n| agent \\| a | 92% |" in markdown
    assert "```python\ndf.duplicated().sum()\n```\n\n```\n157\n```\n\n*the duplicates*" in markdown


def test_each_block_knows_whether_it_is_evidence_and_empty_ones_are_left_out():
    blocks = lexical_blocks(DOCUMENT)
    assert [(block["type"], block["evidence"]) for block in blocks] == [
        ("heading", True),
        ("paragraph", False),
        ("list", False),
        ("table", True),
        ("report-evidence", True),
    ]
    assert blocks[1]["text"] == "Our reading:  it regressed  on  duplicates ; see  df.duplicated()"
    assert blocks[4]["text"] == "157"


def test_a_generated_report_reads_in_the_order_of_its_sections():
    state = json.loads((GOLDEN / "evals-report.lexical.json").read_text(encoding="utf-8"))
    markdown = lexical_markdown(state)
    positions = [markdown.index(f"## {title}") for _, title in REPORT_SECTIONS]
    assert positions == sorted(positions)
    assert all(block["evidence"] for block in lexical_blocks(state))


def test_the_csv_keeps_the_cli_columns_first_and_adds_blocks_and_decisions(tmp_path):
    report = {"evalset_id": "evalset-1", "experiments": [], "generated_at": "2026-09-10T00:00:00Z"}
    decisions = [{"kind": "expected_change", "outcome": "approved", "scope": "launch", "scope_ref": "launch-128", "decided_by_uid": "reviewer-1", "decided_at": "2026-09-10T09:00:00Z", "note": "As planned."}]
    path = write_report_object_csv(report, tmp_path / "report.csv", narrative=lexical_blocks(DOCUMENT), decisions=decisions)
    with Path(path).open(encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        rows = list(reader)
        columns = list(reader.fieldnames or [])
    assert columns[0] == "row_type" and columns[-len(REPORT_OBJECT_COLUMNS):] == REPORT_OBJECT_COLUMNS
    assert [row["row_type"] for row in rows] == ["narrative"] * 5 + ["decision"]
    assert rows[3]["block_type"] == "table" and rows[3]["block_is_evidence"] == "true"
    assert (rows[-1]["decision_kind"], rows[-1]["decision_scope_ref"], rows[-1]["decision_note"]) == ("expected_change", "launch-128", "As planned.")
    assert not list(tmp_path.glob("*.runs.csv"))
