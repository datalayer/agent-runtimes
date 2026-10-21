# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Session file format (MH-12).

The datalayer-session/1 JSONL file: its caps, the states, the entry kinds,
the redaction rules and the refusal sentences, as agentspecs says them.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

import json
from typing import Any, Dict, Tuple

#: The format: what a file's first line says.
SESSION_FILE_FORMAT = "datalayer-session/1"

SESSION_FILE_MEDIA_TYPE = "application/x-ndjson"
SESSION_FILE_EXTENSION = ".session.jsonl"

#: A file over either is refused with its counts.
SESSION_FILE_MAX_BYTES = 67108864
SESSION_FILE_MAX_ENTRIES = 20000

#: A session's state, as the record says it.
SESSION_STATES: Tuple[str, ...] = (
    "open",
    "paused",
    "ended",
)

#: The kinds an entry line may carry: the record's, and the session's audit rows.
SESSION_ENTRY_KINDS: Tuple[str, ...] = (
    "session",
    "run",
    "tool_call",
    "decision",
    "check",
    "approval",
    "output",
    "feedback",
    "turn",
    "notification",
    "step",
    "thread",
    "asked",
    "audio",
    "diff",
    "terminal",
    "file",
    "paused",
    "ended",
    "swapped",
    "cloned",
    "imported",
    "exported",
    "titled",
)

#: The redaction rules applied at export, by id, each with what it does.
SESSION_REDACTION_RULES: Dict[str, str] = {
    "authorization_header": "A header or key named Authorization, Proxy-Authorization or Cookie, whatever its value.",
    "bearer_token": "A value that reads `Bearer …`, `Basic …` or `token …`, or a key, secret or password field.",
    "declared_secret": "The value of a secret the application or its harness declares (`requires.secrets`, the Appspec's env), by name.",
    "url_userinfo": "A URL with userinfo (`https://user:pass@host`): the userinfo is dropped.",
    "signed_user": "The user an embed's host signed for the session (`signed`): dropped, with the entry's `user`.",
    "runtime_address": "The runtime's uid and addresses (`runs_on`, the sandbox's host): dropped from every entry.",
}

#: Said, word for word, by whoever refuses a file; `{…}` are filled in.
SESSION_FILE_REFUSALS: Dict[str, str] = {
    "unversioned": "A session file's first line is a session line that says its format, datalayer-session/1; this file's first line does not.",
    "other_version": "The file is {format}; this runtime reads datalayer-session/1.",
    "not_a_line": "Line {line} of the file is not a session, team_session or entry line: it says record_type {record_type!r}.",
    "unknown_kind": "Line {line} is an entry of kind {kind!r}, which the record does not have: one of {kinds}.",
    "entry_without_at": "Line {line} is an entry that does not say when it was recorded (`at`).",
    "team_without_seats": "A team session line names its seats, in order, each with its session uid; this one names none.",
    "too_large": "The file has {entries} entries over {megabytes} MB; a session file holds at most 20 000 entries in 64 MB.",
    "not_json": "Line {line} of the file is not JSON.",
}


def session_file_refusal(name: str, **facts: Any) -> str:
    """The spec's sentence for a refusal, its facts filled in."""
    return SESSION_FILE_REFUSALS[name].format(**facts)


