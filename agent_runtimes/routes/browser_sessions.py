# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A person's browser session for an MCP server, signed in from the chat.

The routes the chat's ``browser-session`` plugin calls on the person's own
runtime (``agent_runtimes.mcp.browser_session``), under the runtime's own
authentication as every ``/configure`` route is:

- ``GET …/{provider}``: the session's state, and whether the runtime's agents
  use its server;
- ``POST …/{provider}/start``: the runtime's browser at the provider's login;
- ``GET …/{provider}/screenshot``: the login page as it shows, a PNG;
- ``POST …/{provider}/click``, ``…/type``, ``…/key``, ``…/scroll``: the
  person's steps on it;
- ``POST …/{provider}/finish``: keep the session, close the browser, start the
  server again;
- ``POST …/{provider}/cancel``: close the browser, keeping nothing;
- ``DELETE …/{provider}``: forget the session.

A visitors' runtime refuses every one (403), and a deployment's never
publishes them.
"""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request, Response

from agent_runtimes.apps.browser import BrowserFailed
from agent_runtimes.apps.computer import ComputerRefused
from agent_runtimes.mcp import browser_session as sessions

router = APIRouter(prefix="/configure/browser-sessions", tags=["browser-sessions"])

STEPS = ("click", "type", "key", "scroll")


def _provider(provider: str) -> sessions.SessionProvider:
    """The provider, on a runtime that is somebody's own."""
    try:
        sessions.refuse_here()
        return sessions.provider_of(provider)
    except sessions.SessionRefused as refused:
        raise HTTPException(status_code=refused.status, detail=refused.detail) from None


async def _answer(work: Any) -> Any:
    """Await a session's work, saying a refusal or a failed browser in its sentence."""
    try:
        return await work
    except sessions.SessionRefused as refused:
        raise HTTPException(status_code=refused.status, detail=refused.detail) from None
    except ComputerRefused as refused:
        raise HTTPException(status_code=refused.status, detail=str(refused)) from None
    except BrowserFailed as failed:
        raise HTTPException(status_code=502, detail=str(failed)) from None


@router.get("/{provider}")
async def session_status(provider: str) -> Dict[str, Any]:
    """The session's state, and whether one is being signed in."""
    chosen = _provider(provider)
    await sessions.refresh(chosen)
    return sessions.status(chosen)


@router.post("/{provider}/start")
async def session_start(provider: str) -> Dict[str, Any]:
    """Open the provider's login page in the runtime's browser."""
    return await _answer(sessions.start(_provider(provider)))


@router.get("/{provider}/screenshot")
async def session_screenshot(provider: str) -> Response:
    """The login page as it shows."""
    png = await _answer(sessions.screenshot(_provider(provider)))
    return Response(
        content=png, media_type="image/png", headers={"Cache-Control": "no-store"}
    )


@router.post("/{provider}/{kind}")
async def session_step(provider: str, kind: str, request: Request) -> Dict[str, Any]:
    """A step of the person's on the login page, or finish, or cancel."""
    chosen = _provider(provider)
    if kind == "finish":
        return await _answer(sessions.finish(chosen))
    if kind == "cancel":
        return await _answer(sessions.cancel(chosen))
    if kind not in STEPS:
        raise HTTPException(
            status_code=404, detail=f"No {kind!r} on a browser session."
        )
    try:
        body = await request.json()
    except ValueError:
        body = {}
    seen = await _answer(
        sessions.step(chosen, kind, body if isinstance(body, dict) else {})
    )
    return {"page": seen.describe()}


@router.delete("/{provider}")
async def session_forget(provider: str) -> Dict[str, Any]:
    """Forget the session: the server goes on without it."""
    return await _answer(sessions.sign_out(_provider(provider)))
