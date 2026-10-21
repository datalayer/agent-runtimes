# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The `session.format` point and `datalayer-session/1` (MH-F04).

The built-in format is reached through the point, an unknown id refused
naming the known ones; its exporter redacts by the spec's rules and counts
each, its importer reads the file as untrusted data line by line in the
spec's sentences.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from reactor import PluginManifest, PluginPlatform, hookimpl

from agent_runtimes.loop.apps.session_files import (
    DATALAYER_SESSION_FORMAT,
    REDACTED,
    Redactor,
    SessionFormatRefused,
    digest_of,
    format_named,
    formats,
)
from agent_runtimes.plugins import host
from agent_runtimes.plugins.points import SESSION_FORMATS

SESSION = {
    "uid": "session-x001",
    "agent": "shield-mvp-codex",
    "harness": "codex",
    "app": {"id": "shield-mvp", "version": 3, "name": "Shield MVP", "kind": "chat"},
    "instance": {"app_uid": "app-1", "deployment_uid": "", "version": 3},
    "opened_by": {"kind": "person", "uid": "01jq"},
    "state": "paused",
    "title": "The refactor",
    "archived": False,
    "lineage": {"forked_from": None, "imported_from": None},
    "runs_on": {"kind": "runtime", "uid": "01m5"},
}
ENTRIES = [
    {
        "kind": "session",
        "at": "2026-10-21T10:00:00Z",
        "summary": "started",
        "payload": {
            "app": "shield-mvp",
            "state": "open",
            "runs_on": {"kind": "runtime", "uid": "01m5"},
            "signed": {"sub": "u1"},
        },
    },
    {
        "kind": "turn",
        "at": "2026-10-21T10:00:01Z",
        "summary": "Hi",
        "payload": {"asked": "Hi", "answered": "Hello"},
    },
    {
        "kind": "tool_call",
        "at": "2026-10-21T10:00:02Z",
        "summary": "fetch",
        "payload": {
            "name": "fetch",
            "input": {
                "headers": {
                    "Authorization": "Bearer sk-abcdef1234567890abcdef",
                    "Cookie": "s=1",
                },
                "url": "https://ada:pw@api.example/v1",
            },
            "secret": "sk-live-ZZZZ",
        },
    },
    {
        "kind": "turn",
        "at": "2026-10-21T10:00:03Z",
        "summary": "Two",
        "payload": {"asked": "Two", "answered": "ok"},
    },
    {"kind": "shell", "at": "x", "payload": {}},
]


def test_the_built_in_format_is_reached_through_the_point_and_an_unknown_id_is_refused() -> (
    None
):
    platform = PluginPlatform(extension_group="agent-runtimes.tests.extensions")
    host.session_platform(platform, discover_installed=False)
    assert list(formats(platform)) == ["datalayer-session/1"]
    assert format_named("", platform) is DATALAYER_SESSION_FORMAT
    assert format_named("datalayer-session/1", platform) is DATALAYER_SESSION_FORMAT
    with pytest.raises(
        SessionFormatRefused,
        match="There is no session file format 'omnigent-jsonl/1': one of datalayer-session/1",
    ):
        format_named("omnigent-jsonl/1", platform)

    class Second:
        id = "omnigent-jsonl/1"

        def export(self, *a: Any, **k: Any) -> Any:
            return None

        def import_(self, *a: Any, **k: Any) -> Any:
            return None

    class Contributing:
        @hookimpl
        def provide_contributions(self, contributions: Any) -> None:
            contributions.contribute(
                SESSION_FORMATS, Second(), contribution_id="omnigent-jsonl/1"
            )
            contributions.contribute(
                SESSION_FORMATS, Second(), contribution_id="datalayer-session/1"
            )

    platform.register_plugin(
        PluginManifest(name="omnigent-session-format", version="0.0.1"), Contributing()
    )
    assert sorted(formats(platform)) == ["datalayer-session/1", "omnigent-jsonl/1"]
    [refusal] = host.refusals(platform)
    assert (
        "omnigent-session-format contributes session.format 'datalayer-session/1'"
        in refusal.reason
    )


def test_export_redacts_by_the_rules_and_counts_each() -> None:
    exported = DATALAYER_SESSION_FORMAT.export(
        SESSION, ENTRIES, exported_by="01jq", secrets={"OPENAI_API_KEY": "sk-live-ZZZZ"}
    )
    head = json.loads(exported.lines[0])
    assert (
        head["record_type"],
        head["format"],
        head["uid"],
        head["turns"],
        head["entries"],
    ) == ("session", "datalayer-session/1", "session-x001", 2, 4)
    assert (
        head["owner"] == {"uid": "01jq"}
        and head["exported_by"] == {"uid": "01jq"}
        and head["harness"] == "codex"
    )
    assert "shell" not in head["kinds"] and exported.entries == 4
    lines = [json.loads(line) for line in exported.lines[1:]]
    tool = lines[2]["payload"]
    assert tool["input"]["headers"] == {"Authorization": REDACTED, "Cookie": REDACTED}
    assert tool["input"]["url"] == "https://api.example/v1"
    assert tool["secret"] == REDACTED
    # The signed user and the runtime are dropped from the opening entry.
    assert "signed" not in lines[0]["payload"] and "runs_on" not in lines[0]["payload"]
    assert head["redactions"] == exported.redactions == 5
    assert (
        digest_of(exported.lines).startswith("sha256:")
        and len(digest_of(exported.lines)) == 71
    )


