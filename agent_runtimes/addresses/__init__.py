# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Every agent at its four addresses: agent, MCP, API and web.

An agent — a company's application, a published one, a person's own — is
reached at ``{name}.agent``, ``{name}.mcp``, ``{name}.api`` and ``{name}.web``
under one domain (:mod:`.hosts`). What it answers there is its ``openapi``
(agentspecs), each operation answered by its agent with structured output
(:func:`.operations.call_operation`); who may call it is its "Who may open it"
(:mod:`.access`); its ``poppy.json`` is built with the PAP SDK (:mod:`.poppy`).
The MCP (8766), API (8767) and web (8768) servers start beside the main one
(:mod:`.servers`), which answers the agent host (:mod:`.agent_host`).
"""

from agent_runtimes.addresses.hosts import API_PORT, MCP_PORT, WEB_PORT, AddressHosts

__all__ = ["API_PORT", "AddressHosts", "MCP_PORT", "WEB_PORT"]
