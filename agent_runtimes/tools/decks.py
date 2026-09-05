# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The decks plugin's backend, as tools: read and write decks on the decks server.

Each function here is what a ``tools/decks-*.yaml`` spec binds to
(``runtime.package = agent_runtimes.tools.decks``); its name is the tool's
name, its signature the tool's arguments, its docstring what the model is
told. The same names are implemented in the page by
``@datalayer/loop-plugin-decks`` for a loop that runs in the browser with
no server behind it, so the model sees one set of tools whichever way the
agent runs.

The server is ``DATALAYER_DECKS_URL`` (``http://127.0.0.1:8797``, what
``datalayer decks serve`` listens on, by default). A failure comes back as a
result with an ``error`` the model can read and act on, not an exception
that ends the turn.
"""

from __future__ import annotations

import os
from typing import Any, Optional

import httpx

DECKS_URL_ENVVAR = "DATALAYER_DECKS_URL"
DEFAULT_DECKS_URL = "http://127.0.0.1:8797"

#: For tests: an ``httpx`` transport that stands in for the server.
_TRANSPORT: Optional[httpx.AsyncBaseTransport] = None


def decks_base_url() -> str:
    """Where the decks server is."""
    return (os.environ.get(DECKS_URL_ENVVAR) or DEFAULT_DECKS_URL).rstrip("/")


async def _request(method: str, path: str, body: Any = None) -> Any:
    url = f"{decks_base_url()}{path}"
    async with httpx.AsyncClient(timeout=30.0, transport=_TRANSPORT) as client:
        try:
            response = await client.request(method, url, json=body)
        except httpx.HTTPError as error:
            return {"error": f"The decks server at {decks_base_url()} could not be reached: {error}"}
    if response.status_code >= 400:
        return {"error": f"{method} {url} answered {response.status_code}", "detail": response.text[:2000]}
    if response.status_code == 204 or not response.content:
        return {"ok": True}
    try:
        return response.json()
    except ValueError:
        return response.text


def _summary(record: dict[str, Any]) -> dict[str, Any]:
    spec = record.get("spec") or {}
    deck = spec.get("deck") or {}
    return {
        "id": record.get("id"),
        "collection": record.get("collection") or None,
        "slug": record.get("slug"),
        "title": deck.get("title"),
        "subtitle": deck.get("subtitle"),
        "slides": len(spec.get("slides") or []),
    }


def deck_outline(spec: dict[str, Any]) -> list[dict[str, Any]]:
    """Slide number, type and title of every slide: what "the metrics slide" resolves against."""
    outline = []
    for index, slide in enumerate(spec.get("slides") or [], start=1):
        title = slide.get("title") or slide.get("statement") or slide.get("quote") or ""
        outline.append({"slide": index, "type": slide.get("type"), "title": str(title)[:80]})
    return outline


async def decks_list_decks() -> Any:
    """Every deck the decks server holds.

    Returns:
        A list of decks with their id, collection, slug, title, subtitle and
        slide count. Use the id with the other deck tools.
    """
    records = await _request("GET", "/decks")
    if isinstance(records, dict) and "error" in records:
        return records
    return [_summary(record) for record in records]


async def decks_get_deck(id: str) -> Any:
    """One deck: its full specification and an outline of its slides.

    Args:
        id: The deck id, `collection/slug` or `slug`, as listed by decks_list_decks.

    Returns:
        The deck's summary, its `spec` and an `outline` — slide number, type
        and title for every slide — to find a slide before opening or changing it.
    """
    record = await _request("GET", f"/decks/{id}")
    if isinstance(record, dict) and "error" in record:
        return record
    return {**_summary(record), "spec": record.get("spec"), "outline": deck_outline(record.get("spec") or {})}


async def decks_create_deck(slug: str, spec: dict[str, Any], collection: str = "") -> Any:
    """Create a deck from a complete specification.

    Args:
        slug: URL-safe name; becomes the deck's address.
        spec: The deck specification: `{deck: {title, subtitle?, template?}, slides: [...]}`.
        collection: Optional family the deck belongs to.

    Returns:
        The created deck's summary and outline; its `id` is what the other tools take.
    """
    record = await _request("POST", "/decks", {"collection": collection or "", "slug": slug, "spec": spec})
    if isinstance(record, dict) and "error" in record:
        return record
    return {**_summary(record), "outline": deck_outline(record.get("spec") or {})}


async def decks_update_deck(id: str, slug: str, spec: dict[str, Any], collection: str = "") -> Any:
    """Replace a deck's whole record.

    Args:
        id: The deck to replace, `collection/slug` or `slug`.
        slug: The slug to keep or to move the deck to; the same slug keeps the address.
        spec: The whole new specification.
        collection: The collection, empty for none.

    Returns:
        The deck's summary and outline after the change.
    """
    record = await _request("PUT", f"/decks/{id}", {"collection": collection or "", "slug": slug, "spec": spec})
    if isinstance(record, dict) and "error" in record:
        return record
    return {**_summary(record), "outline": deck_outline(record.get("spec") or {})}


async def _change_slides(id: str, change: Any) -> Any:
    record = await _request("GET", f"/decks/{id}")
    if isinstance(record, dict) and "error" in record:
        return record
    spec = dict(record.get("spec") or {})
    slides = list(spec.get("slides") or [])
    outcome = change(slides)
    if isinstance(outcome, dict) and "error" in outcome:
        return outcome
    spec["slides"] = slides
    return await decks_update_deck(id, record.get("slug") or "", spec, record.get("collection") or "")


async def decks_update_slide(id: str, slide: int, slide_spec: dict[str, Any]) -> Any:
    """Replace one slide of a deck, leaving the rest as they are.

    Args:
        id: The deck id.
        slide: The 1-based number of the slide to replace, from the deck's outline.
        slide_spec: The whole new slide: `{type, ...}`.

    Returns:
        The deck's summary and outline after the change.
    """

    def change(slides: list[Any]) -> Any:
        if not 1 <= slide <= len(slides):
            return {"error": f"There is no slide {slide}; the deck has {len(slides)}."}
        slides[slide - 1] = slide_spec

    return await _change_slides(id, change)


async def decks_insert_slide(id: str, slide: int, slide_spec: dict[str, Any]) -> Any:
    """Insert a slide into a deck.

    Args:
        id: The deck id.
        slide: The 1-based position the new slide takes; the slides from there move down. Past the end appends.
        slide_spec: The slide to insert: `{type, ...}`.

    Returns:
        The deck's summary and outline after the change.
    """

    def change(slides: list[Any]) -> Any:
        position = max(1, min(slide, len(slides) + 1))
        slides.insert(position - 1, slide_spec)

    return await _change_slides(id, change)


async def decks_delete_slide(id: str, slide: int) -> Any:
    """Remove one slide of a deck.

    Args:
        id: The deck id.
        slide: The 1-based number of the slide to remove.

    Returns:
        The deck's summary and outline after the change.
    """

    def change(slides: list[Any]) -> Any:
        if not 1 <= slide <= len(slides):
            return {"error": f"There is no slide {slide}; the deck has {len(slides)}."}
        if len(slides) == 1:
            return {"error": "A deck needs at least one slide; delete the deck instead."}
        del slides[slide - 1]

    return await _change_slides(id, change)


async def decks_delete_deck(id: str) -> Any:
    """Delete a deck. Irreversible.

    Args:
        id: The deck id, `collection/slug` or `slug`.

    Returns:
        `{ok: true}` when it is gone.
    """
    return await _request("DELETE", f"/decks/{id}")
