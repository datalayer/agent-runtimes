# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's computer, shown where the person is (LOOP R-23).

Under ``/api/v1/apps/agents/{agent}/computer``, for the agent the platform
made for an application:

- ``GET``: its parts — browse, files, shell, each on or off — whether it has
  started, and who has taken it over;
- ``GET …/files?path=``: a directory of its working directory, read-only;
- ``GET …/file?path=``: one of its files, to download;
- ``POST …/take-over``: the person takes it: what runs on it is interrupted,
  and its agent's calls to it wait;
- ``POST …/run``: code the person who took it over runs on it;
- ``POST …/hand-back``: back to its agent, whose calls go on.

Shown only to whoever talks to it in a Preview — the person who opened a
session on the agent, or the machine itself. A deployment's computer is
shared by everyone who opens it, and is shown to nobody yet.
"""

from __future__ import annotations

from typing import Any, Dict, Tuple

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from agent_runtimes.loop.apps.callers import Caller
from agent_runtimes.loop.apps.computer import (
    ComputerRefused,
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
    if deployment_of(instance):
        raise HTTPException(
            status_code=403,
            detail=f"The computer of a deployment of {app.name} is shown to nobody: "
            "everyone who opens it shares it.",
        )
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
        # No sandbox Datalayer runs has a browser yet: none is offered.
        "browser": False,
        "started": has_computer(app) and started(agent),
        "held": holder.describe() if holder else None,
        # Whether the caller is who has it.
        "yours": holder is not None
        and (holder.kind, holder.uid) == (caller.kind, caller.uid),
    }


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
    name = path.rstrip("/").rsplit("/", 1)[-1].replace('"', "")
    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
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
