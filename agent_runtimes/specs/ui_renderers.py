# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
UI Renderer Catalog.

How a UI plugin's interface reaches a host that is not Datalayer's own page
(R8): A2UI, MCP Apps, MCP UI.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict

from agent_runtimes.types import UiRendererSpec

A2UI_UI_RENDERER_0_0_1 = UiRendererSpec(
    id="a2ui",
    version="0.0.1",
    name="A2UI",
    description="An agent describes an interface — a form, a table, a card — as a tree of components from a catalogue the host allows, and the host renders it; what the user does in it comes back to the agent as an action.",
    docs_url="https://a2ui.org/",
    enabled=True,
)

MCP_APPS_UI_RENDERER_0_0_1 = UiRendererSpec(
    id="mcp-apps",
    version="0.0.1",
    name="MCP Apps",
    description="An MCP server ships an interactive app with a tool: the host renders it in a sandboxed frame beside the conversation, and the app calls the server's tools through the host.",
    docs_url="https://modelcontextprotocol.io/docs/extensions/apps",
    enabled=False,
)

MCP_UI_UI_RENDERER_0_0_1 = UiRendererSpec(
    id="mcp-ui",
    version="0.0.1",
    name="MCP UI",
    description="An MCP tool answers with a UI resource — HTML, a remote page or a component — that the host renders in place of plain text.",
    docs_url="https://mcpui.dev/",
    enabled=False,
)

UI_RENDERER_CATALOGUE: Dict[str, UiRendererSpec] = {
    "a2ui": A2UI_UI_RENDERER_0_0_1,
    "mcp-apps": MCP_APPS_UI_RENDERER_0_0_1,
    "mcp-ui": MCP_UI_UI_RENDERER_0_0_1,
}


def get_ui_renderer(renderer_id: str) -> UiRendererSpec | None:
    """The UI renderer a plugin's `renderers` or a `ui` choice names, or None."""
    return UI_RENDERER_CATALOGUE.get(renderer_id)


def list_ui_renderers() -> list[UiRendererSpec]:
    return list(UI_RENDERER_CATALOGUE.values())
