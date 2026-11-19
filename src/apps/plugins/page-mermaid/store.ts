/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The conversation's Mermaid diagrams and the tools bound to them.
 *
 * The tools are `@datalayer/reactor-mermaid`'s, over a host that keeps the
 * diagrams in the page, with Mermaid imported on the first call. A
 * restored conversation replays the agent's calls.
 *
 * @module apps/plugins/page-mermaid/store
 */

import {
  createMemoryDiagramHost,
  createMermaidExecutor,
  createMermaidToolHandlers,
  mermaidToolDefinitions,
  mermaidToolOperations,
  type MermaidEngine,
} from '@datalayer/reactor-mermaid';
import type { FrontendToolDefinition } from '../../../types/tools';
import { ConversationBound } from '../../pageTools/conversation';
import {
  reactorFrontendTools,
  reactorToolRunner,
} from '../../pageTools/reactorTools';
import { PAGE_TOOL_RESULTS } from '../../toolCards/toolResults';

/** Every Mermaid tool, by the name the agent calls it. */
export const MERMAID_TOOL_NAMES: readonly string[] = mermaidToolDefinitions.map(
  definition => definition.name,
);

/** The one that changes a diagram: what a restore replays. */
export const MERMAID_WRITE_TOOL_NAMES: readonly string[] =
  mermaidToolDefinitions
    .filter(definition => definition.tags?.includes('edit'))
    .map(definition => definition.name);

export type PageDiagrams = {
  host: ReturnType<typeof createMemoryDiagramHost>;
  /** The diagram a call wrote last: the one the view shows first. */
  current?: string;
};

let engine: Promise<MermaidEngine> | undefined;

/** Mermaid, imported once, on the first call. */
export function loadMermaid(): Promise<MermaidEngine> {
  engine ??= import('mermaid').then(module => {
    const mermaid = module.default;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    return mermaid;
  });
  return engine;
}

/** Give the tools another engine (tests). */
export function replaceMermaid(next: MermaidEngine): void {
  engine = Promise.resolve(next);
}

const fresh = (): PageDiagrams => ({ host: createMemoryDiagramHost() });

async function run(
  diagrams: PageDiagrams,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const executor = createMermaidExecutor(
    createMermaidToolHandlers(diagrams.host, await loadMermaid()),
  );
  const result = await reactorToolRunner(
    mermaidToolDefinitions,
    mermaidToolOperations,
    executor,
  )(name, args);
  if (
    result.ok === true &&
    MERMAID_WRITE_TOOL_NAMES.includes(name) &&
    typeof result.diagramId === 'string'
  ) {
    diagrams.current = result.diagramId;
  }
  return result;
}

/** The diagrams of the conversation on the page. */
export const PAGE_MERMAID = new ConversationBound<PageDiagrams>({
  fresh,
  writes: MERMAID_WRITE_TOOL_NAMES,
  replay: async calls => {
    const diagrams = fresh();
    for (const call of calls) {
      await run(diagrams, call.name, call.args);
    }
    return diagrams;
  },
});

/** The Mermaid tools, bound to the conversation's diagrams. */
export function pageMermaidTools(): FrontendToolDefinition[] {
  return reactorFrontendTools(mermaidToolDefinitions, async (name, args) => {
    await PAGE_MERMAID.sync(PAGE_TOOL_RESULTS.callsOf(MERMAID_TOOL_NAMES));
    const result = await run(PAGE_MERMAID.read(), name, args);
    if (result.ok === true && MERMAID_WRITE_TOOL_NAMES.includes(name)) {
      PAGE_MERMAID.touch();
    }
    return result;
  });
}
