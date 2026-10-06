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

__all__ = [
    "DEFAULT_GATEWAY_URL",
    "GATEWAY_SERVER_IDS",
    "gateway_query",
    "gateway_url",
    "toolsets_for_the_run",
]

#: The hosted endpoint, overridable for a staging deployment or a local gateway.
DEFAULT_GATEWAY_URL = "https://mcp.datalayer.run/mcp"

#: The ids a Datalayer gateway server is registered under: the catalog's, and
#: the `/datalayer` chat command's.
GATEWAY_SERVER_IDS = frozenset({"datalayer", "datalayer-mcp"})


def gateway_url() -> str:
    """
    The gateway's MCP endpoint.

    Returns
    -------
    str
        ``DATALAYER_MCP_SERVER_URL``, or the hosted endpoint.
    """
    return (os.environ.get("DATALAYER_MCP_SERVER_URL") or DEFAULT_GATEWAY_URL).rstrip(
        "/"
    )


def gateway_query(server_id: str) -> str | None:
    """
    How a server of the catalogue reaches the hosted gateway, when it does.

    A catalogue server may be the gateway with some of its toolsets
    (`odoo-accounting` is ``…/mcp?only=odoo-accounting``): it is reached as the
    gateway is, with the toolsets its address chooses.

    Parameters
    ----------
    server_id : str
        A toolset's id: the catalogue server it was started from.

    Returns
    -------
    str | None
        ``""`` for the gateway itself, the query of the address a catalogue
        server gives the gateway (``only=odoo-accounting``), or None for a
        server that is not the gateway.
    """
    if server_id in GATEWAY_SERVER_IDS:
        return ""
    from agent_runtimes.mcp.catalog_mcp_servers import get_catalog_server

    server = get_catalog_server(server_id)
    if server is None:
        return None
    for address in [server.url, *server.args]:
        if address.split("?")[0].rstrip("/") == DEFAULT_GATEWAY_URL:
            return address.partition("?")[2]
    return None


def toolsets_for_the_run(
    toolsets: list[Any],
    token: str,
    *,
    in_users_name: frozenset[str] = frozenset(),
    users_token: str = "",
) -> list[Any]:
    """
    A run's toolsets, with the Datalayer gateway reached as the run.

    Parameters
    ----------
    toolsets : list[Any]
        The agent's toolsets, as the process holds them.
    token : str
        The run's own token.
    in_users_name : frozenset[str]
        The gateway's servers an application reaches in the name of each
        person who uses it (LOOP I-04): reached with `users_token`, never
        with the run's.
    users_token : str
        The token of the person talking to it, naming the application;
        `""` when they have not let it act in their name, and the gateway
        then refuses those servers in its sentence.

    Returns
    -------
    list[Any]
        The same toolsets when the agent reaches no Datalayer gateway;
        otherwise without the process's servers that are the gateway (the
        Datalayer server, and a catalogue server that is the gateway with
        some of its toolsets), each with a gateway toolset authenticated by
        the run's token, and the same toolsets chosen, in its place.
    """
    kept: list[Any] = []
    swapped: list[Any] = []
    for toolset in toolsets:
        server_id = str(getattr(toolset, "id", None) or "")
        query = gateway_query(server_id) if server_id else None
        if query is None:
            kept.append(toolset)
            continue
        swapped.append(
            MCPToolset(
                f"{gateway_url()}?{query}" if query else gateway_url(),
                id=server_id if query else "datalayer",
                http_client=tracing_client(
                    headers={
                        "Authorization": f"Bearer {users_token if server_id in in_users_name else token}"
                    }
                ),
            )
        )
    if not swapped:
        # An agent not given the gateway is not given it by a delegation.
        return toolsets
    return [*kept, *swapped]
