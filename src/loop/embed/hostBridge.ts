/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The host page and an embedded application, talking (LOOP D-10).
 *
 * In: the values the page passes — `user`, `page`, or names of its own —
 * read by the application's agent with the tool `host_context`, only those
 * its Appspec names (`deployment.embedded.host.context`).
 *
 * Out: what the application does, as events — `message` when it has said
 * something, `action` when it called a function of the page — beside the
 * `decision` and `token-expired` the element raises already.
 *
 * Offered: the functions of the page its Appspec names
 * (`deployment.embedded.host.functions`), each called by its agent as the
 * tool `host_<name>`. Every one of these tools is decided by the rule that
 * names it, as any tool of the application is: by its runtime, which asks
 * the person first when the rule says so; in the page too, where a tool no
 * rule names is refused before the page is called (`behaviourFor`: left to
 * the person).
 *
 * Pure: the tools call the page through what they are given.
 *
 * @module loop/embed/hostBridge
 */

import type { AppHostBridgeSpec, AppSpec } from '../../types/agentspecs';
import type { FrontendToolDefinition } from '../../types/tools';
import { behaviourFor } from '../apps/rules';

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

/** What the application tells the page it sits in. */
export type HostEvent =
  | {
      type: 'message';
      /** What it said, as written. */
      detail: { id: string; text: string };
    }
  | {
      type: 'action';
      /** A function of the page it called, with what came back or why not. */
      detail: {
        function: string;
        arguments: Record<string, unknown>;
        result?: unknown;
        error?: string;
      };
    };

/** A function of the page, as the page gives it. */
export type HostFunction = (
  args: Record<string, unknown>,
) => unknown | Promise<unknown>;

/** What the page gives an embedded application (LOOP D-10). */
export type AppEmbedHost = {
  /** What the page passes now: its visitor (`user`), itself (`page`), values of its own. */
  context?: () => Record<string, unknown>;
  /** The page's functions, by the names the Appspec gives them. */
  functions?: Record<string, HostFunction>;
  /** Told what the application does: `message`, `action`. */
  onEvent?: (event: HostEvent) => void;
};

/** The sentence a call is refused with when no rule names its tool. */
export const hostRefused = (tool: string): string =>
  `No rule of this application names ${tool}: it is left to the person, and the page was not called.`;

/**
 * The frontend tools its agent is given for the page: `host_context` when
 * the Appspec names values, and `host_<name>` for each function it names.
 * `host` is read at each call, so that what the page passes is the newest.
 */
export function hostFrontendTools(
  app: Pick<AppSpec, 'connections' | 'rules' | 'deployment'>,
  host: () => AppEmbedHost,
): FrontendToolDefinition[] {
  const bridge = app.deployment.embedded?.host;
  if (!bridge) {
    return [];
  }
  const ruled = (tool: string): boolean =>
    behaviourFor(app, tool) !== 'leave_to_me';
  const tools: FrontendToolDefinition[] = [];
  if (bridge.context.length > 0) {
    tools.push({
      name: HOST_CONTEXT_TOOL,
      description: `What the page you are embedded in says of its visitor and of itself: ${bridge.context.join(', ')}. Read it before answering what depends on them.`,
      parameters: { type: 'object', properties: {} },
      location: 'frontend',
      handler: async () => {
        if (!ruled(HOST_CONTEXT_TOOL)) {
          return { error: hostRefused(HOST_CONTEXT_TOOL) };
        }
        const passed = host().context?.() ?? {};
        const values: Record<string, unknown> = {};
        const unsaid: string[] = [];
        for (const name of bridge.context) {
          if (passed[name] === undefined) {
            unsaid.push(name);
          } else {
            values[name] = passed[name];
          }
        }
        return { values, ...(unsaid.length > 0 ? { unsaid } : {}) };
      },
    });
  }
  for (const fn of bridge.functions) {
    const tool = hostTool(fn.name);
    tools.push({
      name: tool,
      description: fn.description,
      parameters: fn.parameters,
      location: 'frontend',
      handler: async (args: Record<string, unknown>) => {
        const said = (detail: { result?: unknown; error?: string }) => {
          host().onEvent?.({
            type: 'action',
            detail: { function: fn.name, arguments: args, ...detail },
          });
          return detail;
        };
        if (!ruled(tool)) {
          return said({ error: hostRefused(tool) });
        }
        const call = host().functions?.[fn.name];
        if (!call) {
          return said({
            error: `The page offers no function ${fn.name}: it was not called.`,
          });
        }
        try {
          return said({ result: await call(args) });
        } catch (error) {
          return said({
            error: `The page's ${fn.name} failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          });
        }
      },
    });
  }
  return tools;
}
