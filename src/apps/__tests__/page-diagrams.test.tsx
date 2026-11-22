/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Functional Analyst's canvas and diagrams, drawn in the page with frontend tools
 * (the user, 19 November 2026: the Functional Analyst's Excalidraw and Mermaid tools).
 *
 * - the tools are @datalayer/reactor-excalidraw's and
 *   @datalayer/reactor-mermaid's, named as the packages name them, each with
 *   a handler that answers `ok` or a refusal in a sentence;
 * - the drawings and diagrams are the conversation's: built again from the
 *   recorded calls of a restored conversation, emptied when it starts over;
 * - a Mermaid source that does not parse is refused with its line, and the
 *   diagram shown stays as it was;
 * - each plugin hands the chat its tools and says each call in a line.
 */

import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { excalidrawToolDefinitions } from '@datalayer/reactor-excalidraw';
import { mermaidToolDefinitions } from '@datalayer/reactor-mermaid';
import { AgentChatExtras } from '../core';
import { PAGE_TOOL_RESULTS } from '../toolCards/toolResults';
import {
  PageExcalidrawPlugin,
  excalidrawCallSays,
} from '../plugins/page-excalidraw';
import {
  EXCALIDRAW_TOOL_NAMES,
  EXCALIDRAW_WRITE_TOOL_NAMES,
  PAGE_EXCALIDRAW,
  pageExcalidrawTools,
  replaceConverters,
} from '../plugins/page-excalidraw/store';
import { PageMermaidPlugin, mermaidCallSays } from '../plugins/page-mermaid';
import {
  MERMAID_TOOL_NAMES,
  MERMAID_WRITE_TOOL_NAMES,
  PAGE_MERMAID,
  pageMermaidTools,
  replaceMermaid,
} from '../plugins/page-mermaid/store';
import type { FrontendToolDefinition } from '../../types/tools';

type Tool = FrontendToolDefinition;

beforeAll(() => {
  // Excalidraw's converter keeps the ids it is given; Mermaid parses a source
  // whose lines say no `oops`. Neither real one draws without a browser.
  replaceConverters({
    convertToExcalidrawElements: skeletons =>
      skeletons.map(skeleton => ({ width: 100, height: 100, ...skeleton })),
    parseMermaidToExcalidraw: async () => ({
      elements: [{ id: 'm1', type: 'rectangle', x: 0, y: 0 }],
    }),
  });
  replaceMermaid({
    parse: async source => {
      const bad = source.split('\n').findIndex(line => line.includes('oops'));
      if (bad >= 0) {
        throw new Error(`Parse error on line ${bad + 1}`);
      }
      return true;
    },
    render: async id => ({ svg: `<svg id="${id}"></svg>` }),
  });
});

const call = (tools: Tool[], name: string, args: Record<string, unknown>) =>
  tools.find(tool => tool.name === name)!.handler!(args) as Promise<
    Record<string, unknown>
  >;

let ids = 0;
const recorded = (
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
) => {
  ids += 1;
  act(() => {
    PAGE_TOOL_RESULTS.record([
      {
        type: 'tool-call',
        status: 'complete',
        toolCallId: `diagram-call-${ids}`,
        toolName,
        args,
        result,
      },
    ]);
  });
};

const toolsOf = (plugin: unknown): Tool[] => {
  const contributes = (
    plugin as { contributes: { point: unknown; value: unknown }[] }
  ).contributes;
  const extras = contributes.find(entry => entry.point === AgentChatExtras);
  return (extras?.value as { extras: { value: { frontendTools: Tool[] } } })
    .extras.value.frontendTools;
};

afterEach(() => {
  cleanup();
  act(() => {
    PAGE_TOOL_RESULTS.clear();
    PAGE_EXCALIDRAW.reset();
    PAGE_MERMAID.reset();
  });
});

describe('the Excalidraw tools in the page', () => {
  it('are the package’s eleven, each with a handler; the reads replay nothing', () => {
    const tools = pageExcalidrawTools();
    expect(tools.map(tool => tool.name)).toEqual(
      excalidrawToolDefinitions.map(each => each.name),
    );
    expect(tools.every(tool => typeof tool.handler === 'function')).toBe(true);
    expect(EXCALIDRAW_WRITE_TOOL_NAMES).not.toContain(
      'datalayer_excalidrawReadScene',
    );
    expect(EXCALIDRAW_WRITE_TOOL_NAMES).toContain(
      'datalayer_excalidrawInsertNode',
    );
  });

  it('draw on the conversation’s canvas, and read it back', async () => {
    const tools = pageExcalidrawTools();
    const made = await call(tools, 'datalayer_excalidrawInsertNode', {
      afterId: 'BOTTOM',
      elements: [
        { id: 'a', type: 'rectangle', x: 0, y: 0, label: 'Shop' },
        { id: 'b', type: 'rectangle', x: 300, y: 0, label: 'Queue' },
      ],
    });
    expect(made).toMatchObject({ ok: true, createdIds: ['a', 'b'] });
    expect(PAGE_EXCALIDRAW.read().current).toBe(made.blockId);
    await call(tools, 'datalayer_excalidrawConnectElements', {
      blockId: made.blockId,
      fromId: 'a',
      toId: 'b',
    });
    const read = await call(tools, 'datalayer_excalidrawReadScene', {
      blockId: made.blockId,
    });
    expect(read.elementCount).toBe(3);
  });

  it('refuse in a sentence', async () => {
    const answer = await call(
      pageExcalidrawTools(),
      'datalayer_excalidrawReadScene',
      {
        blockId: 'ghost',
      },
    );
    expect(answer.ok).toBe(false);
    expect(String(answer.error)).toMatch(/No drawing 'ghost'/);
  });

  it('build the canvas again from a restored conversation, and empty it when it starts over', async () => {
    recorded(
      'datalayer_excalidrawInsertNode',
      {
        afterId: 'BOTTOM',
        elements: [{ id: 'x', type: 'ellipse', x: 0, y: 0 }],
      },
      { ok: true, blockId: 'drawing-1' },
    );
    const listed = await call(
      pageExcalidrawTools(),
      'datalayer_excalidrawListDrawings',
      {},
    );
    expect(listed).toMatchObject({ ok: true, count: 1 });
    act(() => PAGE_TOOL_RESULTS.clear());
    await act(() =>
      PAGE_EXCALIDRAW.sync(PAGE_TOOL_RESULTS.callsOf(EXCALIDRAW_TOOL_NAMES)),
    );
    expect(await PAGE_EXCALIDRAW.read().host.listDrawings()).toEqual([]);
  });

  it('are handed to the chat by the plugin, and each call says itself in a line', () => {
    expect(toolsOf(PageExcalidrawPlugin).map(tool => tool.name)).toEqual([
      ...EXCALIDRAW_TOOL_NAMES,
    ]);
    expect(
      excalidrawCallSays('datalayer_excalidrawAddElements', {
        elements: [{}, {}],
      }),
    ).toBe('Added 2 shapes');
    expect(excalidrawCallSays('datalayer_excalidrawFromMermaid', {})).toBe(
      'Drew a Mermaid diagram as shapes',
    );
  });
});

describe('the Mermaid tools in the page', () => {
  it('are the package’s six, and only writing a diagram is replayed', () => {
    expect(pageMermaidTools().map(tool => tool.name)).toEqual(
      mermaidToolDefinitions.map(each => each.name),
    );
    expect(MERMAID_WRITE_TOOL_NAMES).toEqual(['datalayer_mermaidSetDiagram']);
  });

  it('write a diagram checked first, and refuse a bad line leaving it as it was', async () => {
    const tools = pageMermaidTools();
    const made = await call(tools, 'datalayer_mermaidSetDiagram', {
      title: 'Orders',
      source: 'flowchart LR\n  A-->B',
    });
    expect(made).toMatchObject({
      ok: true,
      created: true,
      diagramType: 'flowchart',
    });
    const refused = await call(tools, 'datalayer_mermaidSetDiagram', {
      diagramId: made.diagramId,
      source: 'flowchart LR\n  oops',
    });
    expect(refused.ok).toBe(false);
    expect(String(refused.error)).toMatch(/line 2/);
    const read = await call(tools, 'datalayer_mermaidReadDiagram', {
      diagramId: made.diagramId,
    });
    expect(read.source).toBe('flowchart LR\n  A-->B');
    const svg = await call(tools, 'datalayer_mermaidRenderSvg', {
      diagramId: made.diagramId,
    });
    expect(String(svg.svg)).toMatch(/^<svg/);
  });

  it('build the diagrams again from a restored conversation', async () => {
    recorded(
      'datalayer_mermaidSetDiagram',
      { source: 'pie\n "a": 1' },
      { ok: true, diagramId: 'diagram-1' },
    );
    const listed = await call(
      pageMermaidTools(),
      'datalayer_mermaidListDiagrams',
      {},
    );
    expect(listed).toMatchObject({ ok: true, count: 1 });
    act(() => PAGE_TOOL_RESULTS.clear());
    await act(() =>
      PAGE_MERMAID.sync(PAGE_TOOL_RESULTS.callsOf(MERMAID_TOOL_NAMES)),
    );
    expect(await PAGE_MERMAID.read().host.listDiagrams()).toEqual([]);
  });

  it('are handed to the chat by the plugin, and each call says itself in a line', () => {
    expect(toolsOf(PageMermaidPlugin).map(tool => tool.name)).toEqual([
      ...MERMAID_TOOL_NAMES,
    ]);
    expect(
      mermaidCallSays('datalayer_mermaidSetDiagram', { title: 'Orders' }),
    ).toBe('Wrote the diagram “Orders”');
  });
});
