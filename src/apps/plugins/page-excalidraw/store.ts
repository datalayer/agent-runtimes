/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The conversation's drawings and the Excalidraw tools bound to them.
 *
 * The tools are `@datalayer/reactor-excalidraw`'s, over a host that keeps
 * the drawings in the page; Excalidraw's converters are imported on the
 * first call. What the person draws on the canvas goes to the same host, so
 * a read answers it. It is not kept beyond the page: a restored
 * conversation replays the agent's calls, not the person's strokes.
 *
 * @module apps/plugins/page-excalidraw/store
 */

import {
  createExcalidrawExecutor,
  createExcalidrawToolHandlers,
  createMemoryDrawingHost,
  excalidrawToolDefinitions,
  excalidrawToolOperations,
  type ExcalidrawConverters,
} from '@datalayer/reactor-excalidraw';
import type { FrontendToolDefinition } from '../../../types/tools';
import { ConversationBound } from '../../pageTools/conversation';
import {
  reactorFrontendTools,
  reactorToolRunner,
} from '../../pageTools/reactorTools';
import { PAGE_TOOL_RESULTS } from '../../toolCards/toolResults';

/** Every Excalidraw tool, by the name the agent calls it. */
export const EXCALIDRAW_TOOL_NAMES: readonly string[] =
  excalidrawToolDefinitions.map(definition => definition.name);

/** The ones that change a drawing: what a restore replays. */
export const EXCALIDRAW_WRITE_TOOL_NAMES: readonly string[] =
  excalidrawToolDefinitions
    .filter(definition => !definition.tags?.includes('read'))
    .map(definition => definition.name);

export type PageDrawings = {
  host: ReturnType<typeof createMemoryDrawingHost>;
  /** The drawing a call touched last: the one the canvas shows. */
  current?: string;
};

let converters: Promise<ExcalidrawConverters> | undefined;

/** Excalidraw's conversions, imported once, on the first call. */
export function loadConverters(): Promise<ExcalidrawConverters> {
  converters ??= (async () => {
    const [{ convertToExcalidrawElements }, { parseMermaidToExcalidraw }] =
      await Promise.all([
        import('@excalidraw/excalidraw'),
        import('@excalidraw/mermaid-to-excalidraw'),
      ]);
    return {
      convertToExcalidrawElements: (skeletons, options) =>
        convertToExcalidrawElements(skeletons as never, options as never),
      parseMermaidToExcalidraw: (source, options) =>
        parseMermaidToExcalidraw(source, options as never) as never,
    };
  })();
  return converters;
}

/** Give the tools other converters (tests). */
export function replaceConverters(next: ExcalidrawConverters): void {
  converters = Promise.resolve(next);
}

const fresh = (): PageDrawings => ({ host: createMemoryDrawingHost() });

/** Run one call against these drawings. */
async function run(
  drawings: PageDrawings,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const executor = createExcalidrawExecutor(
    createExcalidrawToolHandlers(drawings.host, await loadConverters()),
  );
  const result = await reactorToolRunner(
    excalidrawToolDefinitions,
    excalidrawToolOperations,
    executor,
  )(name, args);
  if (result.ok === true && typeof result.blockId === 'string') {
    drawings.current = result.blockId;
  }
  return result;
}

/** The drawings of the conversation on the page. */
export const PAGE_EXCALIDRAW = new ConversationBound<PageDrawings>({
  fresh,
  writes: EXCALIDRAW_WRITE_TOOL_NAMES,
  replay: async calls => {
    const drawings = fresh();
    for (const call of calls) {
      // What was refused then is refused now: the drawing stands without it.
      await run(drawings, call.name, call.args);
    }
    return drawings;
  },
});

/** The Excalidraw tools, bound to the conversation's drawings. */
export function pageExcalidrawTools(): FrontendToolDefinition[] {
  return reactorFrontendTools(excalidrawToolDefinitions, async (name, args) => {
    // A restored conversation's drawings first, so that this call adds to them.
    await PAGE_EXCALIDRAW.sync(
      PAGE_TOOL_RESULTS.callsOf(EXCALIDRAW_TOOL_NAMES),
    );
    const result = await run(PAGE_EXCALIDRAW.read(), name, args);
    if (result.ok === true && EXCALIDRAW_WRITE_TOOL_NAMES.includes(name)) {
      PAGE_EXCALIDRAW.touch();
    }
    return result;
  });
}
