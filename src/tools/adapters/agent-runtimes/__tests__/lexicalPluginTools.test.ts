/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A document's frontend tools follow the plugins mounted in its editor.
 *
 * jupyter-lexical tests that mounting `ExcalidrawPlugin` registers the drawing
 * tools against a document. What is checked here is the other half of the
 * link, which is this package's: that the tools a document has registered
 * actually reach the chat as `FrontendToolDefinition`s, so an agent in the
 * Document Agent Sidebar can call them.
 *
 * The two halves used to be joined by nothing at all — `createLexicalTools`
 * read the fixed `lexicalToolDefinitions` and no plugin's tools could ever
 * appear, however faithfully the plugin registered them.
 *
 * @module tools/adapters/agent-runtimes/__tests__/lexicalPluginTools
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The drawing library, which this test never calls.
 *
 * `@datalayer/jupyter-lexical`'s plugin index re-exports `ExcalidrawPlugin`,
 * and through it `ExcalidrawModal`, which imports `@excalidraw/excalidraw`
 * statically. That package imports `roughjs/bin/rough` without the extension
 * Node's ESM resolution requires — fine through a bundler, fatal in Vitest,
 * which externalizes node_modules and so resolves it as Node would. Stubbed
 * rather than resolved: what is under test is the tool *list*, and the
 * handlers that would reach the real library import it dynamically at call
 * time, which nothing here does.
 */
vi.mock('@excalidraw/excalidraw', () => ({
  convertToExcalidrawElements: (skeletons: unknown[]) => skeletons,
}));

import {
  excalidrawPluginTools,
  lexicalStore,
} from '@datalayer/jupyter-lexical';

import { createLexicalTools } from '../lexicalHooks';

const DOC = 'doc-under-test';

const toolNames = (): string[] =>
  createLexicalTools(DOC).map(tool => tool.name);

beforeEach(() => {
  lexicalStore.getState().reset();
});

describe('createLexicalTools', () => {
  it('offers the block tools when no plugin has registered', () => {
    const names = toolNames();
    expect(names.length).toBeGreaterThan(0);
    expect(names.some(name => name.includes('excalidraw'))).toBe(false);
  });

  it('offers a plugin’s tools once it has registered', () => {
    lexicalStore.getState().registerPluginTools(DOC, excalidrawPluginTools);

    const names = toolNames();
    // Named for the plugin, as `excalidrawToolMismatches` insists.
    const drawing = names.filter(name => name.includes('excalidraw'));
    expect(drawing.length).toBe(excalidrawPluginTools.definitions.length);
    expect(names.some(n => n.endsWith('excalidrawInsertNode'))).toBe(true);
    expect(names.some(n => n.endsWith('excalidrawReadScene'))).toBe(true);
  });

  it('does not offer them to a different document on the same page', () => {
    lexicalStore.getState().registerPluginTools(DOC, excalidrawPluginTools);

    const otherNames = createLexicalTools('another-doc').map(t => t.name);
    expect(otherNames.some(name => name.includes('excalidraw'))).toBe(false);
  });

  it('takes them away again when the plugin unmounts', () => {
    lexicalStore.getState().registerPluginTools(DOC, excalidrawPluginTools);
    expect(toolNames().some(n => n.includes('excalidraw'))).toBe(true);

    lexicalStore
      .getState()
      .unregisterPluginTools(DOC, excalidrawPluginTools.name);
    expect(toolNames().some(n => n.includes('excalidraw'))).toBe(false);
  });

  it('gives every advertised tool something that can execute it', () => {
    lexicalStore.getState().registerPluginTools(DOC, excalidrawPluginTools);

    for (const tool of createLexicalTools(DOC)) {
      expect(typeof tool.handler).toBe('function');
    }
  });

  /*
   * The end the sidebar actually depends on.
   *
   * Everything above is about the list; this is about a call arriving. The
   * executor looks a plugin's handlers up before it falls back to the store's
   * own methods, and `excalidrawListDrawings` is not a store method — so if
   * that lookup were missing, the call would find nothing and the tool would
   * fail at the moment an agent first tried it, which is the failure mode the
   * whole design exists to avoid.
   */
  it('routes a call through to the plugin’s own handler', async () => {
    lexicalStore.getState().registerPluginTools(DOC, excalidrawPluginTools);

    // The least adapter `listDrawings` can work with: one drawing block.
    lexicalStore.getState().setLexicals(
      new Map([
        [
          DOC,
          {
            adapter: {
              getBlocks: async () => [
                {
                  block_id: 'block-1',
                  block_type: 'excalidraw',
                  metadata: {
                    data: JSON.stringify({
                      elements: [
                        {
                          id: 'a',
                          type: 'rectangle',
                          x: 0,
                          y: 0,
                          width: 10,
                          height: 10,
                        },
                      ],
                      appState: {},
                    }),
                  },
                },
                { block_id: 'block-2', block_type: 'paragraph', metadata: {} },
              ],
            },
          },
        ],
      ]) as never,
    );

    const listDrawings = createLexicalTools(DOC).find(tool =>
      tool.name.endsWith('excalidrawListDrawings'),
    );
    expect(listDrawings).toBeDefined();

    const result = (await listDrawings!.handler({})) as {
      drawings?: { blockId: string; elementCount: number }[];
      count?: number;
      success?: boolean;
      error?: string;
    };

    // The paragraph is not a drawing, and the rectangle is one element.
    expect(result.error).toBeUndefined();
    expect(result.count).toBe(1);
    expect(result.drawings?.[0].blockId).toBe('block-1');
    expect(result.drawings?.[0].elementCount).toBe(1);
  });
});
