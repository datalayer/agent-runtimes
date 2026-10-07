# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A cloud runtime's agent of an application has exactly the terminal's
capabilities (LOOP R-25).

The create route builds an application's capabilities through the one
builder, `app_capabilities` — it used to build its own, without the saving
tool, so an agent on a cloud runtime of an application granted a Space to
write answered *I don't have a save_to_space tool* (drilled 2026-10-07).
Everything runs in process through the real route, the heavy parts stubbed
by `creation_spy`.
"""

import asyncio
from typing import Any, Dict, List

import pytest

from agent_runtimes.loop.apps import principal
from agent_runtimes.loop.apps.agent import app_capabilities
from agent_runtimes.loop.apps.documents import AppDocumentsCapability
from agent_runtimes.loop.apps.enforcement import AppRulesCapability
from agent_runtimes.loop.apps.guards import AppChecksCapability
from agent_runtimes.loop.apps.learning import AppLearningCapability
from agent_runtimes.loop.apps.loading import load_app
from agent_runtimes.loop.apps.record import AppRecordCapability, AppRecorder
from agent_runtimes.loop.apps.saving import SAVE_TOOL, AppSavingCapability
from agent_runtimes.tests.test_agents_create_integration import (  # noqa: F401 - a fixture
    _DummyRequest,
    creation_spy,
)

DEPLOYMENT = {"app_uid": "app-25", "deployment_uid": "dep-25", "version": 2}

NOTES = {
    "schema": "loop.app/v1",
    "id": "r25-notes",
    "name": "R-25 notes",
    "kind": "chat",
    "agent": "jupyter-data-analyst:0.0.1",
    "goal": "Save short notes as pages of a Space when asked.",
    "permissions": {"spaces": [{"space": "sp-granted", "access": "write"}]},
    "contents": ["01KRETURNS", "01KPLANS"],
}


def _created(
    creation_spy: Dict[str, Any],  # noqa: F811 - the fixture
    name: str,
    spec: Dict[str, Any],
    instance: Dict[str, Any],
) -> List[Any]:
    from agent_runtimes.routes.agents import CreateAgentRequest, create_agent

    request = CreateAgentRequest(
        name=name, transport="ag-ui", app_spec=spec, app_instance=instance
    )
    asyncio.run(create_agent(request, _DummyRequest()))
    return list(creation_spy["pydantic_kwargs"]["capabilities"])


@pytest.fixture()
def deployed_principal():
    principal.give_principal_token("dep-25", "narrowed", expires_in=3600)
    yield
    principal.forget_principal_token("dep-25")


def test_a_deployments_agent_on_a_runtime_can_save_to_its_granted_space(
    creation_spy: Dict[str, Any],  # noqa: F811 - the fixture
    deployed_principal: None,
) -> None:
    capabilities = _created(creation_spy, "r25-deployed", NOTES, DEPLOYMENT)
    [saving] = [c for c in capabilities if isinstance(c, AppSavingCapability)]
    assert saving.app_uid == "app-25" and saving.deployment_uid == "dep-25"
    assert SAVE_TOOL == "save_to_space"
    assert SAVE_TOOL in saving.get_toolset().tools


def test_the_route_builds_exactly_what_the_terminal_builds(
    creation_spy: Dict[str, Any],  # noqa: F811 - the fixture
    deployed_principal: None,
) -> None:
    """Rules, checks and record first; then what the agent's spec gave it;
    then its documents, saving and learning — in the terminal's order."""
    on_runtime = _created(creation_spy, "r25-same", NOTES, DEPLOYMENT)
    app = load_app(NOTES)
    in_terminal = app_capabilities(
        app,
        recorder=AppRecorder(
            app=app, app_uid="app-25", deployment_uid="dep-25", version=2
        ),
        agent_id="r25-same",
    )
    ours = (
        AppRulesCapability,
        AppChecksCapability,
        AppRecordCapability,
        AppDocumentsCapability,
        AppSavingCapability,
        AppLearningCapability,
    )
    assert [type(c) for c in on_runtime if isinstance(c, ours)] == [
        type(c) for c in in_terminal if isinstance(c, ours)
    ]
    assert [type(c) for c in on_runtime[:3]] == [type(c) for c in in_terminal[:3]]
    # What the route used to wire by itself is wired by the builder now: the
    # channels it is asked through, what was approved in advance, under
    # which application.
    rules = on_runtime[0]
    assert rules.notify is not None and rules.granted is not None
    assert rules.app_uid == "app-25" and on_runtime[1].app_uid == "app-25"
    assert rules.unattended is not None


def test_a_preview_without_a_granted_space_has_no_saving_tool(
    creation_spy: Dict[str, Any],  # noqa: F811 - the fixture
) -> None:
    plain = {k: v for k, v in NOTES.items() if k != "permissions"}
    capabilities = _created(
        creation_spy, "r25-plain", plain, {"app_uid": "app-25", "version": 2}
    )
    assert not any(isinstance(c, AppSavingCapability) for c in capabilities)
    # An application the platform knows still learns and keeps its record.
    assert any(isinstance(c, AppLearningCapability) for c in capabilities)
    assert any(isinstance(c, AppRecordCapability) for c in capabilities)
