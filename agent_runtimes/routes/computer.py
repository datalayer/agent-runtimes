# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's computer, shown where the person is (LOOP R-23).

Under ``/api/v1/apps/agents/{agent}/computer``, for the agent the platform
made for an application:

- ``GET``: its parts — browse, files, shell, each on or off — whether it has
  started, who has taken it over, and the origin its files are served from
  (``servedFrom``, STUDIO D-22);
- ``GET …/files?path=``: a directory of its working directory, read-only;
- ``GET …/file?path=``: one of its files, to download — always a download
  (`download_headers`): never a page a browser draws, whatever it holds;
- ``POST …/take-over``: the person takes it: what runs on it is interrupted,
  and its agent's calls to it wait;
- ``POST …/run``: code the person who took it over runs on it;
- ``GET …/browser``: the page its browser has open, when browse is on;
- ``GET …/browser/screenshot``: that page as it shows, a PNG, polled by the
  computer view;
- ``POST …/browser/click``, ``…/type``, ``…/key``, ``…/scroll``,
  ``…/open``: the person who took it over clicks where they clicked on the
  screenshot, types, presses a key, scrolls, opens an address;
- ``POST …/hand-back``: back to its agent, whose calls go on.

A Preview's computer is shown to whoever talks to it — the person who
opened a session on the agent — or the machine itself. A deployment's,
shared by everyone who opens it, is shown to its owner and the editors of
its application only, never to the people it acts for (decided 2026-10-06):
ai-agents decides, asked with the caller's own token
(`opening.ensure_may_see_computer`).
"""

from __future__ import annotations

import os
from typing import Any, Dict, Tuple
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from agent_runtimes.loop.apps.browser import (
    KEYS,
    Browser,
    browser_of,
    browser_running,
    find_browser,
)
from agent_runtimes.loop.apps.callers import Caller
from agent_runtimes.loop.apps.computer import (
    ComputerRefused,
    ensure_holder,
    hand_back,
    has_computer,
    holder_of,
    list_files,
    parts_on,
    read_file,
    run_as_person,
    started,
    take_over,
)
from agent_runtimes.types import AppSpec

router = APIRouter(prefix="/apps/agents/{agent}/computer", tags=["apps"])


class RunRequest(BaseModel):
    """Code the person runs on the computer they took over."""

    code: str = Field(..., min_length=1, description="Python, as its sandbox runs it")


class ClickRequest(BaseModel):
    """Where the person clicked, in the screenshot's pixels."""

    x: float = Field(..., ge=0)
    y: float = Field(..., ge=0)


class TypeRequest(BaseModel):
    """What the person typed, where the page's focus is."""

    text: str = Field(..., min_length=1, max_length=10_000)


class KeyRequest(BaseModel):
    """A key the person pressed."""

    key: str = Field(..., description=f"One of {', '.join(KEYS)}")


class ScrollRequest(BaseModel):
    """How far the person scrolled, in pixels (down is positive)."""

    dy: float = Field(..., ge=-10_000, le=10_000)


class OpenRequest(BaseModel):
    """An address the person opens."""

    url: str = Field(..., min_length=1, max_length=4096)


def download_headers(path: str) -> Dict[str, str]:
    """The headers a file of its computer is served with (STUDIO D-22).

    Whatever it holds — a person's upload, what its agent wrote — it is saved,
    never drawn: an attachment, of no type a browser would sniff into a page,
    and sandboxed should it be opened all the same (no script, an origin of
    its own). Its name is said in ASCII and in full (RFC 6266), with nothing
    that could end the header.
    """
    name = path.rstrip("/").rsplit("/", 1)[-1]
    ascii_name = "".join(
        char if 32 <= ord(char) < 127 and char not in '"\\;' else "_" for char in name
    )
    return {
        "Content-Disposition": (
            f'attachment; filename="{ascii_name or "file"}"; '
            f"filename*=UTF-8''{quote(name, safe='')}"
        ),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cache-Control": "no-store",
    }


