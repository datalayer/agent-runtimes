# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The transcript of a scene, in Python (LOOP A-06, A-14).

What happens in a scene, as lines, in the order it happened — *You → Sales:
…*, *Sales → Accounting: …*, *Accounting → Odoo: odoo_accounting_aged_balance*,
*Accounting: …* — each with its time. The twin of the page's
``src/components/teams/sceneTranscript.ts``, which is the reference: the
grammar is the TypeScript's, read here the same way so that the rehearsal
(`loop scenes rehearse`) and the page agree on every line. Both are held
to the one fixture, ``agent_runtimes/tests/fixtures/scene_transcript.json``.

One source, read two ways:

- **from spans**, the OpenTelemetry spans the Agent Inspector reads (plain
  dicts in the shape core's ``OtelSpan`` has): an ``invoke_agent`` span is
  what the person asked (*You → Sales*, for a turn with no parent) and what
  the agent answered (*Sales: …*, at its end); an ``a2a`` request is who
  asked whom in what words and what came back (*Accounting: …*, from
  ``a2a.answer.text`` or the last ``a2a.message`` / ``a2a.artifact_update``
  event; *could not answer* when it failed); an ``execute_tool`` span is a
  call (*Accounting → Odoo: odoo_accounting_aged_balance*, the server being
  the connection the tool is of; a tool of no connection is called on *the
  page*, *a skill*, *codemode* or *its runtime* by ``datalayer.tool.kind``).
  A tool call under which an A2A request sits is the asking itself and is
  not a line of its own; the same words said twice are one line; an open
  span is a line still happening; a failed one says so.
- **from a record**, a finished run's entries (``turn``, ``tool_call``, an
  ``output`` standing in for the answer when no conversation is kept).

Pure: spans or entries in, lines out.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

#: The person in the scene, as the transcript names them.
PERSON = "You"

#: What a tool that is no connection's reaches, by where it comes from.
TOOL_HOMES: Dict[str, str] = {
    "frontend": "the page",
    "skill": "a skill",
    "codemode": "codemode",
    "runtime": "its runtime",
}

#: What a line is: words said, a question asked, a tool called.
SAID = "said"
ASKED = "asked"
CALLED = "called"


@dataclass(frozen=True)
class SceneConnection:
    """An MCP server a member reaches: a call to one of its tools is *Member → Server: tool*."""

    id: str
    """The server's id: ``odoo-accounting``."""
    name: str
    """The server's name: ``Odoo Accounting``."""
    label: str
    """What the line says it reaches: ``Odoo``."""
    tools: Tuple[str, ...] = ()
    """Its tools, by name."""
    prefix: str = ""
    """What its tools' names begin with when its spec lists none: ``odoo_accounting_``."""


@dataclass(frozen=True)
class SceneMember:
    """A member of the scene, as the transcript names it."""

    id: str
    """Its id in the team: ``accounting``."""
    name: str
    """Its name, the service its spans are done by: ``Accounting``."""
    connections: Tuple[SceneConnection, ...] = ()


@dataclass(frozen=True)
class TranscriptLine:
    """One line of the transcript (the page's ``SceneTranscriptLine``: ``from`` is ``who``)."""

    key: str
    """Stable, for a list: the span's or the entry's id, and which of its lines."""
    at: int
    """When, in milliseconds since the epoch."""
    who: str
    """Who speaks or acts: a member's name, or the person (`PERSON`)."""
    kind: str
    """`SAID`, `ASKED` or `CALLED`."""
    text: str
    """The words, or the tool's name."""
    to: str = ""
    """Who is asked or called: a member, or a server (``Odoo``); none when words are said to all."""
    open: bool = False
    """Still happening: the call runs, the answer has not come."""
    failed: bool = False
    """It failed: the span's status, the task's state."""
    shows: Tuple[str, ...] = ()
    """What the words come with, when known: ``table``, ``chart``, ``notebook``… (the rehearsal's *a table*)."""


def connection_of_tool(
    tool: str, connections: Sequence[SceneConnection]
) -> Optional[SceneConnection]:
    """The connection a tool is of: by its name, else by its prefix (``connectionOfTool``)."""
    for connection in connections:
        for name in connection.tools:
            if tool == name or tool.endswith(f"_{name}") or tool.endswith(f".{name}"):
                return connection
    for connection in connections:
        if connection.prefix and connection.prefix in tool:
            return connection
    return None


def _text(value: Any) -> str:
    return value if isinstance(value, str) else ""


def message_text(value: Any) -> str:
    """The text of the first message of a GenAI messages attribute (JSON)."""
    if not isinstance(value, str):
        return ""
    try:
        parsed = json.loads(value)
    except ValueError:
        return ""
    if not isinstance(parsed, list) or not parsed or not isinstance(parsed[0], dict):
        return ""
    parts = parsed[0].get("parts") or []
    return "".join(
        part["content"]
        for part in parts
        if isinstance(part, dict) and isinstance(part.get("content"), str)
    ).strip()


