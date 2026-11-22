/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the plugins manager's button and its dialog say, and the names it
 * protects (`apps/plugins/plugin-manager`). A module of its own, without
 * Reactor's manager, so a host's button reads them without loading the list.
 *
 * @module apps/plugins/plugin-manager/words
 */

/** The name the plugin registers under (`@datalayer/agent-plugin-<id>`). */
export const PLUGIN_MANAGER_PLUGIN_NAME =
  '@datalayer/agent-plugin-plugin-manager';

/** Reactor's plugins manager (`MANAGER_PLUGIN_NAME` of `@datalayer/reactor-manager`). */
export const REACTOR_MANAGER_PLUGIN_NAME = '@datalayer/reactor-manager';

/** The Agent workspace's sidebar placement of the same list (`plugins-panel`). */
export const AGENT_PLUGINS_PANEL_PLUGIN_NAME =
  '@datalayer/agent-plugin-plugins-panel';

/**
 * The generic graph plugin, an implementation detail of the Agent's graph
 * adapter: left out, as the sidebar's panel leaves it out.
 */
export const REACTOR_GRAPH_PLUGIN_NAME = '@datalayer/reactor-graph';

/**
 * The switches fixed on: this button, and every other way back to the list.
 * Switching off the only way to switch anything back on is a trap.
 */
export const PLUGIN_MANAGER_PROTECTED: readonly string[] = [
  PLUGIN_MANAGER_PLUGIN_NAME,
  AGENT_PLUGINS_PANEL_PLUGIN_NAME,
  REACTOR_MANAGER_PLUGIN_NAME,
];

/** What is left out of the list. */
export const PLUGIN_MANAGER_HIDDEN: readonly string[] = [
  REACTOR_GRAPH_PLUGIN_NAME,
];

/** What the button and the dialog say. */
export const PLUGIN_MANAGER_WORDS = {
  open: 'Plugins',
  title: 'Plugins',
  subtitle:
    'Every plugin this page runs. Switch one off and back on while the application runs.',
  none: 'No plugins run on this page.',
} as const;
