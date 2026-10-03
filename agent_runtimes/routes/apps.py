# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Applications on a runtime (LOOP R-03).

`POST /api/v1/apps/configure` makes the runtime's agent the one an
application runs: the application's agent, with what the application says
differently — its model, its instructions — reaching only the MCP servers the
application connects to, and with its rules decided before every tool call.
It is `configure-from-spec` with an Appspec: the companion calls one or the
other at launch.

`GET /api/v1/apps/current` says which application the runtime runs, and
`POST /api/v1/apps/decide` what it would do about a tool call — what an
interface shows before it is made. `GET /api/v1/apps` lists the applications
the runtime knows.

An application is a Reactor plugin here as in the page (LOOP §5.4): the
runtime reads applications from the ``loop.app`` contribution point, and
decides their tool calls with what extends their contribution
(`agent_runtimes.loop.apps.plugins`).

An application that its builder's checks would refuse is refused here too,
with the same sentences (422): a runtime never runs what `loop apps validate`
calls not ready.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from agent_runtimes.loop.apps.enforcement import sentence_of
from agent_runtimes.loop.apps.loading import AppNotRunnable, agent_id_of, load_app
from agent_runtimes.loop.apps.plugins import (
    find_app,
    list_apps,
    register_app,
    rules_for,
)
from agent_runtimes.types import AppSpec

router = APIRouter(prefix="/apps", tags=["apps"])

#: The id of the application each agent of this runtime runs, by agent name.
#: The application itself is a contribution of its plugin.
_RUNNING: Dict[str, str] = {}


class ConfigureAppRequest(BaseModel):
    """What the companion sends to run an application."""

    app: Dict[str, Any] = Field(..., description="The Appspec, as its file holds it")
    env_vars: List[Dict[str, str]] = Field(default_factory=list)
    user_token: Optional[str] = None
    jupyter_sandbox: Optional[str] = None
    mcp_proxy_url: Optional[str] = None


class DecideRequest(BaseModel):
    """A tool call to decide, without making it."""

    tool: str = Field(..., description="The tool, as the runtime names it")
    arguments: Dict[str, Any] = Field(default_factory=dict)


def running_app(agent: str = "default") -> Optional[AppSpec]:
    """The application an agent of this runtime runs, or None."""
    app_id = _RUNNING.get(agent)
    return find_app(app_id) if app_id else None


@router.post("/configure")
async def configure_app(
    http_request: Request, body: ConfigureAppRequest
) -> Dict[str, Any]:
    """Make the runtime's agent the one the application runs."""
    try:
        app = load_app(body.app)
    except AppNotRunnable as error:
        raise HTTPException(
            status_code=422, detail={"problems": error.problems}
        ) from None
    if app.team:
        raise HTTPException(
            status_code=422,
            detail={
                "problems": [
                    "An application run by a team is not supported on a runtime yet."
                ]
            },
        )
    from agent_runtimes.routes.agents import (
        ConfigureFromSpecRequest,
        configure_from_spec_endpoint,
    )

    result = await configure_from_spec_endpoint(
        http_request,
        ConfigureFromSpecRequest(
            agent_spec_id=agent_id_of(app),
            env_vars=body.env_vars,
            user_token=body.user_token,
            jupyter_sandbox=body.jupyter_sandbox,
            mcp_proxy_url=body.mcp_proxy_url,
            app_spec=body.app,
            model=app.model or None,
        ),
    )
    # Its own plugin, whether or not agent creation registered it already.
    register_app(app)
    _RUNNING["default"] = app.id
    return {
        **result,
        "app": {
            "id": app.id,
            "version": app.version,
            "name": app.name,
            "emoji": app.emoji,
        },
        "setup": app.setup,
    }


@router.get("")
async def apps() -> Dict[str, Any]:
    """The applications this runtime knows: the catalogue's, and its own."""
    return {
        "apps": [
            {
                "id": app.id,
                "version": app.version,
                "name": app.name,
                "emoji": app.emoji,
                "kind": app.kind,
            }
            for app in list_apps()
        ]
    }


@router.get("/current")
async def current_app() -> Dict[str, Any]:
    """Which application the runtime runs."""
    app = running_app()
    if app is None:
        raise HTTPException(status_code=404, detail="This runtime runs no application.")
    return {
        "id": app.id,
        "version": app.version,
        "name": app.name,
        "emoji": app.emoji,
        "kind": app.kind,
        "setup": app.setup,
    }


@router.post("/decide")
async def decide(body: DecideRequest) -> Dict[str, Any]:
    """What the application would do about a tool call, and why — without making it."""
    app = running_app()
    if app is None:
        raise HTTPException(status_code=404, detail="This runtime runs no application.")
    enforced = rules_for(app).decide(body.tool, body.arguments)
    decision = enforced.decision
    return {
        "behaviour": decision.behaviour,
        "tool": decision.tool,
        "classes": list(decision.classes),
        "because": decision.because,
        "rule": decision.rule,
        "sentence": sentence_of(decision),
        "parts": [
            {
                "tool": part.tool,
                "behaviour": part.behaviour,
                "sentence": sentence_of(part),
            }
            for part in enforced.parts
        ],
    }
