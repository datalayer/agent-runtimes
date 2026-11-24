/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Frontend tools whose surface lives in a side panel the call itself opens
 * (the user, 24 November 2026: "create a notebook and document fails"). The
 * panel of a document or a notebook opens with its tools' first call, and
 * only then mounts the editor the tools write through; the call ran at
 * once, found no editor and said that no document was open. Wrapped here,
 * a call asks for its panel (`sidePanelReveal`), waits for its surface to be
 * mounted, up to a bound, then runs.
 * A sheet or a deck needs none of it: their state is a store of their own.
 *
 * @module apps/pageTools/untilMounted
 */

import type { FrontendToolDefinition } from '../../types/tools';
import { revealPanelFor } from '../shell/sidePanelReveal';

/** How long a call waits for its panel to mount before it says so. */
export const MOUNT_WAIT_MS = 30_000;
const POLL_MS = 100;

/** Resolves once `isMounted()` holds; rejects with `refusal` past `timeoutMs`. */
export function untilTrue(
  isMounted: () => boolean,
  timeoutMs: number,
  refusal: string,
): Promise<void> {
  if (isMounted()) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (isMounted()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        reject(new Error(refusal));
      }
    }, POLL_MS);
  });
}

/**
 * The same tools, each call waiting for its surface first. `surface` names it
 * in the refusal ("the document", "the notebook").
 */
export function untilMounted(
  tools: FrontendToolDefinition[],
  isMounted: () => boolean,
  surface: string,
  timeoutMs: number = MOUNT_WAIT_MS,
): FrontendToolDefinition[] {
  const refusal = `${surface[0].toUpperCase()}${surface.slice(1)} did not open in the page: its panel was not shown within ${Math.round(timeoutMs / 1000)} seconds.`;
  return tools.map(tool => {
    const handler = tool.handler;
    if (!handler) {
      return tool;
    }
    return {
      ...tool,
      handler: async (args: Record<string, unknown>) => {
        if (!isMounted()) {
          // Its panel opens from recorded calls, and this one is not recorded
          // before it completes: it asks for its panel itself.
          revealPanelFor(tool.name);
        }
        await untilTrue(isMounted, timeoutMs, refusal);
        return handler(args);
      },
    };
  });
}

/**
 * The same tools, each call running `prepare` first (building the in-memory
 * surface the tools act on, showing its panel).
 */
export function beforeEachCall(
  tools: FrontendToolDefinition[],
  prepare: (tool: FrontendToolDefinition) => Promise<void> | void,
): FrontendToolDefinition[] {
  return tools.map(tool => {
    const handler = tool.handler;
    if (!handler) {
      return tool;
    }
    return {
      ...tool,
      handler: async (args: Record<string, unknown>) => {
        await prepare(tool);
        return handler(args);
      },
    };
  });
}
