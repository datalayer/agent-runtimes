/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Agent Inspector: its record (calls paired, capped, events linked), the
 * A2A capture under the SDK's fetch (the request, the stream's events, the
 * artifacts, the times), the tree, the filters and each agent's own view.
 */

// @vitest-environment jsdom
import * as React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '@primer/react';
import { createAgentInspector } from '../agentInspector';
import { inspectA2AFetch } from '../a2aInspect';
import { JsonTree } from '../JsonTree';
import {
  AgentInspector,
  directionFrom,
  filterEntries,
  isAgentsEntry,
} from '../AgentInspector';
import { teamToolClassifier } from '../../teams/teamConnections';

afterEach(() => cleanup());

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('the record', () => {
  it('pairs a call’s start and end into one entry, with its duration', () => {
    let now = 1000;
    const sink = createAgentInspector({ now: () => now });
    sink.start({
      key: 'c1',
      actor: 'Accounting',
      source: 'mcp',
      kind: 'tool-call',
      name: 'list_invoices',
      summary: 'kind=customer',
      payload: { kind: 'customer' },
    });
    now = 1412;
    sink.end('c1', { result: [] });
    const [entry] = sink.entries();
    expect(sink.entries()).toHaveLength(1);
    expect(entry.status).toBe('done');
    expect(entry.endedAt! - entry.at).toBe(412);
    expect(entry.result).toEqual([]);
    expect(sink.end('c1')).toBeUndefined();
  });

  it('keeps the newest entries only, up to its limit', () => {
    const sink = createAgentInspector({ limit: 3 });
    for (let index = 0; index < 5; index += 1) {
      sink.push({
        actor: 'A',
        source: 'model',
        kind: 'turn',
        summary: `${index}`,
      });
    }
    expect(sink.entries().map(entry => entry.summary)).toEqual(['2', '3', '4']);
  });
});

/** A stream of server-sent events, as the runtime sends a task. */
function sse(events: unknown[]): Response {
  const body = events
    .map(
      event =>
        `data: ${JSON.stringify({ jsonrpc: '2.0', id: 1, result: event })}\n\n`,
    )
    .join('');
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream' },
  });
}

const task = {
  id: 't1',
  contextId: 'c1',
  status: { state: 'TASK_STATE_SUBMITTED' },
};
const working = (data?: unknown) => ({
  statusUpdate: {
    taskId: 't1',
    contextId: 'c1',
    status: {
      state: 'TASK_STATE_WORKING',
      ...(data ? { message: { role: 'ROLE_AGENT', parts: [{ data }] } } : {}),
    },
  },
});
const notebook = { cells: [{ cell_type: 'code', source: 'x'.repeat(30000) }] };

