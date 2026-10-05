# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an application knows: a tool that searches the documents it was given (LOOP U-24, R-29).

An Appspec's ``contents`` names its documents by their Home Folder paths. A
Maker gives each one on the Build tab of its page (*What it knows*): Contents
reads it there into passages, keeps them beside its objects, and searches them
with Solr's text search — the documents never leave the platform and no
embedding is computed (R-29, decided in §17 of the plan).

Its agent is given one tool, ``search_documents``: a question in, the passages
that answer it best out, each with its document and where in it (*page 3*,
*Returns › Time limit, lines 5–9*), so the answer can cite the passage it
rests on. It searches only the documents the version that runs names, and
only those given to this application:

- **on a deployment**, as the application's own principal (LOOP I-03, I-13):
  Contents lets it read what its owner gave that application, and nothing
  else;
- **in a Preview**, as the person trying it: what they gave it.

The tool only reads (``read``, F-10), so a rule that leaves reading alone does
not ask before it. An application whose ``contents`` names nothing is given
no tool at all. One not saved on Datalayer — run from a file, tried from the
catalogue — has nothing read for it: the tool says so, and the agent says it
cannot answer from documents.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Mapping, Optional
from urllib.parse import quote

from pydantic_ai.capabilities import AbstractCapability

from agent_runtimes.types import AppSpec

logger = logging.getLogger(__name__)

#: The tool its agent is given, and what it does (F-10's classes).
SEARCH_TOOL = "search_documents"
DOCUMENT_CLASSES: Mapping[str, List[str]] = {SEARCH_TOOL: ["read"]}

#: How many passages a question is answered with.
PASSAGES_PER_QUESTION = 6

#: How long a search may take, in seconds: well inside a first message.
SEARCH_TIMEOUT = 15.0

#: What a search returns: Contents' answer, or raises `DocumentsNotSearched`.
Search = Callable[[str, str, str, List[str], int], Awaitable[Dict[str, Any]]]


class DocumentsNotSearched(RuntimeError):
    """Why its documents could not be searched, in a sentence."""


def documents_of(app: AppSpec) -> List[str]:
    """The documents the application names, by Home Folder path, once each."""
    seen: List[str] = []
    for entry in app.contents or []:
        path = str(entry).strip().strip("/")
        if path and path not in seen:
            seen.append(path)
    return seen


def knows_documents(app: AppSpec) -> bool:
    """Whether it names documents to answer from: then it is given the tool."""
    return bool(documents_of(app))


def _contents_url() -> str:
    from agent_runtimes.mcp.contents_toolset import _contents_url as contents_url

    return contents_url()


async def search_on_contents(
    app_uid: str,
    deployment_uid: str,
    question: str,
    paths: List[str],
    rows: int,
) -> Dict[str, Any]:
    """Ask Contents for the passages, with the token of the run.

    A deployment's is its application's principal's, and nobody else's; a
    Preview's is the person's (`record.token_for`).
    """
    import httpx

    from agent_runtimes.loop.apps.record import token_for

    token, refusal = token_for(deployment_uid)
    if not token:
        raise DocumentsNotSearched(f"there is no token to search them with: {refusal}")
    url = f"{_contents_url().rstrip('/')}/api/contents/v1/apps/{quote(app_uid, safe='')}/passages"
    params: List[tuple[str, str]] = [("q", question), ("rows", str(rows))]
    params.extend(("path", path) for path in paths)
    try:
        async with httpx.AsyncClient(timeout=SEARCH_TIMEOUT) as client:
            response = await client.get(
                url, params=params, headers={"Authorization": f"Bearer {token}"}
            )
    except httpx.HTTPError as error:
        raise DocumentsNotSearched(
            f"Contents could not be reached ({error.__class__.__name__})."
        ) from error
    if response.status_code != 200:
        try:
            said = response.json().get("message") or response.text
        except ValueError:
            said = response.text
        raise DocumentsNotSearched(f"Contents answered {response.status_code}: {said}")
    return response.json()


def passages_in_words(question: str, passages: List[Mapping[str, Any]]) -> str:
    """What the model is told: each passage, numbered, with its document and where in it."""
    if not passages:
        return (
            f"None of the documents you were given says anything about: {question}\n"
            "Say that they do not hold the answer; do not answer from anything else."
        )
    lines = [
        f"The passages of the documents you were given that best answer: {question}",
        "Answer only from them, and cite each passage you use by its document and "
        "where it is in it, as given here — for example (returns.md, page 3).",
        "",
    ]
    for number, passage in enumerate(passages, start=1):
        name = str(passage.get("name") or passage.get("path") or "")
        location = str(passage.get("location") or "")
        lines.append(
            f"[{number}] ({name}, {location})" if location else f"[{number}] ({name})"
        )
        lines.append(str(passage.get("text") or "").strip())
        lines.append("")
    return "\n".join(lines).rstrip()


@dataclass
class AppDocumentsCapability(AbstractCapability[Any]):
    """Gives an application's agent the tool that searches its documents."""

    app: AppSpec
    """The application, whose `contents` says which documents are searched."""

    app_uid: str = ""
    """The application on Datalayer: its documents were given to it there."""

    deployment_uid: str = ""
    """Its deployment, when it runs as one: then it searches as its principal."""

    search: Optional[Search] = None
    """How Contents is asked; over HTTP when unsaid."""

    rows: int = PASSAGES_PER_QUESTION

    _paths: List[str] = field(default_factory=list, init=False, repr=False)

    def __post_init__(self) -> None:
        self._paths = documents_of(self.app)

    async def search_documents(self, question: str) -> str:
        """Search the documents you were given for the passages that answer a question.

        Ask it with the person's question in their own words, or with the words
        the answer would hold. It returns the best passages, each with its
        document and where it is in it, for you to answer from and cite.

        Args:
            question: What to find in the documents.
        """
        question = " ".join(str(question or "").split())
        if not question:
            return "Say what to search the documents for."
        if not self._paths:
            return "You were given no documents to answer from."
        if not self.app_uid:
            return (
                "Nothing has been read of your documents here: they are read for an "
                "application saved on Datalayer, from its page's What it knows. Say that "
                "you cannot answer from them."
            )
        search = self.search or search_on_contents
        try:
            found = await search(
                self.app_uid,
                self.deployment_uid,
                question,
                list(self._paths),
                self.rows,
            )
        except DocumentsNotSearched as error:
            logger.warning("Documents of %s not searched: %s", self.app.id, error)
            return f"Your documents could not be searched: {error} Say that you cannot answer from them now."
        return passages_in_words(question, list(found.get("passages") or []))

    def get_toolset(self) -> Any:
        """The one tool, while it names documents; none otherwise."""
        if not self._paths:
            return None
        from pydantic_ai.toolsets import FunctionToolset

        return FunctionToolset([self.search_documents], id="documents")


__all__ = [
    "DOCUMENT_CLASSES",
    "PASSAGES_PER_QUESTION",
    "SEARCH_TOOL",
    "AppDocumentsCapability",
    "DocumentsNotSearched",
    "documents_of",
    "knows_documents",
    "passages_in_words",
    "search_on_contents",
]