def served_from() -> str:
    """Where a file of this computer is served from (STUDIO D-22).

    A hosted application hands a person files — a download it wrote, an
    upload read back — and the runtime serves them. The runtimes' host is
    *every* runtime's, so a file served there is same-origin with all of
    them. `DATALAYER_USER_APPS_URL` names a host kept for what applications
    serve, in front of the same route on the same runtime: the operator puts
    it on the runtime's ingress and in its environment, and this says it, so
    the page builds its file links on that origin instead.

    Empty where no such host is configured — a laptop, a plane without one —
    and the runtime's own host serves them, as it did.
    """
    return (os.environ.get("DATALAYER_USER_APPS_URL") or "").strip()


def _refused(refused: ComputerRefused) -> HTTPException:
    """A refusal of the computer as an HTTP one."""
    return HTTPException(status_code=refused.status, detail=refused.reason)


async def _computer(agent: str, request: Request) -> Tuple[AppSpec, Caller]:
    """The application an agent runs, and a caller who may see its computer."""
    from agent_runtimes.loop.apps import sessions
    from agent_runtimes.loop.apps.principal import deployment_of
    from agent_runtimes.routes.apps import _authorize

    try:
        app, instance = sessions.agent_app(agent)
    except sessions.SessionRefused as refused:
        raise HTTPException(status_code=refused.status, detail=refused.reason) from None
    caller = (await _authorize(request, False, app)).caller
    deployment = deployment_of(instance)
    if deployment:
        from agent_runtimes.loop.apps.callers import bearer_of
        from agent_runtimes.loop.apps.opening import NotLetIn, ensure_may_see_computer

        try:
            await ensure_may_see_computer(
                deployment,
                caller,
                bearer_of(request.headers.get("authorization")) or "",
            )
        except NotLetIn as refused:
            raise HTTPException(
                status_code=refused.status, detail=refused.reason
            ) from None
        return app, caller
    if caller.kind == "local":
        return app, caller
    talks = caller.kind == "person" and any(
        live.agent_id == agent and live.answers_to(caller)
        for live in sessions._SESSIONS.values()
    )
    if not talks:
        # Somebody else's is not said to exist.
        raise HTTPException(
            status_code=404,
            detail=f"No session of yours runs on {agent}: its computer is shown "
            "to whoever talks to it.",
        )
    return app, caller


def _with_computer(app: AppSpec) -> None:
    """Refuse an application none of whose parts is on."""
    if not has_computer(app):
        raise HTTPException(
            status_code=409,
            detail=f"{app.name} has no computer: browse, files and shell are all off.",
        )


@router.get("")
async def describe(agent: str, request: Request) -> Dict[str, Any]:
    """Say its parts, on or off; whether it has started; who has it."""
    app, caller = await _computer(agent, request)
    holder = holder_of(agent)
    return {
        "agent": agent,
        "app": app.id,
        "parts": parts_on(app),
        # Whether a browser is installed where its agent runs, and the page
        # it has open: its browser starts on its first page.
        "browser": parts_on(app)["browse"] and _installed(),
        "page": await _page(agent) if parts_on(app)["browse"] else None,
        "started": has_computer(app) and started(agent),
        "held": holder.describe() if holder else None,
        # Whether the caller is who has it.
        "yours": holder is not None
        and (holder.kind, holder.uid) == (caller.kind, caller.uid),
        # Where its files are served from, when a host is kept for them.
        "servedFrom": served_from(),
    }


def _installed() -> bool:
    try:
        find_browser()
    except ComputerRefused:
        return False
    return True


async def _page(agent: str) -> Any:
    browser = browser_running(agent)
    if browser is None:
        return None
    try:
        return (await browser.read()).describe()
    except Exception:
        return None


@router.get("/files")
async def files(agent: str, request: Request, path: str = ".") -> Dict[str, Any]:
    """A directory of its working directory."""
    app, _ = await _computer(agent, request)
    _with_computer(app)
    try:
        return {"path": path or ".", "entries": list_files(agent, path)}
    except ComputerRefused as refused:
        raise _refused(refused) from None


