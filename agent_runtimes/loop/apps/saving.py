# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Approve and save: a result an application keeps, written as a page of a Space (LOOP R-24).

An application whose Appspec grants it a Space to write (`permissions.spaces`,
``access: write``) is given one tool, ``save_to_space``: a title and the text
it wants to keep, in markdown. Nothing is written before a person saw it:

- **shown first.** The call is always asked — whatever the application's rules
  say of writing, short of *Leave it to me*, which refuses it — and never
  passed by an approval given in advance (`enforcement`): the person is shown
  the title and the whole text (up to `DRAFT_LIMIT` characters, the most the
  tool takes) on the approvals path, with *Approve and save* and *Decline*.
- **Approve and save** writes it as an editable page of the Space — a Lexical
  document, its title the heading, its text as headings, lists and
  paragraphs — and answers its link.
- **Decline** keeps nothing: the tool never runs.
- **A retry returns the same page.** The write names an idempotency key — the
  application, the session, the Space and what is saved — and Spacer answers
  a retry under that key with the page the first write made, never a second
  one; a retry after a failure, by the model or by the person, keeps one page.

It writes with the token of the run: a deployment's application principal,
which the Space was shared with when it was deployed (LOOP I-13); a
Preview's person. A visitor without an account only reads (R-30): the call is
refused before anybody is asked.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, List, Mapping, Optional
from urllib.parse import quote

from pydantic_ai.capabilities import AbstractCapability

from agent_runtimes.types import AppSpec

logger = logging.getLogger(__name__)

#: The tool its agent is given, and what it does (F-10's classes).
SAVE_TOOL = "save_to_space"
SAVING_CLASSES: Mapping[str, List[str]] = {SAVE_TOOL: ["write"]}

#: Why a save is asked whatever the rules say: it is shown first.
APPROVE_AND_SAVE = "approve_and_save"

#: The longest text saved, in characters: all of it is shown before it is.
DRAFT_LIMIT = 20_000

#: The longest title.
TITLE_LIMIT = 200

#: How long Spacer is waited for, in seconds.
SAVE_TIMEOUT = 30.0

#: What a write returns: Spacer's document and its space, or raises `NotSaved`.
Write = Callable[[str, str, Dict[str, Any], str], Awaitable[Dict[str, Any]]]


class NotSaved(RuntimeError):
    """Why a result could not be saved, in a sentence."""


def writable_spaces(app: AppSpec) -> List[str]:
    """The Spaces its Appspec grants it to write, once each, in its order."""
    found: List[str] = []
    for grant in app.permissions.spaces:
        space = str(grant.space or "").strip()
        if grant.access == "write" and space and space not in found:
            found.append(space)
    return found


def saves(app: AppSpec) -> bool:
    """Whether it may save a result: a Space is granted to write."""
    return bool(writable_spaces(app))


def idempotency_key(
    app: str, session: str, space: str, title: str, content: str
) -> str:
    """One page per application, session, Space and what is saved."""
    digest = hashlib.sha256(
        json.dumps([space, title, content], ensure_ascii=False).encode("utf-8")
    ).hexdigest()[:40]
    return f"loop:{app}:{session or 'none'}:{digest}"[:200]


def link_of(space: Mapping[str, Any], document_uid: str) -> str:
    """Where the saved page is opened on the site: under its Space's owner and handle."""
    owner = str(space.get("owner_handle_s") or space.get("owner_handle") or "")
    handle = str(space.get("handle_s") or space.get("handle") or "")
    if not owner or not handle:
        return f"/documents/{quote(document_uid, safe='')}"
    return (
        f"/{quote(owner, safe='')}/{quote(handle, safe='')}"
        f"/documents/{quote(document_uid, safe='')}"
    )


