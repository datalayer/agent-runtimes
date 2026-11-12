# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The routes of an ate actor, at the root.

- ``GET /ate/wakeup`` is the template's ``wakeupProbe``: Agent Substrate's
  ``ResumeActor`` returns once it answers 200. uvicorn accepts connections only
  once the app's lifespan has started, so an answer means the server serves.
  The first probe of a wake runs the wake hooks (:mod:`.lifecycle`).
- ``GET /ate/identity`` says who the actor is: atespace, name, uid, the runtime
  it serves, and its wakes. Nothing secret, and never the worker it runs on.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from .lifecycle import wake_tracker
from .settings import IDENTITY_PATH, WAKEUP_PATH

router = APIRouter(tags=["ate"])


@router.get(WAKEUP_PATH)
async def wakeup() -> dict[str, Any]:
    """Answer Agent Substrate's wakeup probe; a wake runs the wake hooks."""
    tracker = wake_tracker()
    woke = tracker.probe()
    return {"status": "ready", "woke": woke, "wakes": tracker.wakes}


@router.get(IDENTITY_PATH)
async def identity() -> dict[str, Any]:
    """Who the actor is, read now, and its wakes so far."""
    tracker = wake_tracker()
    found = tracker.identity()
    body: dict[str, Any] = {"actor": None} if found is None else dict(found.as_dict())
    body.update(tracker.state())
    return body


__all__ = ["router"]
