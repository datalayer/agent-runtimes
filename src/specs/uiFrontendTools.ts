/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The frontend tools each UI plugin contributes, by name and description.
 *
 * Read from the plugins themselves: each UI spec's plugin mounted on a
 * reactor, its `agent.chat.extras` contributions' frontend tools named as
 * the model sees them (`namedFrontendTool`) and described in their own
 * words. Exported at build time into `uiFrontendTools.generated.ts` (agent-
 * runtimes' ui-frontend-tools test writes it with
 * `WRITE_UI_FRONTEND_TOOLS=1`, and fails when it is not what the plugins
 * say), so a host lists them — the Agentspecs UI pages, the chat's tools
 * menu — without loading a plugin, and each description is written once:
 * in the plugin's tool definition, or in the Jupyter package it comes from.
 *
 * @module specs/uiFrontendTools
 */

import { UI_FRONTEND_TOOLS } from './uiFrontendTools.generated';

/** A frontend tool, as a UI plugin contributes it. */
export interface UiFrontendTool {
  /** Its model-facing name (`noticeShow`). */
  name: string;
  /** What it does, in its definition's words. */
  description: string;
}

export { UI_FRONTEND_TOOLS };

/** The frontend tools the UI plugin of spec `id` contributes; none for another. */
export function uiFrontendToolsOf(id: string): readonly UiFrontendTool[] {
  return UI_FRONTEND_TOOLS[id] ?? [];
}

let byName: Map<string, UiFrontendTool> | undefined;

/** A frontend tool of a UI plugin, by its model-facing name. */
export function uiFrontendToolNamed(name: string): UiFrontendTool | undefined {
  byName ??= new Map(
    Object.values(UI_FRONTEND_TOOLS)
      .flat()
      .map(tool => [tool.name, tool]),
  );
  return byName.get(name);
}
