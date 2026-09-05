/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agent tools plugins declared, as tools the browser loop can call.
 *
 * A plugin contributes an `AgentTools` bundle to the reactor: its commands,
 * named and described for a model. Each becomes a `FrontendToolDefinition` —
 * the shape the notebook tools have, so a host adds them the same way — whose
 * handler runs `reactor.executeCommand(command, args)` on the reactor the
 * host is mounted in, which is exactly what the keystroke does. What the
 * command returns is the tool's result: a command that lists the decks
 * answers with the list, and a command that returns nothing answers that it
 * ran. A host with a richer in-page implementation of the same tool
 * contributes it under the same name, and the chat folds these in after
 * contributions, so the bundle's version steps aside.
 *
 * @module tools/adapters/commands
 */

import { useMemo } from 'react';
import type {
  AgentCommandTool,
  AgentToolBundle,
  ReactorPlatform,
} from '@datalayer/reactor';
import {
  useAgentToolBundles,
  useOptionalReactorPlatform,
} from '@datalayer/reactor/react';
import type { FrontendToolDefinition } from '../../../types';

const NO_ARGUMENTS = { type: 'object', properties: {} } as const;

/** One bundle's commands, executed on a reactor. Only the `toolset` is offered. */
export function agentBundleTools(
  bundle: AgentToolBundle,
  reactor: ReactorPlatform | null | undefined,
): FrontendToolDefinition[] {
  const granted = new Set(bundle.toolset);
  return bundle.commands
    .filter((entry: AgentCommandTool) => granted.has(entry.name))
    .map((entry: AgentCommandTool) => ({
      name: entry.name,
      description: entry.description,
      parameters: entry.parameters ?? NO_ARGUMENTS,
      location: 'frontend' as const,
      handler: async (args: Record<string, unknown>) => {
        if (!reactor) {
          throw new Error(
            `${entry.name}: the ${bundle.plugin ?? bundle.id} plugin is not mounted on this page.`,
          );
        }
        const argument = Object.keys(args ?? {}).length > 0 ? args : undefined;
        const result = await reactor.executeCommand<
          Record<string, unknown> | undefined,
          unknown
        >(entry.command, argument);
        // The command's own answer when it gave one; otherwise the fact that
        // it ran, which is all a keystroke-shaped command has to say.
        return result === undefined
          ? { ok: true, command: entry.command, argument }
          : result;
      },
    }));
}

/** Every command tool of every bundle, in contribution order. */
export function agentBundleToolDefinitions(
  bundles: AgentToolBundle[],
  reactor: ReactorPlatform | null | undefined,
): FrontendToolDefinition[] {
  return bundles.flatMap(bundle => agentBundleTools(bundle, reactor));
}

/**
 * The command tools every mounted plugin declared, bound to this page's
 * reactor — live, so a plugin switched on later brings its tools with it.
 */
export function useAgentCommandTools(): FrontendToolDefinition[] {
  const reactor = useOptionalReactorPlatform();
  const bundles = useAgentToolBundles();
  return useMemo(
    () => agentBundleToolDefinitions(bundles, reactor),
    [bundles, reactor],
  );
}
