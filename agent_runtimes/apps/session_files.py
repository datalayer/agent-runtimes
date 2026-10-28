# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ``session.format`` point's first contribution: ``datalayer-session/1`` (MH-F04).

An exporter and importer pair under a format id, read through the point so
that a second format (Omnigent's JSONL, a third party's) is contributed the
same way and the built-in one is no special case. The format itself is
agentspecs' ``sessions/`` kind (:mod:`agent_runtimes.specs.session_files`,
generated): the session line first, one entry line per record entry after
it, the caps, the entry kinds, the redaction rules and the refusal sentences
— the same words on every surface.

**Export** (MH-13) redacts at the source, by the rules the spec names, each
counted: a header or key named ``Authorization``, ``Proxy-Authorization``
or ``Cookie``; a value shaped as a credential **wherever it is** — the
runtime's own :func:`~agent_runtimes.guardrails.credentials.redact` (an API
key, a signed token, a private key), ``Bearer …``, ``Basic …`` or ``token …``
under any key or inside a sentence, and the value of a key, secret or
password field by its name (``arguments.token``, ``client_secret``);
the value of a declared secret, by name; a URL's userinfo; the signed user of
an embed; the runtime's uid and addresses. A file's bytes are never in it: a
file is its entry (name, size, digest, place in the sandbox).

**Import** (MH-14) treats the file as untrusted data: the caps first, then
each line against the spec, an entry of a kind the record does not have
refused, nothing executed or replayed through a tool.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional, Sequence

from agentspecs.sessions import SessionFileError, parse_line, within_caps

from agent_runtimes.guardrails.credentials import WITHHELD, redact
from agent_runtimes.plugins.points import SESSION_FORMATS, Exported, Imported
from agent_runtimes.specs.session_files import (
    SESSION_ENTRY_KINDS,
    SESSION_FILE_FORMAT,
    SESSION_FILE_REFUSALS,
    session_file_refusal,
)

#: What replaces a redacted value in the file.
REDACTED = "[redacted]"

#: Keys whose value is a credential whatever it looks like (`authorization_header`).
HEADER_KEYS = frozenset(
    {
        "authorization",
        "proxy-authorization",
        "proxy_authorization",
        "cookie",
        "set-cookie",
    }
)

#: Keys dropped from every entry (`signed_user`, `runtime_address`).
DROPPED_KEYS = frozenset(
    {"signed", "user", "runs_on", "host", "sandbox_host", "runtime_uid"}
)

_USERINFO = re.compile(r"(?i)\b([a-z][a-z0-9+.-]*://)([^/\s@:]+(?::[^/\s@]*)?)@")

#: A value that reads as a credential by its scheme, wherever it is — under
#: any key, inside a sentence (`bearer_token`): the scheme kept, what
#: follows it replaced; a value already redacted is left as it reads.
_SCHEMED = re.compile(r"(?i)\b(bearer|basic|token)\s+(?!\[redacted\])(\S+)")

#: A key whose value is a credential by its name — a key, secret or
#: password field, under any entry (`bearer_token`): `password`, `secret`,
#: `token`, `api_key`, `access_key`, `private_key`, `credential`, and any key
#: ending in one of them (`client_secret`, `refresh_token`, `aws_secret_key`).
#: Not `tokens` (a count), not a bare `key` (a path's, a column's).
_CREDENTIAL_KEY = re.compile(
    r"(?i)^(?:.*[_.-])?(?:password|passwd|passphrase|secret|token|api_?key|"
    r"access_key|secret_key|private_key|credentials?)$"
)


class SessionFormatRefused(ValueError):
    """A file this format refuses, in the spec's sentence; the status to say it with."""

    def __init__(self, status: int, reason: str):
        super().__init__(reason)
        self.status = status
        self.reason = reason