async def write_on_spacer(
    space: str, title: str, editor_state: Dict[str, Any], key: str, *, token: str
) -> Dict[str, Any]:
    """Create the page in the Space through Spacer, under its idempotency key.

    Answers ``{"document": …, "space": …}``; `NotSaved` in a sentence.
    """
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    base = getattr(DatalayerURLs.from_environment(), "spacer_url", "") or ""
    if not base:
        raise NotSaved("there is no Spacer to save it in.")
    api = f"{base.rstrip('/')}/api/spacer/v1"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=SAVE_TIMEOUT, headers=headers) as client:
            found = await client.get(f"{api}/spaces/{quote(space, safe='')}")
            body = _json(found)
            if found.status_code >= 300 or not isinstance(body.get("space"), dict):
                raise NotSaved(
                    f"the Space {space} cannot be reached: "
                    f"{body.get('detail') or body.get('message') or found.status_code}."
                )
            space_doc = body["space"]
            created = await client.post(
                f"{api}/lexicals",
                data={
                    "spaceId": str(space_doc.get("uid") or space),
                    "documentType": "lexical",
                    "name": title,
                    "description": "",
                    "metadata": json.dumps({"saved_by": "loop.app"}),
                    "idempotencyKey": key,
                },
                files={
                    "file": (
                        "page.lexical",
                        json.dumps(editor_state).encode("utf-8"),
                        "application/json",
                    )
                },
            )
    except httpx.HTTPError as error:
        raise NotSaved(
            f"Spacer could not be reached ({error.__class__.__name__})."
        ) from error
    answer = _json(created)
    document = answer.get("document")
    if (
        created.status_code >= 300
        or answer.get("success") is False
        or not isinstance(document, dict)
        or not document.get("uid")
    ):
        raise NotSaved(
            f"Spacer refused it: {answer.get('message') or answer.get('detail') or created.status_code}."
        )
    return {"document": document, "space": space_doc}


def _json(response: Any) -> Dict[str, Any]:
    try:
        body = response.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


@dataclass
class AppSavingCapability(AbstractCapability[Any]):
    """Gives an application's agent the tool that saves a result, once approved."""

    app: AppSpec
    """The application, whose `permissions.spaces` say where it may save."""

    app_uid: str = ""
    """The application on Datalayer."""

    deployment_uid: str = ""
    """Its deployment, when it runs as one: then it saves as its principal."""

    write: Optional[Write] = None
    """How Spacer is written to; over HTTP, with the token of the run, when unsaid."""

    async def save_to_space(self, title: str, content: str, space: str = "") -> str:
        """Save a result as a page of a Space, after the person approves it.

        The person is shown the title and the whole text first, and chooses
        *Approve and save* or *Decline*: nothing is saved until they approve.
        Use it for a result worth keeping — a report, a summary, a draft —
        written in full, in markdown. It answers the page's link to give them.

        Args:
            title: The page's title.
            content: The whole text to keep, in markdown.
            space: The Space to save in, when it may save in several; its first otherwise.
        """
        spaces = writable_spaces(self.app)
        if not spaces:
            return "No Space is granted to you to save in: say that you cannot save it."
        target = str(space or "").strip() or spaces[0]
        if target not in spaces:
            return (
                f"You may save only in {', '.join(spaces)}, not in {target}: "
                "save it in one of those, or say that you cannot."
            )
        title = " ".join(str(title or "").split())
        content = str(content or "").strip()
        if not title or not content:
            return "Give the page a title and the whole text to keep."
        if len(title) > TITLE_LIMIT:
            return f"A title is at most {TITLE_LIMIT} characters: make it shorter."
        if len(content) > DRAFT_LIMIT:
            return (
                f"A page saved this way is at most {DRAFT_LIMIT:,} characters, all of "
                "it shown to the person first: make it shorter."
            )
        from agent_runtimes.loop.apps.record import current_session
        from agent_runtimes.orchestration.documents import markdown_document

        key = idempotency_key(
            self.app_uid or self.app.id, current_session(), target, title, content
        )
        state = markdown_document(title, content)
        try:
            written = await (self.write or self._write_with_token)(
                target, title, state, key
            )
        except NotSaved as error:
            logger.warning("%s could not save %r: %s", self.app.id, title, error)
            return f"It was approved, but not saved: {error} Say so; trying again saves it once."
        document = written["document"]
        link = link_of(written.get("space") or {}, str(document["uid"]))
        return f"Saved as “{title}”: {link}"

    async def _write_with_token(
        self, space: str, title: str, state: Dict[str, Any], key: str
    ) -> Dict[str, Any]:
        from agent_runtimes.loop.apps.record import token_for

        token, refusal = token_for(self.deployment_uid)
        if not token:
            raise NotSaved(f"there is no token to save it with: {refusal}")
        return await write_on_spacer(space, title, state, key, token=token)

    def get_toolset(self) -> Any:
        """The one tool, while a Space is granted to write; none otherwise."""
        if not saves(self.app):
            return None
        from pydantic_ai.toolsets import FunctionToolset

        return FunctionToolset([self.save_to_space], id="saving")


__all__ = [
    "APPROVE_AND_SAVE",
    "DRAFT_LIMIT",
    "SAVE_TOOL",
    "SAVING_CLASSES",
    "AppSavingCapability",
    "NotSaved",
    "idempotency_key",
    "link_of",
    "saves",
    "writable_spaces",
    "write_on_spacer",
]