describe('the A2A capture', () => {
  it('records the request, each event of the stream, and the calls the peer makes', async () => {
    let now = 5000;
    const sink = createAgentInspector({ now: () => now++ });
    const network: typeof fetch = async () =>
      sse([
        { task },
        working(),
        // Two calls of one tool at once: two calls, not one told twice.
        working({
          tool_call: {
            id: 'a',
            name: 'odoo_accounting_list_invoices',
            arguments: { payment_state: 'not_paid' },
          },
        }),
        working({
          tool_call: {
            id: 'b',
            name: 'odoo_accounting_list_invoices',
            arguments: { payment_state: 'partial' },
          },
        }),
        working({
          tool_result: {
            id: 'a',
            name: 'odoo_accounting_list_invoices',
            result: '[]',
          },
        }),
        working({
          tool_result: {
            id: 'b',
            name: 'odoo_accounting_list_invoices',
            result: '[]',
          },
        }),
        working({
          tool_call: {
            id: 'w',
            name: 'write_notebook',
            arguments: {},
            note: 'Writing a notebook…',
          },
        }),
        working({
          tool_result: { id: 'w', name: 'write_notebook', result: 'ok' },
        }),
        {
          artifactUpdate: {
            taskId: 't1',
            contextId: 'c1',
            artifact: {
              artifactId: 'r',
              name: 'result',
              parts: [{ text: 'Two ' }],
            },
            append: true,
            lastChunk: false,
          },
        },
        {
          artifactUpdate: {
            taskId: 't1',
            contextId: 'c1',
            artifact: {
              artifactId: 'r',
              name: 'result',
              parts: [{ text: 'open.' }],
            },
            append: true,
            lastChunk: false,
          },
        },
        {
          artifactUpdate: {
            taskId: 't1',
            contextId: 'c1',
            artifact: {
              artifactId: 'n',
              name: 'Open invoices',
              parts: [
                { data: notebook, mediaType: 'application/x-ipynb+json' },
              ],
            },
            lastChunk: true,
          },
        },
        {
          statusUpdate: {
            taskId: 't1',
            contextId: 'c1',
            status: { state: 'TASK_STATE_COMPLETED' },
          },
        },
      ]);
    const recorded = inspectA2AFetch(network, {
      sink,
      asker: 'Sales',
      peer: 'Accounting',
      classifyTool: teamToolClassifier([
        {
          id: 'odoo-accounting',
          name: 'Odoo Accounting',
          label: 'Odoo',
          tools: [],
          prefix: 'odoo_accounting_',
        },
      ]),
    });
    const response = await recorded('http://peer/', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'SendStreamingMessage',
        params: { message: { parts: [{ text: 'Open invoices?' }] } },
      }),
    });
    // The SDK reads the whole stream, as it came.
    expect(await response.text()).toContain('TASK_STATE_COMPLETED');
    await flush();
    const entries = sink.entries();
    const request = entries[0];
    expect(request).toMatchObject({
      kind: 'request',
      name: 'SendStreamingMessage',
      summary: 'Open invoices?',
      direction: { from: 'Sales', to: 'Accounting' },
    });
    // The key is never recorded.
    expect(JSON.stringify(entries)).not.toContain('secret');
    expect(entries.map(entry => entry.kind)).toContain('task');
    const statuses = entries.filter(entry => entry.kind === 'status-update');
    expect(statuses).toHaveLength(8);
    expect(statuses.every(entry => entry.a2a?.taskId === 't1')).toBe(true);
    expect(statuses.at(-1)?.a2a?.state).toBe('TASK_STATE_COMPLETED');
    // Each call, once, paired, the peer's.
    const calls = entries.filter(entry => entry.kind === 'tool-call');
    expect(calls.map(call => [call.source, call.name, call.status])).toEqual([
      ['mcp', 'odoo_accounting_list_invoices', 'done'],
      ['mcp', 'odoo_accounting_list_invoices', 'done'],
      ['backend-tool', 'write_notebook', 'done'],
    ]);
    expect(calls[0].payload).toEqual({ payment_state: 'not_paid' });
    expect(calls[1].payload).toEqual({ payment_state: 'partial' });
    expect(calls.every(call => call.actor === 'Accounting')).toBe(true);
    expect(calls[0].links).toHaveLength(2);
    // The chunks of one artifact are one entry; the notebook another, its size kept.
    const artifacts = entries.filter(entry => entry.kind === 'artifact-update');
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0].a2a?.chunks).toBe(2);
    expect(artifacts[0].summary).toContain('Two open.');
    expect(artifacts[1].bytes).toBeGreaterThan(30000);
    // In order, each later than the one before.
    const times = entries.map(entry => entry.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('links what the asker made of an event to the entry it came from', async () => {
    const sink = createAgentInspector();
    const recorded = inspectA2AFetch(async () => sse([{ task }]), {
      sink,
      asker: 'Sales',
      peer: 'Accounting',
    });
    sink.note({ phase: 'asked', request: 'Open invoices?' });
    await recorded('http://peer/', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'SendStreamingMessage',
        params: {},
      }),
    });
    await flush();
    sink.note({ phase: 'working', taskId: 't1' });
    const [request, taskEntry] = sink.entries();
    expect(request.events).toEqual([
      { phase: 'asked', request: 'Open invoices?' },
    ]);
    expect(taskEntry.events).toEqual([{ phase: 'working', taskId: 't1' }]);
  });
});

