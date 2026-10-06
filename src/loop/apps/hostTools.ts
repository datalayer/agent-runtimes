/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The tools an embedded application is given for its host page (LOOP D-10),
 * by name: `host_context` for the values the page passes, `host_<name>` for
 * each function it offers. Apart from `embed/hostBridge`, which calls the
 * page, so that the checks read them as a pure module.
 *
 * @module loop/apps/hostTools
 */

import type { AppHostBridgeSpec } from '../../types/agentspecs';

/** The tool its agent reads what the page passes it with. */
export const HOST_CONTEXT_TOOL = 'host_context';

/** The tool its agent calls a function of the page with. */
export const hostTool = (name: string): string => `host_${name}`;

/** How a value or a function of the host is named. */
export const HOST_NAME = /^[a-z][a-z0-9_]{0,62}$/;

/** The tools its agent is given for the host. */
export function hostToolsOf(bridge: AppHostBridgeSpec | undefined): string[] {
  if (!bridge) {
    return [];
  }
  return [
    ...(bridge.context.length > 0 ? [HOST_CONTEXT_TOOL] : []),
    ...bridge.functions.map(fn => hostTool(fn.name)),
  ];
}