@router.get("/file")
async def download(agent: str, request: Request, path: str) -> Response:
    """One of its files, to save."""
    app, _ = await _computer(agent, request)
    _with_computer(app)
    try:
        content = read_file(agent, path)
    except ComputerRefused as refused:
        raise _refused(refused) from None
    return Response(
        content=content,
        media_type="application/octet-stream",
        headers=download_headers(path),
    )


@router.post("/take-over")
async def take(agent: str, request: Request) -> Dict[str, Any]:
    """The person takes it: what runs is interrupted, its agent's calls wait."""
    app, caller = await _computer(agent, request)
    _with_computer(app)
    try:
        return take_over(agent, caller.kind, caller.uid)
    except ComputerRefused as refused:
        raise _refused(refused) from None


@router.post("/run")
async def run(agent: str, body: RunRequest, request: Request) -> Dict[str, Any]:
    """Code run by the person who took it over, and what it said."""
    _, caller = await _computer(agent, request)
    try:
        return run_as_person(agent, caller.kind, caller.uid, body.code)
    except ComputerRefused as refused:
        raise _refused(refused) from None


@router.post("/hand-back")
async def give_back(agent: str, request: Request) -> Dict[str, Any]:
    """Back to its agent: its waiting calls go on."""
    _, caller = await _computer(agent, request)
    try:
        hand_back(agent, caller.kind, caller.uid)
    except ComputerRefused as refused:
        raise _refused(refused) from None
    return {"held": None}


# --- its browser ----------------------------------------------------------------------


def _with_browser(app: AppSpec) -> None:
    """Refuse an application whose computer does not browse."""
    if not parts_on(app)["browse"]:
        raise HTTPException(
            status_code=409, detail=f"{app.name} does not browse: browse is off."
        )


@router.get("/browser")
async def browser_page(agent: str, request: Request) -> Dict[str, Any]:
    """The page its browser has open, or none before its first."""
    app, _ = await _computer(agent, request)
    _with_browser(app)
    return {"page": await _page(agent)}


@router.get("/browser/screenshot")
async def browser_screenshot(agent: str, request: Request) -> Response:
    """The page its browser has open, as it shows: a PNG."""
    app, _ = await _computer(agent, request)
    _with_browser(app)
    browser = browser_running(agent)
    if browser is None:
        raise HTTPException(status_code=404, detail="Its browser has opened no page.")
    return Response(
        content=await browser.screenshot(),
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


async def _held_browser(agent: str, request: Request) -> Browser:
    """Its browser, for the person who took its computer over only."""
    app, caller = await _computer(agent, request)
    _with_browser(app)
    try:
        ensure_holder(agent, caller.kind, caller.uid)
        return await browser_of(agent)
    except ComputerRefused as refused:
        raise _refused(refused) from None


async def _done(step: Any) -> Dict[str, Any]:
    try:
        return {"page": (await step).describe()}
    except ComputerRefused as refused:
        raise _refused(refused) from None


@router.post("/browser/click")
async def browser_click(
    agent: str, body: ClickRequest, request: Request
) -> Dict[str, Any]:
    """The person clicks on its page where they clicked on its screenshot."""
    browser = await _held_browser(agent, request)
    return await _done(browser.click_at(body.x, body.y))


@router.post("/browser/type")
async def browser_type(
    agent: str, body: TypeRequest, request: Request
) -> Dict[str, Any]:
    """The person types where its page's focus is."""
    browser = await _held_browser(agent, request)
    return await _done(browser.type_text(body.text))


@router.post("/browser/key")
async def browser_key(agent: str, body: KeyRequest, request: Request) -> Dict[str, Any]:
    """The person presses a key on its page."""
    browser = await _held_browser(agent, request)
    return await _done(browser.press(body.key))


@router.post("/browser/scroll")
async def browser_scroll(
    agent: str, body: ScrollRequest, request: Request
) -> Dict[str, Any]:
    """The person scrolls its page."""
    browser = await _held_browser(agent, request)
    return await _done(browser.scroll(body.dy))


@router.post("/browser/open")
async def browser_open(
    agent: str, body: OpenRequest, request: Request
) -> Dict[str, Any]:
    """The person opens an address in its browser."""
    browser = await _held_browser(agent, request)
    return await _done(browser.open(body.url))
