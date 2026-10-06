# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application mounted into a FastAPI of one's own (LOOP P-25).

``app.mount(api, path="/assistant")`` serves, under ``/assistant`` of the
developer's own FastAPI:

- **the runtime** — agent-runtimes' own app (`create_app`), mounted as it is:
  the session API at ``/assistant/api/v1/apps/sessions``, the chat's AG-UI at
  ``/assistant/api/v1/apps/agents/<id>/ag-ui/``, the window messages of the
  page at ``/assistant/api/v1/apps/sessions/<uid>/window``;
- **the application's agent**, made as the platform makes it (``POST
  /api/v1/agents`` with its Appspec) when the FastAPI starts, the runtime's
  lifespan run inside the developer's;
- **its code**: its ``@app.message``, ``@app.file``, ``@app.window`` and the
  rest react to its sessions, as an example of the catalogue's does;
- **a page** at ``/assistant`` itself: the application, embedded with
  ``<datalayer-app server="…/assistant">``, its Appspec written in the
  element.

Who may call is decided as on any runtime (LOOP R-32): the machine itself;
else a person's token, or an embed token the developer's server issued for
the visit (``token``), from an origin the Appspec names
(``deployment.embedded.origins``) — the page's own included.
"""

from __future__ import annotations

import html
import inspect
import json
from contextlib import asynccontextmanager
from typing import (
    TYPE_CHECKING,
    Any,
    AsyncIterator,
    Awaitable,
    Callable,
    Dict,
    Optional,
    Union,
)

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse

if TYPE_CHECKING:
    from agent_runtimes.app import ServerConfig
    from agent_runtimes.loop.apps.application import Application

#: Where Datalayer serves the embed's script, by default.
EMBED_ORIGIN = "https://datalayer.ai"

#: The script of the embed, on its origin (`src/loop/embed/embedConfig.ts`).
EMBED_SCRIPT_PATH = "/embed/datalayer-app.js"

#: What gives the page the visit's embed token: called with the request.
TokenGiver = Callable[[Request], Union[str, Awaitable[str]]]


def agent_spec_id(reference: str) -> str:
    """The agent spec an application's ``agent`` names, without its version
    (``cog-crawler:0.0.1`` → ``cog-crawler``), as the page names it
    (`agentIdOf`).
    """
    head, colon, version = reference.rpartition(":")
    return head if colon and head and "." in version else reference


def create_payload(application: "Application", app_uid: str = "") -> Dict[str, Any]:
    """What the application's agent is made with: what the page sends a
    runtime (`appDatalayerCreatePayload`), under the application's id.
    """
    spec = application.spec
    if not spec.agent:
        raise ValueError(
            f"{spec.name} is run by a team, which is not mounted yet: name an agent."
        )
    payload: Dict[str, Any] = {
        "name": spec.id,
        "transport": "ag-ui",
        "agent_spec_id": agent_spec_id(spec.agent),
        "app_spec": application.document,
        # Its shell is its code (LOOP R-23): Codemode only when it is on.
        "enable_codemode": bool(spec.permissions.computer.shell),
    }
    if app_uid:
        payload["app_instance"] = {"app_uid": app_uid}
    return payload


async def create_agent(
    runtime: FastAPI, payload: Dict[str, Any], api_prefix: str
) -> None:
    """Make the application's agent through the runtime's own route, in
    process; one already made is kept.

    Raises
    ------
    RuntimeError
        When the runtime refuses it, with what it said.
    """
    import httpx

    transport = httpx.ASGITransport(app=runtime)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://127.0.0.1"
    ) as client:
        made = await client.post(f"{api_prefix}/agents", json=payload, timeout=None)
    if made.status_code not in (200, 201, 409):
        raise RuntimeError(
            f"The agent of {payload['name']} was not made ({made.status_code}): {made.text[:500]}"
        )


def page_of(
    application: "Application",
    server: str,
    *,
    token: str = "",
    embed_origin: str = EMBED_ORIGIN,
) -> str:
    """The page an application mounted at ``server`` is served on: the embed,
    its Appspec written in the element, its agent on ``server``.
    """
    spec = application.spec
    # In a <script> element, `</` would end it: written so that it cannot.
    document = json.dumps(application.document, ensure_ascii=False).replace(
        "</", "<\\/"
    )
    origin = embed_origin.rstrip("/")
    attributes = [f'server="{html.escape(server, quote=True)}"']
    if token:
        attributes.append(f'token="{html.escape(token, quote=True)}"')
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{html.escape(spec.name)}</title>
    <style>
      html, body {{ margin: 0; height: 100%; }}
      datalayer-app {{ display: block; height: 100%; }}
    </style>
    <script src="{html.escape(origin + EMBED_SCRIPT_PATH, quote=True)}" async></script>
  </head>
  <body>
    <datalayer-app {" ".join(attributes)}>
      <script type="application/json">{document}</script>
    </datalayer-app>
  </body>
</html>
"""


def _checked_path(path: str) -> str:
    if not path.startswith("/") or path == "/" or path.endswith("/"):
        raise ValueError(
            f"An application is mounted under a path of its own, “/assistant” for one, not {path!r}."
        )
    return path


def mount(
    application: "Application",
    api: FastAPI,
    path: str = "/assistant",
    *,
    app_uid: str = "",
    token: Optional[TokenGiver] = None,
    embed_origin: str = EMBED_ORIGIN,
    config: Optional["ServerConfig"] = None,
) -> FastAPI:
    """Mount an application into a FastAPI of one's own (LOOP P-25).

    Parameters
    ----------
    application : Application
        The application, its code attached.
    api : FastAPI
        The developer's FastAPI.
    path : str
        Where it is served: ``/assistant`` by default.
    app_uid : str
        The application as Datalayer knows it, when an embed token names it.
    token : callable, optional
        Gives the page the visit's embed token, issued by the developer's
        server (LOOP R-20); none for a page only the machine itself opens.
    embed_origin : str
        Where the embed's script is served.
    config : ServerConfig, optional
        The runtime's configuration; its defaults when unsaid.

    Returns
    -------
    FastAPI
        The runtime, as mounted.

    Raises
    ------
    ValueError
        For a path that is not one of its own, or an application run by a team.
    """
    from agent_runtimes.app import ServerConfig, create_app
    from agent_runtimes.loop.apps.sessions import serve_code

    path = _checked_path(path)
    payload = create_payload(application, app_uid)
    settings = config or ServerConfig()
    runtime = create_app(settings)
    serve_code(application)

    async def page(request: Request) -> HTMLResponse:
        """The application, embedded, its agent on this runtime."""
        given = ""
        if token is not None:
            said = token(request)
            given = str(await said) if inspect.isawaitable(said) else str(said)
        server = str(request.base_url).rstrip("/") + path
        return HTMLResponse(
            page_of(application, server, token=given, embed_origin=embed_origin)
        )

    # The page first, so that the mount does not answer its address.
    for address in (path, f"{path}/"):
        api.add_api_route(address, page, methods=["GET"], include_in_schema=False)
    api.mount(path, runtime)

    outer = api.router.lifespan_context

    @asynccontextmanager
    async def lifespan(app: Any) -> AsyncIterator[Any]:
        """The developer's lifespan, the runtime's inside it, then its agent made."""
        async with outer(app) as state:
            async with runtime.router.lifespan_context(runtime):
                await create_agent(runtime, payload, settings.api_prefix)
                yield state

    api.router.lifespan_context = lifespan
    return runtime
