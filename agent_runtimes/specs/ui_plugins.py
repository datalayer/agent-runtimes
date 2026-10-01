# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
UI Plugin Catalog.

How an agent's answer becomes an interface: the protocols a host renders.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict

from agent_runtimes.types import UIPluginSpec

# ============================================================================
# UI Plugin Definitions
# ============================================================================

A2UI_UI_PLUGIN_0_0_1 = UIPluginSpec(
    id="a2ui",
    version="0.0.1",
    name="A2UI",
    description="An agent describes an interface — a form, a table, a card — as a tree of components from a catalogue the host allows, and the host renders it; what the user does in it comes back to the agent as an action.",
    docs_url="https://a2ui.org/",
    enabled=True,
)

MCP_APPS_UI_PLUGIN_0_0_1 = UIPluginSpec(
    id="mcp-apps",
    version="0.0.1",
    name="MCP Apps",
    description="An MCP server ships an interactive app with a tool: the host renders it in a sandboxed frame beside the conversation, and the app calls the server's tools through the host.",
    docs_url="https://modelcontextprotocol.io/docs/extensions/apps",
    enabled=False,
)

MCP_UI_UI_PLUGIN_0_0_1 = UIPluginSpec(
    id="mcp-ui",
    version="0.0.1",
    name="MCP UI",
    description="An MCP tool answers with a UI resource — HTML, a remote page or a component — that the host renders in place of plain text.",
    docs_url="https://mcpui.dev/",
    enabled=False,
)


# ============================================================================
# UI Plugin Catalog
# ============================================================================

UI_PLUGIN_CATALOGUE: Dict[str, UIPluginSpec] = {
    "a2ui": A2UI_UI_PLUGIN_0_0_1,
    "mcp-apps": MCP_APPS_UI_PLUGIN_0_0_1,
    "mcp-ui": MCP_UI_UI_PLUGIN_0_0_1,
}


def get_ui_plugin(plugin_id: str) -> UIPluginSpec | None:
    """The plugin an agent spec's `ui_plugin` names, or None."""
    return UI_PLUGIN_CATALOGUE.get(plugin_id)


def list_ui_plugins() -> list[UIPluginSpec]:
    return list(UI_PLUGIN_CATALOGUE.values())