def test_the_redactor_names_what_each_rule_replaced() -> None:
    redactor = Redactor(secrets={"KEY": "s3cr3t-value"})
    assert redactor.value(
        {
            "Authorization": "x",
            "note": "token s3cr3t-value here",
            "u": "https://a:b@h/p",
        }
    ) == {
        "Authorization": REDACTED,
        "note": f"token {REDACTED} here",
        "u": "https://h/p",
    }
    assert redactor.by_rule == {
        "authorization_header": 1,
        "declared_secret": 1,
        "url_userinfo": 1,
    }


def test_a_credential_is_redacted_wherever_it_is_not_only_under_a_header() -> None:
    """`Bearer …` under a key that is no header (`arguments.token`), inside
    a sentence, and the value of a key, secret or password field by its
    name — each replaced and counted under `bearer_token`; a count named
    `tokens` and a path under `key` are left as they are."""
    redactor = Redactor()
    assert redactor.value(
        {
            "arguments": {
                "token": "Bearer sk-secret-1",
                "tokens": 120,
                "key": "a.py",
                "note": "sent with Basic Zm9vOmJhcg== then token abc",
                "client_secret": "x1",
            },
            "password": "hunter2",
            "already": f"Bearer {REDACTED}",
        }
    ) == {
        "arguments": {
            "token": REDACTED,
            "tokens": 120,
            "key": "a.py",
            "note": f"sent with Basic {REDACTED} then token {REDACTED}",
            "client_secret": REDACTED,
        },
        "password": REDACTED,
        "already": f"Bearer {REDACTED}",
    }
    assert redactor.by_rule == {"bearer_token": 5} and redactor.count == 5
    # Through the export, the file holds none of them and says how many.
    entries = [
        *ENTRIES[:2],
        {
            "kind": "tool_call",
            "at": "2026-10-21T10:00:02Z",
            "summary": "edit",
            "payload": {"tool": "edit", "arguments": {"token": "Bearer sk-secret-1"}},
        },
    ]
    exported = DATALAYER_SESSION_FORMAT.export(SESSION, entries, exported_by="01jq")
    assert "sk-secret-1" not in "\n".join(exported.lines)
    assert json.loads(exported.lines[-1])["payload"]["arguments"] == {"token": REDACTED}
    assert json.loads(exported.lines[0])["redactions"] == exported.redactions == 2


def test_import_reads_the_file_as_untrusted_data_in_the_specs_sentences() -> None:
    exported = DATALAYER_SESSION_FORMAT.export(SESSION, ENTRIES[:4], exported_by="01jq")
    imported = DATALAYER_SESSION_FORMAT.import_(exported.lines)
    assert imported.session["uid"] == "session-x001" and [
        e["kind"] for e in imported.entries
    ] == ["session", "turn", "tool_call", "turn"]
    assert imported.redactions == exported.redactions
    with pytest.raises(
        SessionFormatRefused,
        match="The file is datalayer-session/2; this runtime reads datalayer-session/1.",
    ):
        DATALAYER_SESSION_FORMAT.import_(
            [
                exported.lines[0].replace("datalayer-session/1", "datalayer-session/2"),
                *exported.lines[1:],
            ]
        )
    planted = json.dumps(
        {
            "record_type": "entry",
            "kind": "shell",
            "at": "x",
            "payload": {"run": "rm -rf"},
        }
    )
    with pytest.raises(
        SessionFormatRefused,
        match="Line 2 is an entry of kind 'shell', which the record does not have",
    ):
        DATALAYER_SESSION_FORMAT.import_([exported.lines[0], planted])
    with pytest.raises(
        SessionFormatRefused,
        match="Line 3 is an entry that does not say when it was recorded",
    ):
        DATALAYER_SESSION_FORMAT.import_(
            [
                exported.lines[0],
                exported.lines[1],
                json.dumps({"record_type": "entry", "kind": "turn", "payload": {}}),
            ]
        )
    with pytest.raises(
        SessionFormatRefused, match="first line is a session line that says its format"
    ):
        DATALAYER_SESSION_FORMAT.import_([exported.lines[1]])
    with pytest.raises(SessionFormatRefused, match="Line 2 of the file is not JSON"):
        DATALAYER_SESSION_FORMAT.import_([exported.lines[0], "{not json"])
    too_many = [exported.lines[0], *([exported.lines[1]] * 20_001)]
    with pytest.raises(SessionFormatRefused) as over:
        DATALAYER_SESSION_FORMAT.import_(too_many)
    assert (
        over.value.status == 413
        and "20 001 entries" in over.value.reason
        and "at most 20 000 entries in 64 MB" in over.value.reason
    )