#: The JSON Schema of one line of the file: the session, the team session or an entry.
SESSION_FILE_SCHEMA: Dict[str, Any] = json.loads(
    '{"$defs": {"EntryLine": {"additionalProperties": false, "description": "One entry of the record, as the record holds it, redacted.", "properties": {"at": {"description": "When it was recorded, ISO 8601", "minLength": 1, "title": "At", "type": "string"}, "kind": {"enum": ["session", "run", "tool_call", "decision", "check", "approval", "output", "feedback", "turn", "notification", "step", "thread", "asked", "audio", "diff", "terminal", "file", "paused", "ended", "swapped", "cloned", "imported", "exported", "titled"], "title": "Kind", "type": "string"}, "payload": {"additionalProperties": true, "title": "Payload", "type": "object"}, "record_type": {"pattern": "^entry$", "title": "Record Type", "type": "string"}, "summary": {"default": "", "title": "Summary", "type": "string"}}, "required": ["record_type", "kind", "at"], "title": "EntryLine", "type": "object"}, "ForkedFrom": {"additionalProperties": false, "description": "A clone\'s source: the session, and the turn it was cut at.", "properties": {"at_turn": {"minimum": 0, "title": "At Turn", "type": "integer"}, "uid": {"minLength": 1, "title": "Uid", "type": "string"}}, "required": ["uid", "at_turn"], "title": "ForkedFrom", "type": "object"}, "ImportedFrom": {"additionalProperties": false, "description": "An import\'s source: the file\'s digest, when and by whom it was exported.\\n\\n``exported_by`` is the exporter\'s uid, a string — the shape the record\'s\\n``imported`` entry and the services\' listing say it in (one shape, no\\nsecond one for older readers).", "properties": {"digest": {"pattern": "^sha256:[0-9a-f]{64}$", "title": "Digest", "type": "string"}, "exported_at": {"minLength": 1, "title": "Exported At", "type": "string"}, "exported_by": {"description": "The exporter\'s uid", "minLength": 1, "title": "Exported By", "type": "string"}}, "required": ["digest", "exported_at", "exported_by"], "title": "ImportedFrom", "type": "object"}, "Lineage": {"additionalProperties": false, "description": "Where a session came from: both keys said, each ``null`` when it did not.", "properties": {"forked_from": {"anyOf": [{"$ref": "#/$defs/ForkedFrom"}, {"type": "null"}]}, "imported_from": {"anyOf": [{"$ref": "#/$defs/ImportedFrom"}, {"type": "null"}]}}, "required": ["forked_from", "imported_from"], "title": "Lineage", "type": "object"}, "Owner": {"additionalProperties": false, "description": "Who a session is: a uid, never a handle (a handle is the target\'s to resolve).", "properties": {"uid": {"minLength": 1, "title": "Uid", "type": "string"}}, "required": ["uid"], "title": "Owner", "type": "object"}, "SessionApp": {"additionalProperties": false, "description": "The application a session is of, and the version it was had on.", "properties": {"id": {"minLength": 1, "title": "Id", "type": "string"}, "version": {"minimum": 0, "title": "Version", "type": "integer"}}, "required": ["id", "version"], "title": "SessionApp", "type": "object"}, "SessionLine": {"additionalProperties": false, "description": "The first line: the session.", "properties": {"agent": {"description": "The agentspec bound to it when exported", "minLength": 1, "title": "Agent", "type": "string"}, "app": {"$ref": "#/$defs/SessionApp"}, "archived": {"title": "Archived", "type": "boolean"}, "entries": {"description": "How many entry lines follow", "minimum": 0, "title": "Entries", "type": "integer"}, "exported_at": {"minLength": 1, "title": "Exported At", "type": "string"}, "exported_by": {"$ref": "#/$defs/Owner"}, "format": {"pattern": "^datalayer-session/1$", "title": "Format", "type": "string"}, "harness": {"anyOf": [{"type": "string"}, {"type": "null"}], "description": "Its harness when the agent is one; null otherwise", "title": "Harness"}, "kinds": {"description": "The kinds the application\'s record keeps: what is in the file", "items": {"enum": ["session", "run", "tool_call", "decision", "check", "approval", "output", "feedback", "turn", "notification", "step", "thread", "asked", "audio", "diff", "terminal", "file", "paused", "ended", "swapped", "cloned", "imported", "exported", "titled"], "type": "string"}, "title": "Kinds", "type": "array"}, "lineage": {"$ref": "#/$defs/Lineage"}, "owner": {"$ref": "#/$defs/Owner"}, "record_type": {"pattern": "^session$", "title": "Record Type", "type": "string"}, "redactions": {"description": "How many values redaction replaced or dropped", "minimum": 0, "title": "Redactions", "type": "integer"}, "state": {"$ref": "#/$defs/SessionState"}, "title": {"maxLength": 200, "title": "Title", "type": "string"}, "turns": {"description": "The person\'s turns in the file: up to the last complete one", "minimum": 0, "title": "Turns", "type": "integer"}, "uid": {"title": "Uid", "type": "string"}}, "required": ["record_type", "format", "uid", "app", "agent", "harness", "owner", "state", "turns", "title", "archived", "lineage", "kinds", "entries", "exported_at", "exported_by", "redactions"], "title": "SessionLine", "type": "object"}, "SessionState": {"description": "A session\'s state.", "enum": ["open", "paused", "ended"], "title": "SessionState", "type": "string"}, "TeamForkedFrom": {"additionalProperties": false, "description": "A team session clone\'s source: the run.", "properties": {"execution_id": {"minLength": 1, "title": "Execution Id", "type": "string"}}, "required": ["execution_id"], "title": "TeamForkedFrom", "type": "object"}, "TeamLine": {"additionalProperties": false, "description": "The first line of a team session\'s file: the run, then each seat\'s session follows.", "properties": {"execution_id": {"minLength": 1, "title": "Execution Id", "type": "string"}, "exported_at": {"minLength": 1, "title": "Exported At", "type": "string"}, "exported_by": {"$ref": "#/$defs/Owner"}, "format": {"pattern": "^datalayer-session/1$", "title": "Format", "type": "string"}, "lineage": {"$ref": "#/$defs/TeamLineage"}, "owner": {"$ref": "#/$defs/Owner"}, "record_type": {"pattern": "^team_session$", "title": "Record Type", "type": "string"}, "redactions": {"minimum": 0, "title": "Redactions", "type": "integer"}, "seats": {"description": "In order, each with its session uid; never empty", "items": {"$ref": "#/$defs/TeamSeat"}, "title": "Seats", "type": "array"}, "state": {"$ref": "#/$defs/SessionState"}, "team": {"$ref": "#/$defs/TeamSpecRef"}}, "required": ["record_type", "format", "execution_id", "team", "owner", "state", "seats", "lineage", "exported_at", "exported_by", "redactions"], "title": "TeamLine", "type": "object"}, "TeamLineage": {"additionalProperties": false, "description": "Where a team session came from.", "properties": {"forked_from": {"anyOf": [{"$ref": "#/$defs/TeamForkedFrom"}, {"type": "null"}]}, "imported_from": {"anyOf": [{"$ref": "#/$defs/ImportedFrom"}, {"type": "null"}]}}, "required": ["forked_from", "imported_from"], "title": "TeamLineage", "type": "object"}, "TeamSeat": {"additionalProperties": false, "description": "One seat of a team session, with its session.", "properties": {"agent": {"minLength": 1, "title": "Agent", "type": "string"}, "harness": {"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Harness"}, "id": {"minLength": 1, "title": "Id", "type": "string"}, "session_uid": {"minLength": 1, "title": "Session Uid", "type": "string"}}, "required": ["id", "session_uid", "agent", "harness"], "title": "TeamSeat", "type": "object"}, "TeamSpecRef": {"additionalProperties": false, "description": "The team spec a run was of.", "properties": {"id": {"minLength": 1, "title": "Id", "type": "string"}, "version": {"minLength": 1, "title": "Version", "type": "string"}}, "required": ["id", "version"], "title": "TeamSpecRef", "type": "object"}}, "$id": "https://agentspecs.datalayer.tech/schemas/session-file.json", "$schema": "https://json-schema.org/draft/2020-12/schema", "description": "One line of a datalayer-session/1 file: the session, the team session, or an entry.", "oneOf": [{"$ref": "#/$defs/SessionLine"}, {"$ref": "#/$defs/EntryLine"}, {"$ref": "#/$defs/TeamLine"}], "title": "SessionFileLine"}'
)