@dataclass
class Redactor:
    """Redacts one value at a time by the spec's rules, counting what it replaced."""

    #: The values of the declared secrets, by name (`declared_secret`).
    secrets: Dict[str, str] = field(default_factory=dict)
    count: int = 0
    #: How many each rule replaced, by rule id.
    by_rule: Dict[str, int] = field(default_factory=dict)

    def _hit(self, rule: str, times: int = 1) -> None:
        self.count += times
        self.by_rule[rule] = self.by_rule.get(rule, 0) + times

    def text(self, value: str) -> str:
        # What the record withheld as it was written (a credential's shape,
        # a declared secret's value) reads as redacted here, and counts: the
        # file says how many of its values are redacted, whoever did it.
        withheld = value.count(WITHHELD)
        if withheld:
            self._hit("bearer_token", withheld)
            value = value.replace(WITHHELD, REDACTED)
        for name, secret in self.secrets.items():
            if secret and secret in value:
                value = value.replace(secret, REDACTED)
                self._hit("declared_secret")
        shaped = redact(value)
        if shaped != value:
            self._hit(
                "bearer_token", max(1, shaped.count(WITHHELD) - value.count(WITHHELD))
            )
            value = shaped.replace(WITHHELD, REDACTED)
        # `Bearer …`, `Basic …`, `token …` wherever they read — a value under
        # a key that is no header (`arguments.token`), a sentence — not only
        # under an Authorization header or in a shape the guardrail knows.
        schemed, times = _SCHEMED.subn(rf"\1 {REDACTED}", value)
        if times:
            self._hit("bearer_token", times)
            value = schemed
        stripped = _USERINFO.sub(r"\1", value)
        if stripped != value:
            self._hit("url_userinfo")
            value = stripped
        return value

    def value(self, value: Any, *, key: str = "") -> Any:
        if key.lower() in HEADER_KEYS and value not in (None, "", REDACTED):
            self._hit("authorization_header")
            return REDACTED
        if (
            key
            and _CREDENTIAL_KEY.match(key)
            and not isinstance(value, (Mapping, list, tuple))
            and value not in (None, "", REDACTED)
        ):
            # A key, secret or password field: its value is a credential
            # whatever it reads as (`bearer_token`), anywhere in the entry.
            self._hit("bearer_token")
            return REDACTED
        if isinstance(value, str):
            return self.text(value)
        if isinstance(value, Mapping):
            out: Dict[str, Any] = {}
            for inner_key, inner in value.items():
                if str(inner_key) in DROPPED_KEYS:
                    if str(inner_key) in (
                        "runs_on",
                        "host",
                        "sandbox_host",
                        "runtime_uid",
                    ):
                        # The runtime's address: dropped from every file, a
                        # fact of the format rather than a secret found —
                        # noted by rule, not counted (a clean session exports
                        # with zero redactions).
                        self.by_rule["runtime_address"] = (
                            self.by_rule.get("runtime_address", 0) + 1
                        )
                    else:
                        self._hit("signed_user")
                    continue
                out[str(inner_key)] = self.value(inner, key=str(inner_key))
            return out
        if isinstance(value, (list, tuple)):
            return [self.value(inner) for inner in value]
        return value


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def digest_of(lines: Sequence[str]) -> str:
    """The file's digest: ``sha256:`` of its bytes, lines joined by newlines, a trailing one."""
    body = ("\n".join(lines) + "\n").encode("utf-8")
    return "sha256:" + hashlib.sha256(body).hexdigest()


