/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Frontend tools have to work in the browser harness exactly as they do in
 * AG-UI.
 *
 * That is the whole reason an in-browser agent is worth anything: the tools
 * are what reach into the notebook on the page. AG-UI advertises a tool's
 * `{name, description, parameters}` over the wire and calls its `handler` when
 * the model asks; here the model call and the handler are in the same page, so
 * the SDK calls the handler directly. Everything a tool author sees must be
 * the same either way, and only a test keeps that true.
 */

import { describe, expect, it, vi } from 'vitest';

import type { FrontendToolDefinition } from '../../types/tools';
import {
  frontendToolsToVercelAI,
  toolInputSchema,
} from '../browser/frontendTools';

/** Call one tool of a set the way the SDK would. */
async function invoke(
  toolSet: ReturnType<typeof frontendToolsToVercelAI>,
  name: string,
  input: Record<string, unknown>,
  toolCallId = 'call-1',
) {
  const entry = toolSet[name];
  expect(entry, `tool "${name}" is in the set`).toBeDefined();
  const execute = entry.execute as (
    input: unknown,
    options: unknown,
  ) => Promise<unknown>;
  return execute(input, { toolCallId, messages: [] });
}

describe('frontend tool schemas', () => {
  it('passes JSON Schema through as the author wrote it', () => {
    // The notebook and document tools carry JSON Schema already. AG-UI sends
    // it over the wire untouched, so rewriting it here could only lose
    // something the model was meant to read.
    const parameters = {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Cell index' },
        source: { type: 'string' },
      },
      required: ['index'],
    };
    expect(toolInputSchema({ parameters })).toEqual(parameters);
  });

  it('converts the CopilotKit-style parameter list to JSON Schema', () => {
    expect(
      toolInputSchema({
        parameters: [
          { name: 'path', type: 'string', description: 'Where', required: true },
          { name: 'count', type: 'number' },
          { name: 'kind', type: 'string', enum: ['code', 'markdown'] },
          { name: 'tags', type: 'string[]' },
        ],
      }),
    ).toEqual({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Where' },
        count: { type: 'number' },
        kind: { type: 'string', enum: ['code', 'markdown'] },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['path'],
    });
  });

  it('converts nested object parameters', () => {
    expect(
      toolInputSchema({
        parameters: [
          {
            name: 'cell',
            type: 'object',
            attributes: [
              { name: 'source', type: 'string', required: true },
              { name: 'type', type: 'string' },
            ],
          },
        ],
      }),
    ).toEqual({
      type: 'object',
      properties: {
        cell: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            type: { type: 'string' },
          },
          required: ['source'],
        },
      },
    });
  });

  it('gives a tool with no parameters an empty object schema', () => {
    // Not `undefined`: a model needs to be told the tool takes nothing, or it
    // has no way to call it.
    expect(toolInputSchema({ parameters: undefined as never })).toEqual({
      type: 'object',
      properties: {},
    });
  });
});

describe('frontend tools in the browser harness', () => {
  /** A tool shaped like the ones `useNotebookTools` produces. */
  function notebookTool(
    overrides: Partial<FrontendToolDefinition> = {},
  ): FrontendToolDefinition {
    return {
      name: 'insertCell',
      description: 'Insert a cell into the notebook.',
      parameters: {
        type: 'object',
        properties: { index: { type: 'number' }, source: { type: 'string' } },
        required: ['index', 'source'],
      },
      handler: async () => ({ success: true }),
      ...overrides,
    };
  }

  it('advertises every tool under its own name and description', () => {
    const toolSet = frontendToolsToVercelAI([
      notebookTool(),
      notebookTool({ name: 'readAllCells', description: 'Read the notebook.' }),
    ]);
    expect(Object.keys(toolSet)).toEqual(['insertCell', 'readAllCells']);
    expect(toolSet.readAllCells.description).toBe('Read the notebook.');
  });

  it('runs the tool handler in the page and returns what it returns', async () => {
    const handler = vi.fn(async (args: unknown) => ({
      inserted: (args as { index: number }).index,
    }));
    const toolSet = frontendToolsToVercelAI([notebookTool({ handler })]);

    const result = await invoke(toolSet, 'insertCell', {
      index: 3,
      source: 'print(1)',
    });

    // The same call the AG-UI path would make, with the same arguments.
    expect(handler).toHaveBeenCalledWith({ index: 3, source: 'print(1)' });
    expect(result).toEqual({ inserted: 3 });
  });

  it('reports a failing handler to the model instead of throwing', async () => {
    // A throw would abort the whole generation over one bad call. An error the
    // model can read is a step it can recover from.
    const toolSet = frontendToolsToVercelAI([
      notebookTool({
        handler: async () => {
          throw new Error('Cell 9 does not exist');
        },
      }),
    ]);

    await expect(
      invoke(toolSet, 'insertCell', { index: 9, source: '' }),
    ).resolves.toEqual({ error: 'Cell 9 does not exist' });
  });

  it('reports a tool with no handler rather than failing silently', async () => {
    const toolSet = frontendToolsToVercelAI([
      notebookTool({ handler: undefined }),
    ]);
    await expect(
      invoke(toolSet, 'insertCell', { index: 0, source: '' }),
    ).resolves.toEqual({
      error: 'Frontend tool "insertCell" has no handler defined',
    });
  });

  it('asks for approval for a human-in-the-loop tool', async () => {
    // Same callback the AG-UI path uses, so a host that gates a destructive
    // tool keeps gating it when the loop moves into the page.
    const onHitlRequired = vi.fn(async () => ({ approved: true }));
    const handler = vi.fn(async () => ({ success: true }));
    const toolSet = frontendToolsToVercelAI(
      [
        notebookTool({
          name: 'deleteCell',
          handler,
          renderAndWaitForResponse: () => null,
        }),
      ],
      { onHitlRequired },
    );

    const result = await invoke(toolSet, 'deleteCell', { index: 2 });

    expect(onHitlRequired).toHaveBeenCalledOnce();
    // The handler is the approval's job to run, not the executor's.
    expect(handler).not.toHaveBeenCalled();
    expect(result).toEqual({ approved: true });
  });

  it('tells the model when a person rejects a call', async () => {
    const toolSet = frontendToolsToVercelAI(
      [
        notebookTool({
          name: 'deleteCell',
          renderAndWaitForResponse: () => null,
        }),
      ],
      { onHitlRequired: async () => null },
    );

    await expect(invoke(toolSet, 'deleteCell', { index: 2 })).resolves.toEqual({
      error: 'Tool call was rejected by user',
    });
  });

  it('reports status the way a host renders tool progress', async () => {
    const onStatusChange = vi.fn();
    const toolSet = frontendToolsToVercelAI([notebookTool()], {
      onStatusChange,
    });

    await invoke(toolSet, 'insertCell', { index: 0, source: '' }, 'call-42');

    expect(onStatusChange.mock.calls.map(call => call[1])).toEqual([
      'executing',
      'complete',
    ]);
    expect(onStatusChange.mock.calls[0][0]).toBe('call-42');
  });
});
