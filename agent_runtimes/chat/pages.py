# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The address of an agent page (``/notebook``, ``/document``) for the browser.

The page is served by the agent-runtimes server at ``/static/<page>`` and
talks to that same origin (``window.location.origin``) for the agent's API,
so it is opened at the session's server address. Locally that is the local
server; on Datalayer it is the relay on this machine, which adds the person's
Datalayer token to every request: their token never appears in the URL.

The page reaches the Jupyter server itself, from the browser: its address
and token come from the session's ``jupyter_url`` (``<base>?token=<token>``).
Locally that is the local Jupyter server; on Datalayer it is the runtime's
ingress and the runtime's own Jupyter token, as the Datalayer UI opens a
runtime's notebooks (see ``CloudLaunch.jupyter_url``).
"""

from __future__ import annotations

import os
import urllib.parse
from typing import Optional

#: Set to open the pages from the Vite dev server instead of the built bundle.
DEV_UI = "AGENT_RUNTIMES_DEV_UI"
#: The Vite dev server's address in dev mode.
DEV_UI_URL = "AGENT_RUNTIMES_DEV_UI_URL"


def agent_page_url(
    page: str,
    *,
    server_url: str,
    agent_id: str,
    jupyter_url: Optional[str],
) -> str:
    """The URL that opens ``page`` on the session's agent and Jupyter server.

    In dev mode (``AGENT_RUNTIMES_DEV_UI=1``) the page is loaded from the Vite
    dev server (default ``http://localhost:5173``, ``AGENT_RUNTIMES_DEV_UI_URL``
    for another), which proxies ``/api`` to the backend.
    """
    agent = urllib.parse.quote(agent_id, safe="")
    if os.environ.get(DEV_UI, "").lower() in ("1", "true", "yes", "on"):
        dev_base = os.environ.get(DEV_UI_URL, "http://localhost:5173").rstrip("/")
        url = f"{dev_base}/html/{page}?agentId={agent}"
    else:
        url = f"{server_url.rstrip('/')}/static/{page}?agentId={agent}"
    if jupyter_url:
        base, _, query = jupyter_url.partition("?")
        token = urllib.parse.parse_qs(query).get("token", [""])[0]
        url += f"&jupyterBaseUrl={urllib.parse.quote(base.rstrip('/'), safe='')}"
        if token:
            url += f"&jupyterToken={urllib.parse.quote(token, safe='')}"
    return url
