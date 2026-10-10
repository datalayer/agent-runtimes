# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A copilot in a page — Chainlit's cookbook ``copilot`` and ``window-message``,
rebuilt with LOOP's API (LOOP P-27).

Chainlit's copilot is its widget mounted in a page of the developer's
(``mountChainlitWidget``) by a script its server serves, answering
*Hello, world!*; ``window-message`` exchanges messages with the page around
it (``on_window_message``, ``send_window_message``).

Here: the application mounted into the developer's own FastAPI
(``app.mount``, P-25) — its page the embed, as a **bubble** in the corner of
the host's page — answering *Hello, world!* and telling the page what it
received (``session.send_window_message``); what the page posts is an
``@app.window`` turn. Run it with ``uvicorn copilot:api``: the host page is at
``/``, the copilot in its corner; its own page is at ``/copilot``.
"""

import json

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse

from agent_runtimes.loop.apps import Application, Session
from agent_runtimes.loop.apps.mounting import EMBED_ORIGIN, EMBED_SCRIPT_PATH

AGENT = "example-blank:0.0.1"

app = Application.from_spec(
    {
        "schema": "loop.app/v1",
        "id": "copilot",
        "name": "Copilot",
        "kind": "chat",
        "agent": AGENT,
        "description": "A copilot in the corner of a page, talking to the page it sits in.",
        "deployment": {"embedded": {"mode": "bubble"}},
    }
)


@app.message
async def on_message(session: Session, text: str) -> None:
    await session.send("Hello, world!")
    await session.send_window_message(f"Server: Normal message received: {text}")


@app.window
async def window_message(session: Session, data) -> None:
    if isinstance(data, str) and data.startswith("Client: "):
        await session.send(f"Window message received: {data}")
        await session.send_window_message(f"Server: Window message received: {data}")


api = FastAPI()


@api.get("/", response_class=HTMLResponse)
def host_page(request: Request) -> str:
    """Serve the developer's own page, the copilot in it.

    One script tag and one element, as Chainlit's ``index.html`` is one
    script tag and ``mountChainlitWidget``.
    """
    server = str(request.base_url).rstrip("/") + "/copilot"
    spec = json.dumps(app.document).replace("</", "<\\/")
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8" />
<script src="{EMBED_ORIGIN}{EMBED_SCRIPT_PATH}" async></script></head>
<body><h1>Copilot Demo</h1>
<datalayer-app server="{server}"><script type="application/json">{spec}</script></datalayer-app>
</body></html>"""


app.mount(api, path="/copilot")
