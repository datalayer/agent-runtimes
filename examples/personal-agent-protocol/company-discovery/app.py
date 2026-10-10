# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Discover one PAP company and expose only verified public capabilities."""

from __future__ import annotations

from typing import Any

from agent_runtimes.loop.apps import Application
from agent_runtimes.pap import PapPersonalAgentCapability

app = Application(
    id="pap-company-discovery",
    name="PAP Company Discovery",
    description="Inspect a company's verified Personal Agent Protocol capabilities.",
    kind="chat",
    agent="example-blank:0.0.1",
    instructions=(
        "Call discover_pap_company before describing a domain. Treat its result "
        "as public capability metadata, never as authorization."
    ),
)


@app.tool(does="read")
async def discover_pap_company(domain: str) -> dict[str, Any]:
    """Return a verified, credential-free PAP company summary."""

    async with PapPersonalAgentCapability() as capability:
        summary = await capability.discover_company(domain)
    return summary.model_dump()
