# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The `runtime.target` point (AC-10): the built-in `agentcore` target is
accepted, and a malformed or duplicate target is refused naming the plugin
while the host runs with the rest.
"""

from __future__ import annotations

from typing import Any

import pytest
from reactor import PluginManifest, PluginPlatform, hookimpl

from agent_runtimes.agentcore.target import AGENTCORE_TARGET, AgentCoreTarget
from agent_runtimes.plugins import host
from agent_runtimes.plugins.points import (
    POINTS,
    RUNTIME_TARGETS,
    Deployment,
    RuntimeTarget,
    TargetCapabilities,
)


@pytest.fixture()
def platform() -> PluginPlatform:
    made = PluginPlatform(extension_group="agent-runtimes.tests.targets")
    host.session_platform(made, discover_installed=False)
    return made


class Contributing:
    def __init__(self, *entries: tuple[Any, str]) -> None:
        self.entries = entries

    @hookimpl
    def provide_contributions(self, contributions: Any) -> None:
        for value, cid in self.entries:
            contributions.contribute(
                RUNTIME_TARGETS, value, contribution_id=cid, order=50
            )


def _register(platform: PluginPlatform, name: str, *entries: tuple[Any, str]) -> None:
    platform.register_plugin(
        PluginManifest(name=name, version="0.0.1", description="a test plugin"),
        Contributing(*entries),
    )


class NodeTarget:
    """A well-formed target."""

    def __init__(self, id: str = "agent-node", capabilities: Any = None) -> None:
        self.id = id
        self.capabilities = capabilities or TargetCapabilities(a2a=True)

    async def deploy(self, spec: Any, settings: Any) -> Deployment:
        return Deployment(target=self.id, agent_spec_id=str(spec), id="n-1")

    async def invoke(self, deployment: Deployment, session_uid: str, run_input: Any):
        yield {"type": "RUN_STARTED"}

    async def status(self, deployment: Deployment) -> dict:
        return {"status": "READY"}

    async def stop(self, deployment: Deployment, session_uid: str) -> None:
        return None

    async def destroy(self, deployment: Deployment) -> None:
        return None


def test_the_point_is_listed_and_agentcore_is_contributed(
    platform: PluginPlatform,
) -> None:
    assert RUNTIME_TARGETS in POINTS and RUNTIME_TARGETS.id == "runtime.target"
    [agentcore] = host.accepted(platform, RUNTIME_TARGETS)
    assert agentcore.id == "agentcore" and agentcore.plugin == host.BUILTIN_PLUGIN
    assert agentcore.value is AGENTCORE_TARGET
    assert isinstance(AGENTCORE_TARGET, RuntimeTarget)
    assert AGENTCORE_TARGET.capabilities == TargetCapabilities(
        resume=True, pause=False, a2a=False, gpu=False, customer_account=True
    )
    [builtin] = [p for p in platform.list_plugins() if p["name"] == host.BUILTIN_PLUGIN]
    assert "runtime.target" in builtin["contribution_points"]
    described = host.describe_plugins(platform)
    contributions = described["extensions"][0]["plugins"][0]["contributions"]
    assert {"point": "runtime.target", "id": "agentcore", "order": 0} in contributions


def test_a_well_formed_target_from_a_plugin_is_accepted(
    platform: PluginPlatform,
) -> None:
    _register(platform, "agent-node-target", (NodeTarget(), "agent-node"))
    assert [c.id for c in host.accepted(platform, RUNTIME_TARGETS)] == [
        "agentcore",
        "agent-node",
    ]
    assert host.refusals(platform) == []


def test_a_malformed_target_is_refused_naming_the_plugin_and_the_host_runs(
    platform: PluginPlatform,
) -> None:
    class NoDestroy(NodeTarget):
        destroy = None  # type: ignore[assignment]

    _register(
        platform,
        "broken-targets",
        (object(), "nothing"),
        (NoDestroy("half"), "half"),
        (NodeTarget("pool", capabilities={"gpu": True}), "pool"),
        (NodeTarget("named-otherwise"), "elsewhere"),
    )
    refused = {r.contribution_id: r.reason for r in host.refusals(platform)}
    assert refused["nothing"] == (
        "broken-targets contributes runtime.target 'nothing' that is not a RuntimeTarget: "
        "it lacks deploy, invoke, status, stop, destroy."
    )
    assert refused["half"] == (
        "broken-targets contributes runtime.target 'half' that is not a RuntimeTarget: "
        "it lacks destroy."
    )
    assert refused["pool"] == (
        "broken-targets contributes runtime.target 'pool' without its capabilities: "
        "a TargetCapabilities says what it can do."
    )
    assert refused["elsewhere"] == (
        "broken-targets contributes runtime.target 'elsewhere' whose target says id "
        "'named-otherwise': a target is contributed under its id."
    )
    assert [c.id for c in host.accepted(platform, RUNTIME_TARGETS)] == ["agentcore"]


def test_a_second_agentcore_is_refused_by_name(platform: PluginPlatform) -> None:
    _register(platform, "agentcore-again", (AgentCoreTarget(), "agentcore"))
    [refusal] = host.refusals(platform)
    assert refusal.line() == (
        "agentcore-again: runtime.target 'agentcore' refused — agentcore-again contributes "
        "runtime.target 'agentcore', which agent-runtimes.sessions contributed first: "
        "one runtime.target per id."
    )
    [kept] = host.accepted(platform, RUNTIME_TARGETS)
    assert kept.value is AGENTCORE_TARGET


def test_a_deployment_round_trips_as_a_dict() -> None:
    deployment = Deployment(
        target="agentcore",
        agent_spec_id="crawler",
        id="rt-1",
        arn="arn:aws:bedrock-agentcore:us-east-1:111122223333:runtime/rt-1",
        version="1",
        status="READY",
        endpoint="DEFAULT",
        region="us-east-1",
    )
    assert Deployment.from_dict(deployment.as_dict()) == deployment