describe('each agent’s own view', () => {
  it('shows a message in the sender’s and the receiver’s, as sent and received', () => {
    const sink = createAgentInspector();
    sink.push({
      actor: 'Sales',
      source: 'a2a',
      kind: 'request',
      summary: 'ask',
      direction: { from: 'Sales', to: 'Accounting' },
    });
    sink.push({
      actor: 'Accounting',
      source: 'mcp',
      kind: 'tool-call',
      summary: 'call',
    });
    sink.push({
      actor: 'Sales',
      source: 'model',
      kind: 'turn',
      summary: 'turn',
    });
    const [message, call, turn] = sink.entries();
    expect(isAgentsEntry(message, 'Sales')).toBe(true);
    expect(isAgentsEntry(message, 'Accounting')).toBe(true);
    expect(isAgentsEntry(call, 'Sales')).toBe(false);
    expect(isAgentsEntry(turn, 'Accounting')).toBe(false);
    expect(directionFrom(message, 'Sales')).toBe('sent → Accounting');
    expect(directionFrom(message, 'Accounting')).toBe('received ← Sales');
  });

  it('filters by source, kind and actor', () => {
    const sink = createAgentInspector();
    sink.push({ actor: 'Sales', source: 'a2a', kind: 'request', summary: '1' });
    sink.push({
      actor: 'Accounting',
      source: 'mcp',
      kind: 'tool-call',
      summary: '2',
    });
    sink.push({
      actor: 'Accounting',
      source: 'a2a',
      kind: 'status-update',
      summary: '3',
    });
    const all = sink.entries();
    const none = new Set<never>();
    expect(
      filterEntries(all, {
        sources: new Set(['a2a']),
        kinds: none,
        actors: none,
      }).map(e => e.summary),
    ).toEqual(['1', '3']);
    expect(
      filterEntries(all, {
        sources: none,
        kinds: new Set(['tool-call']),
        actors: none,
      }).map(e => e.summary),
    ).toEqual(['2']);
    expect(
      filterEntries(all, {
        sources: none,
        kinds: none,
        actors: new Set(['Accounting']),
      }).map(e => e.summary),
    ).toEqual(['2', '3']);
  });
});

describe('the view', () => {
  it('draws a row an entry, unfolding to its payload; a large one waits to be asked', async () => {
    const sink = createAgentInspector();
    sink.push({
      actor: 'Accounting',
      source: 'a2a',
      kind: 'artifact-update',
      summary: 'the notebook',
      payload: notebook,
    });
    sink.push({
      actor: 'Accounting',
      source: 'mcp',
      kind: 'tool-call',
      name: 'list_invoices',
      summary: 'small',
      payload: { kind: 'customer' },
    });
    render(
      <ThemeProvider>
        <AgentInspector sink={sink} largeBytes={1000} />
      </ThemeProvider>,
    );
    await act(flush);
    const rows = document.querySelectorAll('[data-inspector-entry]');
    expect(rows).toHaveLength(2);
    fireEvent.click(rows[0].querySelector('button')!);
    expect(rows[0].querySelector('[data-inspector-large]')).not.toBeNull();
    expect(rows[0].querySelector('[data-json-tree]')).toBeNull();
    fireEvent.click(rows[1].querySelector('button')!);
    expect(rows[1].querySelector('[data-json-tree]')?.textContent).toContain(
      'customer',
    );
    // Paused, new entries wait; cleared, nothing is left.
    fireEvent.click(screen.getByText('Pause'));
    act(() => {
      sink.push({
        actor: 'Sales',
        source: 'model',
        kind: 'turn',
        summary: 'later',
      });
    });
    await act(flush);
    expect(document.querySelectorAll('[data-inspector-entry]')).toHaveLength(2);
    expect(screen.getByText(/1 new/)).toBeTruthy();
    fireEvent.click(screen.getByText('Resume'));
    expect(document.querySelectorAll('[data-inspector-entry]')).toHaveLength(3);
    fireEvent.click(screen.getByText('Clear'));
    await act(flush);
    expect(document.querySelectorAll('[data-inspector-entry]')).toHaveLength(0);
  });
});

describe('the JSON tree', () => {
  it('folds objects and arrays, and colours values by their type', () => {
    render(
      <ThemeProvider>
        <JsonTree
          value={{
            name: 'Ada',
            due: 1200,
            paid: false,
            note: null,
            lines: [1, 2],
          }}
          expandDepth={1}
        />
      </ThemeProvider>,
    );
    const types = [...document.querySelectorAll('[data-json-type]')].map(node =>
      node.getAttribute('data-json-type'),
    );
    expect(types).toEqual(['string', 'number', 'boolean', 'null']);
    // The array is folded, its count said.
    expect(screen.getByText(/2 items/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Unfold lines'));
    expect([
      ...document.querySelectorAll('[data-json-type="number"]'),
    ]).toHaveLength(3);
  });
});
