# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's own backend tools reach its agent on a runtime.

A local process refuses an application with backend tools and sends it to a
runtime; the runtime's create route gives the agent the application's tools
beside its agent's, each once. Found shipping the Online Shop on r1: its agent,
`blank`, brings no tools, and without the application's
`online-shop-*` tools it answered its operations with products it made up.
"""

from pathlib import Path

import pytest
import yaml

from agent_runtimes.routes.agents import CreateAgentRequest, create_agent
from agent_runtimes.tests.test_agents_create_integration import (  # noqa: F401
    _DummyRequest,
    creation_spy,
)

agentspecs = pytest.importorskip("agentspecs")

DEMO_SHOP = Path(agentspecs.__file__).parent / "apps" / "online-shop.yaml"


def _demo_shop() -> dict:
    return yaml.safe_load(DEMO_SHOP.read_text())


@pytest.mark.asyncio
async def test_the_runtime_gives_the_agent_the_application_s_backend_tools(
    creation_spy: dict,  # noqa: F811
) -> None:
    spec = _demo_shop()
    request = CreateAgentRequest(
        name="online-shop", agent_spec_id="blank", app_spec=spec
    )
    await create_agent(request, _DummyRequest())
    tool_ids = list(creation_spy["tool_ids"] or [])
    for tool in spec["backend_tools"]:
        assert tool in tool_ids


@pytest.mark.asyncio
async def test_a_tool_both_the_request_and_the_application_name_is_given_once(
    creation_spy: dict,  # noqa: F811
) -> None:
    spec = _demo_shop()
    request = CreateAgentRequest(
        name="online-shop",
        agent_spec_id="blank",
        app_spec=spec,
        backend_tools=["online-shop-find-products:0.0.1"],
    )
    await create_agent(request, _DummyRequest())
    tool_ids = [str(t) for t in creation_spy["tool_ids"] or []]
    assert sum(1 for t in tool_ids if t.startswith("online-shop-find-products")) == 1
    assert "online-shop-place-test-order:0.0.1" in tool_ids
