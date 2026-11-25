# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Runtime Engine Catalog.

What runs and hosts an agent (`runtime_engine`): Datalayer, Kagent, AWS AgentCore.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict

from agent_runtimes.types import RuntimeEngineSpec

DATALAYER_RUNTIME_ENGINE_0_0_1 = RuntimeEngineSpec(
    id="datalayer",
    version="0.0.1",
    name="Datalayer",
    description="A Datalayer agent runtime, launched from the platform's pools or on your own machine, metered in credits and known by its uid.",
    docs_url="https://datalayer.ai/docs/agents",
    position=1,
    harnesses=None,
    enabled=True,
)

KAGENT_RUNTIME_ENGINE_0_0_1 = RuntimeEngineSpec(
    id="kagent",
    version="0.0.1",
    name="Kagent",
    description="Kagent, a Kubernetes control plane for agents. The agent is a Kagent Agent (an AgentTemplate and a Harness running `agent-runtimes serve --target kagent` behind the Kagent bridge), reached through Kagent's A2A gateway at /agents/{namespace}/{name}; each conversation is a session actor of Agent Substrate, suspended when idle and resumed on the next message.",
    docs_url="https://kagent.dev",
    position=2,
    harnesses=["pydantic-ai"],
    enabled=True,
)

AGENTCORE_RUNTIME_ENGINE_0_0_1 = RuntimeEngineSpec(
    id="agentcore",
    version="0.0.1",
    name="AWS AgentCore",
    description="Amazon Bedrock AgentCore Runtime in the AWS account of the organization that launches the agent, the agent-runtimes image serving the spec (`agent-runtimes serve --target agentcore`); AgentCore starts it on each invocation, billed to that account.",
    docs_url="https://aws.amazon.com/bedrock/agentcore/",
    position=3,
    harnesses=["pydantic-ai"],
    enabled=True,
)

#: Every runtime engine, by id, the default first.
RUNTIME_ENGINE_CATALOGUE: Dict[str, RuntimeEngineSpec] = {
    "datalayer": DATALAYER_RUNTIME_ENGINE_0_0_1,
    "kagent": KAGENT_RUNTIME_ENGINE_0_0_1,
    "agentcore": AGENTCORE_RUNTIME_ENGINE_0_0_1,
}

#: The engines an agent may name, the default first: the enabled ones alone.
#: A disabled engine stays in the catalogue and is not offered or accepted.
RUNTIME_ENGINES: tuple[str, ...] = tuple(
    engine_id for engine_id, spec in RUNTIME_ENGINE_CATALOGUE.items() if spec.enabled
)

#: The engine of an agent that names none: the first enabled one.
DEFAULT_RUNTIME_ENGINE = RUNTIME_ENGINES[0]

#: The harnesses each engine can run; an engine absent here runs any.
ENGINE_HARNESSES: Dict[str, tuple[str, ...]] = {
    spec.id: tuple(spec.harnesses)
    for spec in RUNTIME_ENGINE_CATALOGUE.values()
    if spec.harnesses is not None
}


def get_runtime_engine(engine_id: str) -> RuntimeEngineSpec | None:
    """The runtime engine an agent's `runtime_engine` names, or None."""
    return RUNTIME_ENGINE_CATALOGUE.get(engine_id)


def list_runtime_engines() -> list[RuntimeEngineSpec]:
    return list(RUNTIME_ENGINE_CATALOGUE.values())
