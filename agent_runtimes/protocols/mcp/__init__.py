# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""MCP as a Reactor plugin.

The Model Context Protocol is implemented by ``agent_runtimes.mcp`` over the
``mcp`` SDK. This plugin says so on ``protocols.description``; it declares no
point yet. MCP's optional capabilities and extensions (``sampling``,
``elicitation``, ``roots``; ``tools``, ``resources``, ``prompts``,
``completions``; and the ``extensions`` capability, e.g. MCP Apps) become
``mcp.extension.<name>`` points of this plugin when the client and the
server of ``agent_runtimes.mcp`` take them from contributions (AGENT_PROTOCOLS
PR-01): declaring a point nothing reads would promise what is not built.
What a client reads from a server's answers, the same in both languages, is
``reading`` (PR-51).
"""

from __future__ import annotations

from typing import Any

from reactor import PluginManifest, hookimpl

from .. import DEFAULT_ORDER, DESCRIPTIONS, ProtocolDescription

PLUGIN = "agent-runtimes.protocols.mcp"
POINTS: tuple = ()


def _version() -> str:
    from mcp.types import LATEST_PROTOCOL_VERSION

    return str(LATEST_PROTOCOL_VERSION)


class McpPlugin:
    """Contributes MCP's description."""

    @hookimpl
    def provide_contributions(self, contributions: Any) -> None:
        contributions.contribute(
            DESCRIPTIONS,
            ProtocolDescription(
                id="mcp",
                name="Model Context Protocol",
                layer="transport",
                version=_version(),
                roles=("client", "server"),
                status="implemented",
                specification="https://modelcontextprotocol.io/specification",
                plugin=PLUGIN,
                catalogue="mcp",
                points=(),
            ),
            contribution_id="mcp",
            order=DEFAULT_ORDER,
        )


def plugin() -> tuple[PluginManifest, McpPlugin]:
    """The MCP plugin, as the ``agent-protocols`` Extension delivers it."""
    return (
        PluginManifest(
            name=PLUGIN,
            version="1.0.0",
            description="Model Context Protocol: tools, resources and prompts over the mcp SDK.",
            tags=["agent-protocols", "transport"],
            contribution_points=[],
        ),
        McpPlugin(),
    )


__all__ = ["PLUGIN", "POINTS", "McpPlugin", "plugin"]
