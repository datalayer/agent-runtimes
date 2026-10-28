# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A second session file format, ``omnigent-jsonl/1``, as a package of its own.

Another tool's export: the first line ``{"record_type": "session_meta", …}``,
then one ``{"record_type": "item", …}`` per item. The importer reads it into
the record's entries — a ``message`` item is a ``turn`` (two messages, the
person's then the agent's, one turn), a ``function_call`` a ``tool_call``;
any other item kind is refused, in a sentence — and the exporter writes the
inverse. Contributed to ``session.format``, it is reached with
``loop sessions import --format omnigent-jsonl/1`` and ``?format=``; the
built-in format is contributed the same way.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Mapping, Sequence

from reactor import ExtensionManifest, PluginManifest, ReactorExtension, hookimpl

FORMAT = "omnigent-jsonl/1"


class OmnigentJsonl:
    id = FORMAT

    def export(
        self,
        session: Mapping[str, Any],
        entries: Sequence[Mapping[str, Any]],
        **facts: Any,
    ) -> Any:
        from agent_runtimes.plugins.points import Exported

        lines = [
            json.dumps(
                {
                    "record_type": "session_meta",
                    "id": session.get("uid"),
                    "agent_id": session.get("agent"),
                    "title": session.get("title", ""),
                }
            )
        ]
        turns = 0
        for entry in entries:
            if entry.get("kind") == "turn":
                payload = entry.get("payload") or {}
                lines.append(
                    json.dumps(
                        {
                            "record_type": "item",
                            "type": "message",
                            "role": "user",
                            "content": payload.get("asked", ""),
                        }
                    )
                )
                lines.append(
                    json.dumps(
                        {
                            "record_type": "item",
                            "type": "message",
                            "role": "assistant",
                            "content": payload.get("answered", ""),
                        }
                    )
                )
                turns += 1
            elif entry.get("kind") == "tool_call":
                payload = entry.get("payload") or {}
                lines.append(
                    json.dumps(
                        {
                            "record_type": "item",
                            "type": "function_call",
                            "name": payload.get("tool", ""),
                            "arguments": {
                                k: v for k, v in payload.items() if k != "tool"
                            },
                        }
                    )
                )
        return Exported(lines=lines, redactions=0, turns=turns, entries=len(lines) - 1)

    def import_(self, lines: Sequence[str], **facts: Any) -> Any:
        from agent_runtimes.apps.session_files import SessionFormatRefused
        from agent_runtimes.plugins.points import Imported

        parsed = [json.loads(line) for line in lines if line.strip()]
        if not parsed or parsed[0].get("record_type") != "session_meta":
            raise SessionFormatRefused(
                422,
                "An omnigent-jsonl/1 file's first line is its session_meta line; this file's first line is not.",
            )
        meta = parsed[0]
        entries: List[Dict[str, Any]] = []
        pending: Dict[str, str] = {}
        for number, item in enumerate(parsed[1:], 2):
            kind = item.get("type")
            if item.get("record_type") != "item":
                raise SessionFormatRefused(422, f"Line {number} is not an item line.")
            if kind == "message":
                if item.get("role") == "user":
                    pending = {"asked": str(item.get("content") or "")}
                else:
                    entries.append(
                        {
                            "kind": "turn",
                            "at": str(item.get("at") or "imported"),
                            "summary": pending.get("asked", ""),
                            "payload": {
                                **pending,
                                "answered": str(item.get("content") or ""),
                            },
                        }
                    )
                    pending = {}
            elif kind == "function_call":
                entries.append(
                    {
                        "kind": "tool_call",
                        "at": str(item.get("at") or "imported"),
                        "summary": str(item.get("name") or ""),
                        "payload": {
                            "tool": item.get("name"),
                            **(item.get("arguments") or {}),
                        },
                    }
                )
            else:
                raise SessionFormatRefused(
                    422,
                    f"Line {number} is an item of kind {kind!r}, which this format does not read: message or function_call.",
                )
        session = {
            "record_type": "session",
            "format": FORMAT,
            "uid": str(meta.get("id") or "omnigent-session"),
            "app": {
                "id": str(meta.get("app_id") or facts.get("app_id") or ""),
                "version": int(meta.get("app_version") or 0),
            },
            "agent": str(meta.get("agent_id") or ""),
            "harness": None,
            "owner": {"uid": str(meta.get("owner") or "")},
            "state": "paused",
            "turns": sum(1 for e in entries if e["kind"] == "turn"),
            "title": str(meta.get("title") or ""),
            "archived": False,
            "lineage": {"forked_from": None, "imported_from": None},
            "kinds": sorted({e["kind"] for e in entries}),
            "entries": len(entries),
            "exported_at": str(meta.get("exported_at") or ""),
            "exported_by": {"uid": str(meta.get("owner") or "")},
            "redactions": 0,
        }
        return Imported(session=session, entries=entries, redactions=0)


class OmnigentPlugin:
    @hookimpl
    def provide_contributions(self, contributions: Any) -> None:
        from agent_runtimes.plugins.points import SESSION_FORMATS

        contributions.contribute(
            SESSION_FORMATS, OmnigentJsonl(), contribution_id=FORMAT
        )


def extension() -> ReactorExtension:
    """The entry point."""
    return ReactorExtension(
        manifest=ExtensionManifest(
            name="omnigent-session-format",
            version="0.0.1",
            display_name="Omnigent session format",
        ),
        plugins=[
            (
                PluginManifest(
                    name="omnigent-session-format",
                    version="0.0.1",
                    description=f"Contributes {FORMAT}.",
                ),
                OmnigentPlugin(),
            )
        ],
    )