def millis(iso: Optional[str], fallback: int = 0) -> int:
    """A time as the span writes it (ISO 8601), in milliseconds since the epoch."""
    if not iso:
        return fallback
    text = iso.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return fallback
    if parsed.tzinfo is None:
        from datetime import timezone

        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(round(parsed.timestamp() * 1000))


def member_named(service: str, members: Sequence[SceneMember]) -> SceneMember:
    """The member a service name is: by name, then by id; else the name itself."""
    for member in members:
        if member.name == service:
            return member
    for member in members:
        if member.id == service:
            return member
    return SceneMember(id=service, name=service)


def called_of(tool: str, kind: str, member: SceneMember) -> str:
    """Where a tool call goes: the connection it is of (``Odoo``), else its home by kind."""
    connection = connection_of_tool(tool, member.connections)
    if connection is not None:
        return connection.label
    return TOOL_HOMES.get(kind) or TOOL_HOMES["runtime"]


def _is_a2a(span: Mapping[str, Any], attributes: Mapping[str, Any]) -> bool:
    return attributes.get("rpc.service") == "a2a" or str(
        span.get("span_name") or ""
    ).startswith("a2a ")


def in_order(lines: Sequence[TranscriptLine]) -> List[TranscriptLine]:
    """The lines in the order they happened: by time, a tie kept as given."""
    return [
        line
        for _, _, line in sorted(
            ((line.at, index, line) for index, line in enumerate(lines)),
            key=lambda item: (item[0], item[1]),
        )
    ]


def once_each(lines: Sequence[TranscriptLine]) -> List[TranscriptLine]:
    """The same thing said twice is said once: an answer comes back as the A2A
    request's events and, when a runtime's own spans are read, as its turn
    too. The first one stands. Words said are the same words whoever they
    were said to.
    """
    seen: set = set()
    kept: List[TranscriptLine] = []
    for line in lines:
        said = (line.kind, line.who, "" if line.kind == SAID else line.to, line.text)
        if said in seen:
            continue
        seen.add(said)
        kept.append(line)
    return kept


def transcript_of_spans(
    spans: Sequence[Mapping[str, Any]], members: Sequence[SceneMember]
) -> List[TranscriptLine]:
    """The transcript of a scene from the spans recorded while it works."""
    lines: List[TranscriptLine] = []
    # A tool call under which an A2A request sits is the asking itself: the
    # request says it, with its words.
    asking = {
        span.get("parent_span_id")
        for span in spans
        if span.get("parent_span_id") and _is_a2a(span, span.get("attributes") or {})
    }
    for span in spans:
        attributes: Mapping[str, Any] = span.get("attributes") or {}
        span_id = str(span.get("span_id") or "")
        start = millis(span.get("start_time"))
        end = millis(span.get("end_time"), start)
        operation = attributes.get("gen_ai.operation.name")
        failed = span.get("status_code") == "ERROR"
        status_message = _text(span.get("status_message"))
        in_progress = bool(span.get("in_progress"))
        if operation == "invoke_agent":
            agent = member_named(
                _text(attributes.get("gen_ai.agent.name"))
                or _text(span.get("service_name")),
                members,
            )
            asked = message_text(attributes.get("gen_ai.input.messages"))
            # The person's question, at the top of a turn; a turn asked by
            # another member is told by its A2A request.
            if asked and not span.get("parent_span_id"):
                lines.append(
                    TranscriptLine(
                        key=f"{span_id}:asked",
                        at=start,
                        who=PERSON,
                        to=agent.name,
                        kind=ASKED,
                        text=asked,
                    )
                )
            said = message_text(attributes.get("gen_ai.output.messages"))
            if said:
                lines.append(
                    TranscriptLine(
                        key=f"{span_id}:said",
                        at=end,
                        who=agent.name,
                        kind=SAID,
                        text=said,
                        failed=failed,
                        shows=_shows_of(attributes),
                    )
                )
            elif failed:
                lines.append(
                    TranscriptLine(
                        key=f"{span_id}:said",
                        at=end,
                        who=agent.name,
                        kind=SAID,
                        text="could not answer"
                        + (f": {status_message}" if status_message else ""),
                        failed=True,
                    )
                )
            continue
        if operation == "execute_tool":
            if span_id in asking:
                continue
            agent = member_named(
                _text(attributes.get("gen_ai.agent.name"))
                or _text(span.get("service_name")),
                members,
            )
            tool = _text(attributes.get("gen_ai.tool.name")) or _text(
                span.get("span_name")
            )
            lines.append(
                TranscriptLine(
                    key=f"{span_id}:called",
                    at=start,
                    who=agent.name,
                    to=called_of(
                        tool, _text(attributes.get("datalayer.tool.kind")), agent
                    ),
                    kind=CALLED,
                    text=tool,
                    open=in_progress,
                    failed=failed,
                )
            )
            continue
        if _is_a2a(span, attributes):
            request = _text(attributes.get("a2a.message.text")).strip()
            if not request:
                # The agent card, a task read: nothing said.
                continue
            asker = member_named(_text(span.get("service_name")), members)
            peer = member_named(_text(attributes.get("peer.service")), members)
            lines.append(
                TranscriptLine(
                    key=f"{span_id}:asked",
                    at=start,
                    who=asker.name,
                    to=peer.name,
                    kind=ASKED,
                    text=request,
                    open=in_progress,
                )
            )
            # What came back: the answer, or the last words of its events.
            answer = _text(attributes.get("a2a.answer.text")).strip()
            answered_at = end
            if not answer:
                for event in span.get("events") or []:
                    if event.get("name") in ("a2a.message", "a2a.artifact_update"):
                        words = _text(
                            (event.get("attributes") or {}).get("a2a.message.text")
                        ).strip()
                        if words:
                            answer = words
                            answered_at = millis(event.get("timestamp"), end)
            if answer:
                lines.append(
                    TranscriptLine(
                        key=f"{span_id}:said",
                        at=answered_at,
                        who=peer.name,
                        to=asker.name,
                        kind=SAID,
                        text=answer,
                        failed=failed,
                        shows=_shows_of(attributes),
                    )
                )
            elif failed:
                lines.append(
                    TranscriptLine(
                        key=f"{span_id}:said",
                        at=end,
                        who=peer.name,
                        to=asker.name,
                        kind=SAID,
                        text="could not answer"
                        + (f": {status_message}" if status_message else ""),
                        failed=True,
                    )
                )
    return once_each(in_order(lines))


