# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's run reaches the Datalayer MCP gateway as the application (plans/STUDIO.md, R-25).

A session's run goes through the agent's AG-UI app, which reached the gateway
with the runtime's key: whatever its launcher may reach. An application's run
reaches it with the application's token instead — a deployment's principal's,
a Preview's narrowed to its granted Spaces — which the gateway holds to those
Spaces. Any other agent's toolsets are left as they are.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from agent_runtimes.loop.apps import principal
from agent_runtimes.loop.apps.principal import gateway_toolsets_of_the_run
from agent_runtimes.mcp import datalayer_gateway
from agent_runtimes.models.models import remember_app_instance

AGENT = "agent-r25"
PREVIEW_TOKEN = "preview-token"
PRINCIPAL_TOKEN = "principal-token"


@pytest.fixture
def seen(monkeypatch: Any) -> Any:
    headers_seen: list[dict[str, str]] = []

    def client(
        headers: dict[str, str] | None = None, **kwargs: Any
    ) -> httpx.AsyncClient:
        headers_seen.append(dict(headers or {}))
        return httpx.AsyncClient(headers=headers)

    monkeypatch.setattr(datalayer_gateway, "tracing_client", client)
    yield headers_seen
    remember_app_instance(AGENT, None)
    principal.forget_principal_token("dep-1")


@pytest.mark.asyncio
async def test_an_agent_of_no_application_keeps_its_toolsets(seen: list) -> None:
    process = SimpleNamespace(id="datalayer")
    assert await gateway_toolsets_of_the_run(AGENT, [process], "persons-token") == [
        process
    ]
    assert seen == []


@pytest.mark.asyncio
async def test_a_previews_run_reaches_the_gateway_with_its_narrowed_token(
    seen: list,
) -> None:
    remember_app_instance(AGENT, {"app_uid": "01APP"})
    chart = SimpleNamespace(id="chart")
    toolsets = await gateway_toolsets_of_the_run(
        AGENT, [chart, SimpleNamespace(id="datalayer")], PREVIEW_TOKEN
    )
    assert toolsets[0] is chart and len(toolsets) == 2
    assert seen == [{"Authorization": f"Bearer {PREVIEW_TOKEN}"}]


@pytest.mark.asyncio
async def test_a_preview_without_a_token_reaches_it_with_none(seen: list) -> None:
    remember_app_instance(AGENT, {"app_uid": "01APP"})
    await gateway_toolsets_of_the_run(AGENT, [SimpleNamespace(id="datalayer")], None)
    assert seen == [{"Authorization": "Bearer "}]


@pytest.mark.asyncio
async def test_a_deployments_run_reaches_it_as_its_principal(seen: list) -> None:
    remember_app_instance(AGENT, {"app_uid": "01APP", "deployment_uid": "dep-1"})
    principal.give_principal_token("dep-1", PRINCIPAL_TOKEN, expires_in=3600)
    await gateway_toolsets_of_the_run(
        AGENT, [SimpleNamespace(id="datalayer")], "openers-token"
    )
    assert seen == [{"Authorization": f"Bearer {PRINCIPAL_TOKEN}"}]
