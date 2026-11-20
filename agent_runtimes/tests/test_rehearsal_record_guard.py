# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The guard that no test changes a scene's kept rehearsal sees every change (Copilot on #149)."""

from __future__ import annotations

from agent_runtimes.tests.conftest import _records_changed


def test_a_record_written_removed_or_changed_is_caught() -> None:
    before = {"a/rehearsal.json": 1, "b/rehearsal.json": 2}
    assert _records_changed(before, dict(before)) == []
    # Removed (or moved away): only before had it.
    assert _records_changed(before, {"a/rehearsal.json": 1}) == ["b/rehearsal.json"]
    # Written where there was none.
    assert _records_changed(before, {**before, "c/rehearsal.json": 3}) == [
        "c/rehearsal.json"
    ]
    # Changed in place.
    assert _records_changed(before, {"a/rehearsal.json": 9, "b/rehearsal.json": 2}) == [
        "a/rehearsal.json"
    ]
