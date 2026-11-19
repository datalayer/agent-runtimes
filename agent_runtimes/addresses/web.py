# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent's web page: what it is, shown with primer-addons in its own theme.

The page (``agent-web.html``, built into the runtime's static bundle) renders
what :func:`agent_view` says: what it does, its agent (model, MCP servers,
skills, tools), its operations with their inputs and outputs, its protocols,
who may open it and its four addresses, in the application's
``interface.theme`` and ``accent``. The view is written into the page and
served at ``/api/agent``; ``/.well-known/poppy.json`` is its ``poppy.json``.
An application whose ``openapi`` names a gallery (the operation carrying
``x-datalayer-gallery``) shows that operation's answer as product cards: the
page reads it at ``/api/gallery``, called with no input and kept
:data:`GALLERY_SECONDS` (:class:`Gallery`), each read counted under the
caller's rate cap.
Behind the agent's access check, as its other addresses are; a person whose
browser is not signed in to a private agent's page signs in with Datalayer
(:mod:`.browser_sign_in`).
"""

from __future__ import annotations

import asyncio
import html
import json
import time
from contextvars import ContextVar
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from agentspecs.openapi import gallery_operation
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from agent_runtimes.addresses import browser_sign_in
from agent_runtimes.addresses.access import Caller
from agent_runtimes.addresses.addressed import AddressedAgent
from agent_runtimes.addresses.asgi import guarded
from agent_runtimes.addresses.operations import OperationError
from agent_runtimes.addresses.poppy import poppy_document

#: The page's entry in the runtime's static bundle.
PAGE = "agent-web.html"
#: The script tag the view is written in.
VIEW_ID = "agent-runtimes-agent-view"
#: How long the gallery's answer is kept: a page seen often calls its agent once in that time.
GALLERY_SECONDS = 600.0

_CALLER: ContextVar[Optional[Caller]] = ContextVar("addresses_web_caller", default=None)


def _dist() -> Optional[Path]:
    """The runtime's built static bundle, as the main server finds it."""
    package = Path(__file__).resolve().parent.parent
    for candidate in (package.parent / "dist", package / "static" / "dist"):
        if candidate.is_dir():
            return candidate
    return None


def _agent_of(addressed: AddressedAgent) -> Dict[str, Any]:
    """What its agent is made of: its model, MCP servers, skills and tools."""
    from agent_runtimes.apps.agent import _agent_spec

    app = addressed.app
    spec = _agent_spec(app.agent) if app.agent else None
    return {
        "id": app.agent or app.team,
        "name": getattr(spec, "name", "") or app.agent or app.team,
        "description": getattr(spec, "description", "") or "",
        "model": app.model or (getattr(spec, "model", "") or ""),
        "mcp_servers": sorted(
            {
                *(connection.server for connection in app.connections),
                *(
                    str(getattr(server, "id", server))
                    for server in (getattr(spec, "mcp_servers", None) or [])
                ),
            }
        ),
        "skills": sorted(
            {
                *app.skills,
                *[
                    str(getattr(s, "id", s))
                    for s in (getattr(spec, "skills", None) or [])
                ],
            }
        ),
        "tools": [
            {"name": tool.name, "description": tool.description} for tool in app.tools
        ]
        + [{"name": name, "description": ""} for name in app.backend_tools],
    }


def gallery_of(addressed: AddressedAgent) -> Optional[Dict[str, Any]]:
    """The gallery the page shows: the operation that feeds it and its title.

    None when its ``openapi`` names none.
    """
    operation = gallery_operation(addressed.operations)
    if operation is None:
        return None
    return {
        "operation_id": operation.operation_id,
        "title": (operation.gallery or {}).get("title") or "",
    }


class Gallery:
    """The gallery operation's answer, called with no input and kept ``seconds``.

    One call at a time: the pages opened while it runs wait for its answer. A call
    that fails is not kept.
    """

    def __init__(
        self,
        addressed: AddressedAgent,
        operation_id: str,
        *,
        seconds: float = GALLERY_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        """Keep ``operation_id``'s answer of ``addressed`` for ``seconds`` of ``clock``."""
        self.addressed = addressed
        self.operation_id = operation_id
        self.seconds = seconds
        self.clock = clock
        self._answer: Any = None
        self._at: Optional[float] = None
        self._lock = asyncio.Lock()

    async def answer(self, caller: Optional[Caller]) -> Any:
        """The operation's answer: the one kept, or a call's when it is older than ``seconds``."""
        async with self._lock:
            if self._at is not None and self.clock() - self._at < self.seconds:
                return self._answer
            answer = await self.addressed.call(
                self.operation_id, {}, interface="web", caller=caller
            )
            self._answer, self._at = answer, self.clock()
            return answer


def agent_view(addressed: AddressedAgent) -> Dict[str, Any]:
    """What the page shows of the agent."""
    app = addressed.app
    return {
        "id": app.id,
        "name": app.name,
        "description": app.description,
        "emoji": app.emoji,
        "kind": str(getattr(app.kind, "value", app.kind)),
        "role": addressed.role,
        "acts_for": addressed.acts_for,
        "agent": _agent_of(addressed),
        "operations": [
            {
                "operation_id": operation.operation_id,
                "method": operation.method.upper(),
                "path": operation.path,
                "summary": operation.summary,
                "description": operation.description,
                "inputs": operation.input_schema,
                "output": operation.output_schema,
                "pap": operation.pap,
            }
            for operation in addressed.operations
        ],
        "declares_openapi": app.openapi is not None,
        "gallery": gallery_of(addressed),
        "protocols": list(app.protocols),
        "visibility": addressed.access.policy.visibility,
        "addresses": addressed.hosts.as_dict() if addressed.hosts else None,
        "interface": {
            "accent": app.interface.accent,
            "theme": dict(app.interface.theme) if app.interface.theme else None,
        },
    }


def _page(addressed: AddressedAgent, dist: Optional[Path]) -> str:
    view = json.dumps(agent_view(addressed), ensure_ascii=False).replace("</", "<\\/")
    tag = f'<script id="{VIEW_ID}" type="application/json">{view}</script>'
    page = dist / PAGE if dist is not None else None
    if page is not None and page.is_file():
        text = page.read_text(encoding="utf-8")
        return text.replace("<head>", f"<head>\n    {tag}", 1)
    # No bundle built here (a checkout without `npm run build`): the view, plainly.
    name = html.escape(addressed.app.name)
    return (
        f"<!doctype html><html><head><meta charset='utf-8'><title>{name}</title>{tag}</head>"
        f"<body><h1>{name}</h1><p>{html.escape(addressed.app.description)}</p>"
        "<p>The page's bundle is not built here: see <a href='/api/agent'>/api/agent</a>.</p>"
        "</body></html>"
    )


def web_app(addressed: AddressedAgent) -> Any:
    """The agent's web server."""
    dist = _dist()
    shown = gallery_of(addressed)
    gallery = Gallery(addressed, shown["operation_id"]) if shown else None

    async def page(_: Request) -> HTMLResponse:
        return HTMLResponse(_page(addressed, dist))

    async def view(_: Request) -> JSONResponse:
        return JSONResponse(agent_view(addressed))

    async def poppy(_: Request) -> JSONResponse:
        return JSONResponse(poppy_document(addressed))

    async def health(_: Request) -> JSONResponse:
        return JSONResponse({"success": True})

    async def products(_: Request) -> JSONResponse:
        """The gallery's items, for whoever may open the page (its guard), each read counted."""
        if gallery is None:
            return JSONResponse(
                {"detail": f"{addressed.app.name} shows no gallery."}, status_code=404
            )
        caller = _CALLER.get()
        try:
            if caller is not None:
                addressed.access.count(caller)
            return JSONResponse(await gallery.answer(caller))
        except OperationError as error:
            return JSONResponse(error.as_dict(), status_code=error.status)

    routes = [
        Route("/", page, methods=["GET"]),
        Route("/api/agent", view, methods=["GET"]),
        Route("/api/gallery", products, methods=["GET"]),
        Route("/.well-known/poppy.json", poppy, methods=["GET"]),
        Route("/healthz", health, methods=["GET"]),
    ]
    if dist is not None and (dist / "assets").is_dir():
        # The bundle is built for the main server's `/static/` (vite's base): the
        # page asks for `/static/assets/…`, which answered 404 here (a blank page).
        routes.append(
            Mount("/static/assets", app=StaticFiles(directory=dist / "assets"))
        )
    # Discovery and the bundle's files answer anybody; the agent itself only who may open it.
    app = guarded(
        Starlette(routes=routes),
        addressed,
        _CALLER,
        open_paths=("/.well-known/poppy.json", "/healthz", "/static/assets/"),
    )
    if addressed.hosts is None:
        return app
    host = addressed.hosts.host("web")

    async def signed_in_with_datalayer(scope: dict, receive: Any, send: Any) -> None:
        # A person's browser signs in here with Datalayer (`browser_sign_in`).
        if not await browser_sign_in.answer(
            scope, receive, send, host=host, name=addressed.app.name
        ):
            await app(scope, receive, send)

    return signed_in_with_datalayer


__all__ = [
    "GALLERY_SECONDS",
    "PAGE",
    "VIEW_ID",
    "Gallery",
    "agent_view",
    "gallery_of",
    "web_app",
]
