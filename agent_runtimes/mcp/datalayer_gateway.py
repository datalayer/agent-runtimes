# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Datalayer MCP gateway, as one run reaches it (ORCHESTRATOR.md, O1-17).

An agent that selected the Datalayer MCP server reaches the gateway through a
process started once, with the runtime's own key. A run that carries an
identity of its own — an orchestration worker holding its execution's token, a
one-shot invocation holding its caller's — must not: what the gateway lets the
run reach is decided by that token, and a process key reaches whatever its
owner can. For such a run the process's Datalayer server is left out, and a
toolset holding the run's token takes its place, opened and closed with the run.
"""

from __future__ import annotations

import os
from typing import Any

from pydantic_ai.mcp import MCPToolset

from agent_runtimes.mcp.tracing import tracing_client

__all__ = ["DEFAULT_GATEWAY_URL", "GATEWAY_SERVER_IDS", "gateway_url", "toolsets_for_the_run"]

#: The hosted endpoint, overridable for a staging deployment or a local gateway.
DEFAULT_GATEWAY_URL = "https://mcp.datalayer.run/mcp"

#: The ids a Datalayer gateway server is registered under: the catalog's, and
#: the `/datalayer` chat command's.
GATEWAY_SERVER_IDS = frozenset({"datalayer", "datalayer-jupyter-mcp"})


def gateway_url() -> str:
    """
    The gateway's MCP endpoint.

    Returns
    -------
    str
        ``DATALAYER_JUPYTER_MCP_SERVER_URL``, or the hosted endpoint.
    """
    return (os.environ.get("DATALAYER_JUPYTER_MCP_SERVER_URL") or DEFAULT_GATEWAY_URL).rstrip("/")


def toolsets_for_the_run(toolsets: list[Any], token: str) -> list[Any]:
    """
    A run's toolsets, with the Datalayer gateway reached as the run.

    Parameters
    ----------
    toolsets : list[Any]
        The agent's toolsets, as the process holds them.
    token : str
        The run's own token.

    Returns
    -------
    list[Any]
        The same toolsets when the agent reaches no Datalayer gateway;
        otherwise without the process's Datalayer server, and with a gateway
        toolset authenticated by the run's token in its place.
    """
    kept = [toolset for toolset in toolsets if getattr(toolset, "id", None) not in GATEWAY_SERVER_IDS]
    if len(kept) == len(toolsets):
        # An agent not given the gateway is not given it by a delegation.
        return toolsets
    return [
        *kept,
        MCPToolset(
            gateway_url(),
            id="datalayer",
            http_client=tracing_client(headers={"Authorization": f"Bearer {token}"}),
        ),
    ]