def _shows_of(attributes: Mapping[str, Any]) -> Tuple[str, ...]:
    """What an answer comes with, when the span says it (``datalayer.answer.shows``, the rehearsal's)."""
    shows = attributes.get("datalayer.answer.shows")
    if isinstance(shows, str):
        return tuple(part for part in shows.split(",") if part)
    if isinstance(shows, (list, tuple)):
        return tuple(str(part) for part in shows)
    return ()


def _created_at(entry: Mapping[str, Any]) -> int:
    return millis(_text(entry.get("createdAt") or entry.get("created_at")))


def transcript_of_record(
    entries: Sequence[Mapping[str, Any]], member: SceneMember
) -> List[TranscriptLine]:
    """The transcript of one member's run once it is over, from its record.

    A ``turn`` is what the person asked and what it answered, a ``tool_call``
    what it called in between. The calls of a turn are recorded before the
    turn itself (at its close), so the question is placed where the turn
    began.
    """
    ordered = sorted(
        enumerate(entries),
        key=lambda item: (
            _created_at(item[1]),
            int(item[1].get("version") or 0),
            item[0],
        ),
    )
    lines: List[TranscriptLine] = []
    pending: List[TranscriptLine] = []
    answered = False
    for _, entry in ordered:
        at = _created_at(entry)
        payload: Mapping[str, Any] = entry.get("payload") or {}
        uid = str(entry.get("uid") or "")
        kind = entry.get("kind")
        if kind == "tool_call":
            tool = _text(payload.get("tool")) or _text(entry.get("summary"))
            pending.append(
                TranscriptLine(
                    key=f"{uid}:called",
                    at=at,
                    who=member.name,
                    to=called_of(tool, "", member),
                    kind=CALLED,
                    text=tool,
                    failed=bool(payload.get("error")),
                )
            )
        elif kind == "turn":
            asked = _text(payload.get("asked")) or _text(entry.get("summary"))
            said = _text(payload.get("answered"))
            lines.append(
                TranscriptLine(
                    key=f"{uid}:asked",
                    at=pending[0].at if pending else at,
                    who=PERSON,
                    to=member.name,
                    kind=ASKED,
                    text=asked,
                )
            )
            lines.extend(pending)
            pending = []
            if said:
                lines.append(
                    TranscriptLine(
                        key=f"{uid}:said", at=at, who=member.name, kind=SAID, text=said
                    )
                )
            answered = True
        elif kind == "output" and not answered:
            # A record kept without its conversations: the answer's summary.
            pending.append(
                TranscriptLine(
                    key=f"{uid}:said",
                    at=at,
                    who=member.name,
                    kind=SAID,
                    text=_text(entry.get("summary")),
                )
            )
    lines.extend(pending)
    return lines


def time_text(at: int) -> str:
    """A line's time, as a clock reads it: ``14:03:27``."""
    return datetime.fromtimestamp(at / 1000).strftime("%H:%M:%S")


def line_heading(line: TranscriptLine) -> str:
    """Who a line is from and to: ``Sales``, ``Sales → Accounting``, ``Accounting → Odoo``."""
    return f"{line.who} → {line.to}" if line.to and line.kind != SAID else line.who


def line_text(line: TranscriptLine) -> str:
    """A line in words: ``Sales → Accounting: Which invoices are open?``."""
    tail = "…" if line.open else (" (failed)" if line.failed else "")
    return f"{line_heading(line)}: {line.text}{tail}"


def transcript_text(lines: Sequence[TranscriptLine]) -> str:
    """The transcript as text, one line each with its time: what *Copy as text* copies."""
    return "\n".join(f"{time_text(line.at)}  {line_text(line)}" for line in lines)


def with_shows(line: TranscriptLine, shows: Sequence[str]) -> TranscriptLine:
    """The line, saying what its words come with."""
    return replace(line, shows=tuple(shows))
