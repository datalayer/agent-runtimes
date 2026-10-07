# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Which of an application's plugins a runtime holds (LOOP F-15).

An application is two Reactor plugins of one name, ``loop-app-<id>``: the
page's, which declares the runtime's as required (``requiredBackendPlugins``),
and the runtime's, registered when the runtime is configured with it. The page
follows the runtime's with Reactor's ``useBackendPluginStream``, which reads
``<base>/plugins/state`` and ``<base>/events/stream``; here the base is
``/api/v1/apps/<id>``:

- ``GET /api/v1/apps/<id>/plugins/state``: Reactor's snapshot — a revision,
  and the application's own plugin when the runtime holds it;
- ``GET /api/v1/apps/<id>/events/stream``: the same snapshot as server-sent
  events, one whenever the revision moves.

Answered to anybody, as Reactor's are — a browser's ``EventSource`` sends no
token — and about one application only, named by whoever asks: a runtime that
several applications share says nothing here of the others.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator, Dict

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from agent_runtimes.loop.apps.plugins import app_plugins_state, revision_of

router = APIRouter(prefix="/apps", tags=["apps"])


@router.get("/{app_id}/plugins/state")
async def plugins_state(app_id: str) -> Dict[str, Any]:
    """Which of the application's plugins this runtime holds, and the revision."""
    return app_plugins_state(app_id)


@router.get("/{app_id}/events/stream")
async def plugins_stream(
    app_id: str,
    request: Request,
    poll_seconds: float = 0.5,
    max_seconds: float = 0.0,
) -> StreamingResponse:
    """The snapshot, sent first and again whenever the revision moves.

    ``max_seconds`` closes the stream after that long (``EventSource``
    reconnects by itself); zero keeps it until the browser goes.
    """

    async def events() -> AsyncIterator[str]:
        last = None
        quiet = 0.0
        elapsed = 0.0
        while not await request.is_disconnected():
            if max_seconds and elapsed >= max_seconds:
                break
            current = revision_of()
            if current != last:
                last = current
                quiet = 0.0
                yield f"data: {json.dumps(app_plugins_state(app_id))}\n\n"
            elif quiet >= 15.0:
                # A comment, so that a proxy does not close a quiet stream.
                quiet = 0.0
                yield ": keep-alive\n\n"
            await asyncio.sleep(poll_seconds)
            quiet += poll_seconds
            elapsed += poll_seconds

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"cache-control": "no-cache", "x-accel-buffering": "no"},
    )