@dataclass
class DatalayerSessionFormat:
    """``datalayer-session/1``: the built-in exporter and importer."""

    id: str = SESSION_FILE_FORMAT

    def export(
        self,
        session: Mapping[str, Any],
        entries: Sequence[Mapping[str, Any]],
        *,
        exported_by: str = "",
        secrets: Optional[Mapping[str, str]] = None,
        kinds: Sequence[str] = (),
        turns: Optional[int] = None,
        **facts: Any,
    ) -> Exported:
        """The file's lines, the session line first, each entry redacted and counted.

        ``session`` is the session as the API describes it (`describe()` or
        `session_from_entries`); ``entries`` its record in order; ``turns``
        how many complete turns the file holds (a turn running when the
        export is asked is left out by the caller, and said here).
        """
        redactor = Redactor(secrets=dict(secrets or {}))
        lines: List[str] = []
        kept = 0
        for entry in entries:
            kind = str(entry.get("kind") or "")
            if kind not in SESSION_ENTRY_KINDS:
                continue
            line = {
                "record_type": "entry",
                "kind": kind,
                "at": str(entry.get("at") or entry.get("created_at") or _now()),
                "summary": redactor.text(str(entry.get("summary") or "")),
                "payload": redactor.value(dict(entry.get("payload") or {})),
            }
            lines.append(json.dumps(line, ensure_ascii=False, default=str))
            kept += 1
        counted = sum(1 for e in entries if e.get("kind") == "turn")
        head_turns = counted if turns is None else int(turns)
        head = {
            "record_type": "session",
            "format": self.id,
            "uid": str(session.get("uid") or ""),
            "app": {
                "id": str((session.get("app") or {}).get("id") or ""),
                "version": int(
                    (session.get("instance") or session.get("app") or {}).get("version")
                    or 0
                ),
            },
            "agent": str(session.get("agent") or ""),
            "harness": session.get("harness") or None,
            "owner": {"uid": str((session.get("opened_by") or {}).get("uid") or "")},
            "state": str(session.get("state") or "paused"),
            "turns": head_turns,
            "title": str(session.get("title") or "")[:200],
            "archived": bool(session.get("archived", False)),
            "lineage": dict(
                session.get("lineage") or {"forked_from": None, "imported_from": None}
            ),
            "kinds": sorted(
                set(kinds)
                or {
                    str(e.get("kind"))
                    for e in entries
                    if e.get("kind") in SESSION_ENTRY_KINDS
                }
            ),
            "entries": kept,
            "exported_at": _now(),
            "exported_by": {"uid": exported_by},
            "redactions": redactor.count,
        }
        return Exported(
            lines=[json.dumps(head, ensure_ascii=False, default=str), *lines],
            redactions=redactor.count,
            turns=head_turns,
            entries=kept,
        )

    def import_(self, lines: Sequence[str], **facts: Any) -> Imported:
        """The session and the entries of a file, each line validated by the spec.

        Raises
        ------
        SessionFormatRefused
            Over the caps (413); the first line not a session line of this
            version, a line that is not JSON, an entry of a kind the record
            does not have or without ``at`` — each 422 in the spec's sentence.
        """
        size = sum(len(line.encode("utf-8")) + 1 for line in lines)
        over = within_caps(size, max(0, len(lines) - 1))
        if over:
            raise SessionFormatRefused(413, over)
        if not lines or not lines[0].strip():
            raise SessionFormatRefused(422, session_file_refusal("unversioned"))
        parsed: List[Any] = []
        for number, line in enumerate(lines, 1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except ValueError:
                raise SessionFormatRefused(
                    422, session_file_refusal("not_json", line=number)
                ) from None
            try:
                parsed.append(parse_line(value, line=number))
            except SessionFileError as refused:
                raise SessionFormatRefused(422, str(refused)) from None
        head = parsed[0]
        if head.record_type == "entry":
            raise SessionFormatRefused(422, session_file_refusal("unversioned"))
        if head.record_type != "session":
            raise SessionFormatRefused(
                422,
                "The file's first line is a team session: import it with `agent-teams sessions import`, "
                "or one seat's own session file here.",
            )
        entries = []
        for item in parsed[1:]:
            if item.record_type != "entry":
                raise SessionFormatRefused(
                    422,
                    "A session file holds one session line, first; this one holds another after its entries.",
                )
            entries.append(
                {
                    "kind": item.kind,
                    "at": item.at,
                    "summary": item.summary,
                    "payload": dict(item.payload),
                }
            )
        return Imported(
            session=head.model_dump(mode="json"),
            entries=entries,
            redactions=head.redactions,
        )


#: The built-in format.
DATALAYER_SESSION_FORMAT = DatalayerSessionFormat()


def formats(platform: Any = None) -> Dict[str, Any]:
    """The formats contributed, by id."""
    from agent_runtimes.plugins.host import accepted, session_platform

    return {
        c.id: c.value for c in accepted(session_platform(platform), SESSION_FORMATS)
    }


def format_named(format_id: str = "", platform: Any = None) -> Any:
    """A format by id — the built-in when none is named.

    Raises
    ------
    SessionFormatRefused
        422, naming the formats known, when none is contributed under the id.
    """
    known = formats(platform)
    wanted = format_id or SESSION_FILE_FORMAT
    if wanted not in known:
        raise SessionFormatRefused(
            422,
            f"There is no session file format {wanted!r}: one of {', '.join(sorted(known))}.",
        )
    return known[wanted]


__all__ = [
    "DATALAYER_SESSION_FORMAT",
    "DROPPED_KEYS",
    "HEADER_KEYS",
    "REDACTED",
    "SESSION_FILE_REFUSALS",
    "DatalayerSessionFormat",
    "Redactor",
    "SessionFormatRefused",
    "digest_of",
    "format_named",
    "formats",
]
