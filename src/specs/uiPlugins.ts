/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * UI Plugin Catalog.
 *
 * How an agent's answer becomes an interface: the protocols a host renders.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { UIPluginSpec } from '../types/agentspecs';

export const A2UI_UI_PLUGIN_0_0_1: UIPluginSpec = {
  id: 'a2ui',
  version: '0.0.1',
  name: 'A2UI',
  description:
    'An agent describes an interface — a form, a table, a card — as a tree of components from a catalogue the host allows, and the host renders it; what the user does in it comes back to the agent as an action.',
  docsUrl: 'https://a2ui.org/',
  enabled: true,
};

export const MCP_APPS_UI_PLUGIN_0_0_1: UIPluginSpec = {
  id: 'mcp-apps',
  version: '0.0.1',
  name: 'MCP Apps',
  description:
    "An MCP server ships an interactive app with a tool: the host renders it in a sandboxed frame beside the conversation, and the app calls the server's tools through the host.",
  docsUrl: 'https://modelcontextprotocol.io/docs/extensions/apps',
  enabled: false,
};

export const MCP_UI_UI_PLUGIN_0_0_1: UIPluginSpec = {
  id: 'mcp-ui',
  version: '0.0.1',
  name: 'MCP UI',
  description:
    'An MCP tool answers with a UI resource — HTML, a remote page or a component — that the host renders in place of plain text.',
  docsUrl: 'https://mcpui.dev/',
  enabled: false,
};

export const UI_PLUGIN_CATALOGUE: Record<string, UIPluginSpec> = {
  a2ui: A2UI_UI_PLUGIN_0_0_1,
  'mcp-apps': MCP_APPS_UI_PLUGIN_0_0_1,
  'mcp-ui': MCP_UI_UI_PLUGIN_0_0_1,
};

/** The plugin an agent spec's `uiPlugin` names, or undefined. */
export function getUIPlugin(pluginId: string): UIPluginSpec | undefined {
  return UI_PLUGIN_CATALOGUE[pluginId];
}

export function listUIPlugins(): UIPluginSpec[] {
  return Object.values(UI_PLUGIN_CATALOGUE);
}
