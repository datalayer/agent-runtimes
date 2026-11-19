/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Tools a reactor plugin describes, run in the page: each definition
 * (`@datalayer/reactor/tools`) becomes a frontend tool whose handler runs
 * the definition's operation — which validates the call — over an executor
 * the page gives it, and answers `{ ok: true, … }` or `{ ok: false, error }`
 * as every page tool does, so a refusal is a sentence and a restored
 * conversation replays only what succeeded.
 *
 * @module apps/pageTools/reactorTools
 */

import type {
  ToolDefinition,
  ToolExecutor,
  ToolOperation,
} from '@datalayer/reactor/tools';
import type { FrontendToolDefinition } from '../../types/tools';

/** Runs one call by tool name over an executor; answers what a page tool answers. */
export type ReactorToolRunner = (
  name: string,
  args: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/** A runner over these definitions and operations, and an executor. */
export function reactorToolRunner(
  definitions: readonly ToolDefinition[],
  operations: Record<string, ToolOperation<unknown, unknown>>,
  executor: ToolExecutor,
): ReactorToolRunner {
  const byName = new Map(definitions.map(each => [each.name, each]));
  return async (name, args) => {
    const definition = byName.get(name);
    if (!definition) {
      return { ok: false, error: `There is no tool ${name}.` };
    }
    try {
      const result = await operations[definition.operation].execute(args, {
        executor,
        documentId: 'page',
      });
      return { ok: true, ...(result as Record<string, unknown>) };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

/** The frontend tools of these definitions, each handled by `handle`. */
export function reactorFrontendTools(
  definitions: readonly ToolDefinition[],
  handle: ReactorToolRunner,
): FrontendToolDefinition[] {
  return definitions.map(definition => ({
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters as Record<string, unknown>,
    handler: (args: Record<string, unknown>) =>
      handle(definition.name, args ?? {}),
  }));
}
