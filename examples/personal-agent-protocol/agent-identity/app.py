# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Verify one PAP personal-agent identity without returning key material."""

from __future__ import annotations

from typing import Any

from agent_runtimes.loop.apps import Application
from agent_runtimes.pap import PapPersonalAgentCapability

app = Application(
    id="pap-agent-identity",
    name="PAP Agent Identity",
    description="Verify a personal agent's public metadata and signing policy.",
    kind="chat",
    agent="example-blank:0.0.1",
    instructions=(
        "Call inspect_pap_agent before describing an agent identity. Report only "
        "the verified public summary returned by the tool."
    ),
)


@app.tool(does="read")
async def inspect_pap_agent(client_id: str) -> dict[str, Any]:
    """Return verified identity metadata without JWK coordinates or secrets."""

    async with PapPersonalAgentCapability() as capability:
        summary = await capability.inspect_agent(client_id)
    return summary.model_dump()
