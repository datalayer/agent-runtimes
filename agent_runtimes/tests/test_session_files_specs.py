# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The session file format (MH-12) as agent-runtimes reads it.

Generated from agentspecs 0.0.119's `sessions/` kind by
`scripts/codegen/generate_session_files.py`, wired into `make specs`: the
caps, the states, the entry kinds, the redaction rules and the refusal
sentences are agentspecs' own, word for word, so the runtime, `loop`, the
chat and agent-teams refuse the same things in the same words.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

from agent_runtimes.specs import session_files as generated

agentspecs_sessions = pytest.importorskip("agentspecs.sessions")

REPO = Path(__file__).resolve().parents[2]
CODEGEN = REPO / "scripts" / "codegen"
SPECS = REPO / "agentspecs" / "agentspecs" / "sessions"


def test_the_generated_format_is_agentspecs():
    assert (
        generated.SESSION_FILE_FORMAT
        == agentspecs_sessions.FORMAT
        == "datalayer-session/1"
    )
    assert (
        generated.SESSION_STATES
        == agentspecs_sessions.STATES
        == ("open", "paused", "ended")
    )
    assert generated.SESSION_ENTRY_KINDS == agentspecs_sessions.ENTRY_KINDS
    assert (
        tuple(generated.SESSION_REDACTION_RULES) == agentspecs_sessions.REDACTION_RULES
    )
    assert generated.SESSION_FILE_REFUSALS == agentspecs_sessions.REFUSALS
    assert (
        (generated.SESSION_FILE_MAX_BYTES, generated.SESSION_FILE_MAX_ENTRIES)
        == (
            agentspecs_sessions.MAX_BYTES,
            agentspecs_sessions.MAX_ENTRIES,
        )
        == (64 * 1024 * 1024, 20_000)
    )
    assert generated.SESSION_FILE_SCHEMA == agentspecs_sessions.json_schema()


def test_the_refusals_are_said_in_the_same_words():
    assert (
        generated.session_file_refusal("other_version", format="datalayer-session/2")
        == (agentspecs_sessions.refusal("other_version", format="datalayer-session/2"))
        == "The file is datalayer-session/2; this runtime reads datalayer-session/1."
    )
    assert "20 000 entries in 64 MB" in generated.session_file_refusal(
        "too_large", entries="31 204", megabytes=70
    )


def test_the_schema_refuses_what_the_spec_refuses():
    jsonschema = pytest.importorskip("jsonschema")
    schema = generated.SESSION_FILE_SCHEMA
    entry = {
        "record_type": "entry",
        "kind": "turn",
        "at": "2026-10-21T10:00:00Z",
        "payload": {},
    }
    jsonschema.validate(entry, schema)
    for bad in (
        {**entry, "kind": "shell"},
        {k: v for k, v in entry.items() if k != "at"},
        {"record_type": "session", "uid": "e67a52b2"},
    ):
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(bad, schema)


def test_the_generator_refuses_another_format(tmp_path):
    import shutil

    import yaml

    sys.path.insert(0, str(CODEGEN))
    try:
        from generate_session_files import load_spec
    finally:
        sys.path.remove(str(CODEGEN))
    for path in SPECS.iterdir():
        if path.is_file():
            shutil.copy(path, tmp_path / path.name)
    spec = yaml.safe_load((tmp_path / "datalayer-session-1.yaml").read_text())
    spec["format"] = "datalayer-session/2"
    (tmp_path / "datalayer-session-1.yaml").write_text(yaml.safe_dump(spec))
    with pytest.raises(ValueError, match="the format is datalayer-session/1"):
        load_spec(tmp_path)
