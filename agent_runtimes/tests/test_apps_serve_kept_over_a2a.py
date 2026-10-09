# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A kept deployment's agent served over A2A at its stable address (STUDIO A-08).

ai-agents makes a deployment's agent on the runtime it keeps it on, then asks
the runtime to serve it over A2A (`PUT /api/v1/apps/a2a`): the route is the
application's, behind its gate, and its card names the deployment's stable
address — where ai-agents forwards its callers — not the runtime's own.
"""

from __future__ import annotations

import json
from typing import Any, Iterator

import httpx
import pytest
from agentspecs.apps import APP_CATALOGUE
from fastapi import HTTPException

from agent_runtimes.loop.apps import a2a as apps_a2a
from agent_runtimes.loop.apps import plugins
from agent_runtimes.loop.apps.callers import LOCAL
from agent_runtimes.loop.apps.deployments import Deployments
from agent_runtimes.routes import a2a as a2a_routes
from agent_runtimes.routes import acp
from agent_runtimes.routes import apps as apps_routes
from agent_runtimes.tests.test_apps_a2a import Accounting

STABLE = "https://r1.example/api/ai-agents/v1/apps/deployments/at/demo-accounting/a2a"
AUTHORIZED = apps_routes.Authorized(LOCAL, None)


@pytest.fixture
def runtime(monkeypatch: Any) -> Iterator[Accounting]:
    """A runtime with the Accounting deployment's agent made, nothing served yet.

    Yields
    ------
    Accounting
        The deployment's agent on the runtime.
    """
    agent = Accounting()
    monkeypatch.setitem(acp._agents, "accounting", (agent, None))
    monkeypatch.setattr(plugins, "find_app", lambda app_id: APP_CATALOGUE.get(app_id))
    a2a_routes._a2a_mounts.clear()
    held = (a2a_routes._app, a2a_routes._api_prefix)
    a2a_routes.set_a2a_app(None)
    yield agent
    apps_a2a.stop_serving_apps()
    a2a_routes.set_a2a_app(*held)


@pytest.mark.asyncio
async def test_its_card_names_the_stable_address_and_visitors_follow_the_deployment(
    runtime: Accounting,
) -> None:
    """Its card names the stable address; visitors are let in as the deployment says."""
    said = await apps_routes.serve_agent_over_a2a(
        apps_routes.ServeOverA2ARequest(agent="accounting", url=STABLE, visitors=True),
        AUTHORIZED,
    )
    assert said["a2a"]["url"] == f"{STABLE}/"
    assert said["a2a"]["card"] == f"{STABLE}/.well-known/agent-card.json"
    assert "visitors" in said["a2a"]
    registration = a2a_routes.get_a2a_agents()["accounting"]
    assert registration.card.url == f"{STABLE}/"
    assert apps_a2a.served_apps() == ["accounting"]
    # Served again closed to visitors: the gate no longer answers them.
    again = await apps_routes.serve_agent_over_a2a(
        apps_routes.ServeOverA2ARequest(agent="accounting", url=STABLE),
        AUTHORIZED,
    )
    assert "visitors" not in again["a2a"]
    stopped = await apps_routes.stop_serving_over_a2a(AUTHORIZED)
    assert stopped["stopped"] == ["accounting"] and apps_a2a.served_apps() == []


@pytest.mark.asyncio
async def test_an_agent_not_made_here_or_not_an_application_is_refused(
    runtime: Accounting, monkeypatch: Any
) -> None:
    """An agent not on the runtime, not an application's, or nowhere to name is refused."""
    with pytest.raises(HTTPException) as missing:
        await apps_routes.serve_agent_over_a2a(
            apps_routes.ServeOverA2ARequest(agent="month-end-close", url=STABLE),
            AUTHORIZED,
        )
    assert missing.value.status_code == 404 and "make it" in missing.value.detail
    monkeypatch.setattr(plugins, "find_app", lambda app_id: None)
    with pytest.raises(HTTPException) as plain:
        await apps_routes.serve_agent_over_a2a(
            apps_routes.ServeOverA2ARequest(agent="accounting", url=STABLE),
            AUTHORIZED,
        )
    assert plain.value.status_code == 409
    monkeypatch.setattr(plugins, "find_app", lambda app_id: APP_CATALOGUE.get(app_id))
    with pytest.raises(HTTPException) as nowhere:
        await apps_routes.serve_agent_over_a2a(
            apps_routes.ServeOverA2ARequest(agent="accounting", url="r1/a2a"),
            AUTHORIZED,
        )
    assert nowhere.value.status_code == 422
    assert apps_a2a.served_apps() == []


def test_loop_apps_deploy_changes_the_deployment_as_the_ship_tab_would() -> None:
    """`loop apps deploy` changes the deployment as the Ship tab would, and reads where it answers."""
    asked: list[httpx.Request] = []

    def ai_agents(request: httpx.Request) -> httpx.Response:
        """ai-agents, answering the change and what keeps it on."""
        asked.append(request)
        if request.method == "PATCH":
            return httpx.Response(
                200, json={"success": True, "deployment": {"uid": "d-1", "a2a": True}}
            )
        return httpx.Response(
            200,
            json={
                "success": True,
                "a2a": {"on": True, "visitors": True, "url": f"{STABLE}/"},
            },
        )

    deployments = Deployments(
        "https://prod1.example",
        "token",
        client=httpx.Client(transport=httpx.MockTransport(ai_agents)),
        ai_agents_url="https://r1.example",
    )
    changed = deployments.change(
        "d-1",
        visibility="public",
        always_on=True,
        spend_limit=50.0,
        a2a=True,
        a2a_visitors=True,
        settings=None,
    )
    assert changed["a2a"] is True
    patch = asked[0]
    assert str(patch.url) == "https://r1.example/api/ai-agents/v1/apps/deployments/d-1"
    assert json.loads(patch.content) == {
        "visibility": "public",
        "always_on": True,
        "spend_limit": 50.0,
        "a2a": True,
        "a2a_visitors": True,
    }
    assert deployments.kept("d-1")["a2a"]["url"] == f"{STABLE}/"
    assert str(asked[1].url).endswith("/deployments/d-1/kept")
