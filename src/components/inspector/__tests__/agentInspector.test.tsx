/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Agent Inspector on OpenTelemetry: a turn and its tool calls as GenAI
 * spans, the A2A capture under the SDK's fetch (a client span of the
 * asker's, the stream's events on it, the peer's calls as its spans, the
 * artifacts, the agent card), where a tool comes from, each agent's own
 * view, and the view drawn by core's OTEL view.
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
import { createOtelLiveTracer } from '@datalayer/core/lib/otel/live';
import {
  describeAgentSpan,
  endAgentTurn,
  endToolCall,
  sourceOfSpan,
  startAgentTurn,
  startToolCall,
} from '../agentSpans';
import { chatSpanRecorder } from '../chatSpans';
import { traceA2AFetch } from '../a2aSpans';
import { CODEMODE_TOOLS, classifyToolCall } from '../classify';
import { AgentInspector } from '../AgentInspector';
import { teamToolClassifier } from '../../teams/teamConnections';

afterEach(() => cleanup());

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('a turn and its tool calls', () => {
  it('are an invoke_agent span and execute_tool spans under it, as the GenAI conventions say', () => {
    let now = 1000;
    const tracer = createOtelLiveTracer({ now: () => now });
    const turn = startAgentTurn(tracer, {
      agent: 'Accounting',
      prompt: 'Open invoices?',
      model: 'gpt-x',
    });
    const call = startToolCall(tracer, {
      agent: 'Accounting',
      name: 'list_invoices',
      id: 'c1',
      args: { kind: 'customer' },
      tool: { kind: 'mcp', emoji: '📒' },
    });
    now = 1412;
    endToolCall(call, { result: [] });
    endAgentTurn(turn, {
      text: 'None.',
      usage: { inputTokens: 10, outputTokens: 2 },
    });
    const [turnSpan, callSpan] = tracer.spans();
    expect(turnSpan).toMatchObject({
      span_name: 'invoke_agent Accounting',
      service_name: 'Accounting',
      status_code: 'OK',
      attributes: {
        'gen_ai.operation.name': 'invoke_agent',
        'gen_ai.agent.name': 'Accounting',
        'gen_ai.request.model': 'gpt-x',
        'gen_ai.usage.input_tokens': 10,
        'gen_ai.usage.output_tokens': 2,
      },
    });
    expect(callSpan).toMatchObject({
      span_name: 'execute_tool list_invoices',
      parent_span_id: turnSpan.span_id,
      duration_ms: 412,
      attributes: {
        'gen_ai.operation.name': 'execute_tool',
        'gen_ai.tool.name': 'list_invoices',
        'gen_ai.tool.call.id': 'c1',
        'gen_ai.tool.call.arguments': '{"kind":"customer"}',
        'gen_ai.tool.call.result': '[]',
        'gen_ai.tool.type': 'extension',
        'datalayer.tool.kind': 'mcp',
        'datalayer.mark.emoji': '📒',
      },
    });
    expect(describeAgentSpan(turnSpan)).toBe(
      'Open invoices? → None. · 12 tokens',
    );
    expect(describeAgentSpan(callSpan)).toBe('kind=customer');
    expect(sourceOfSpan(turnSpan)).toBe('model');
    expect(sourceOfSpan(callSpan)).toBe('mcp');
  });

  it('records a failed call and a failed turn as errors', () => {
    const tracer = createOtelLiveTracer();
    const recorder = chatSpanRecorder(tracer, () => 'Clip', {
      frontendTools: () => ['show_chart'],
    });
    recorder.turnStarted('Draw it', 'gpt-x');
    recorder.toolStarted({ id: 't1', name: 'show_chart', args: { a: 1 } });
    // Arguments that stream in: the same call, its latest arguments.
    recorder.toolStarted({ id: 't1', name: 'show_chart', args: { a: 2 } });
    recorder.toolEnded('t1', { error: 'no canvas' });
    recorder.turnEnded({ error: 'stopped' });
    const [turn, tool] = tracer.spans();
    expect(tracer.spans()).toHaveLength(2);
    expect(tool.parent_span_id).toBe(turn.span_id);
    expect(tool.attributes?.['datalayer.tool.kind']).toBe('frontend');
    expect(tool.attributes?.['gen_ai.tool.call.arguments']).toBe('{"a":2}');
    expect(tool.status_code).toBe('ERROR');
    expect(tool.events?.[0]?.name).toBe('exception');
    expect(turn.status_code).toBe('ERROR');
    expect(turn.service_name).toBe('Clip');
  });
});

describe('where a tool comes from', () => {
  it('is the page, codemode or the runtime, by who claims its name', () => {
    expect(classifyToolCall('mine', {}, { frontendTools: ['mine'] }).kind).toBe(
      'frontend',
    );
    expect(classifyToolCall('execute_code').kind).toBe('codemode');
    expect(CODEMODE_TOOLS.has('search_tools')).toBe(true);
    expect(classifyToolCall('nobody_claims_it').kind).toBe('runtime');
    expect(
      classifyToolCall('nobody_claims_it', {}, { fallback: 'mcp' }).kind,
    ).toBe('mcp');
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

const ODOO = [
  {
    id: 'odoo-accounting',
    name: 'Odoo Accounting',
    label: 'Odoo',
    tools: [],
    prefix: 'odoo_accounting_',
  },
];

/** Sales, in a turn, asks Accounting over A2A; the peer answers `events`. */
async function ask(events: unknown[]) {
  let now = 5000;
  const tracer = createOtelLiveTracer({
    serviceName: 'Sales',
    now: () => now++,
  });
  // Sales' call to the peer, open: the request nests under it.
  const turn = startAgentTurn(tracer, { agent: 'Sales', prompt: 'Report' });
  const asking = startToolCall(tracer, {
    agent: 'Sales',
    name: 'ask_accounting',
    tool: { kind: 'frontend' },
  });
  const traced = traceA2AFetch(async () => sse(events), {
    tracer,
    asker: 'Sales',
    peer: 'Accounting',
    classifyTool: teamToolClassifier(ODOO),
  });
  const response = await traced('http://peer/', {
    method: 'POST',
    headers: { Authorization: 'Bearer secret' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'SendStreamingMessage',
      params: { message: { parts: [{ text: 'Open invoices?' }] } },
    }),
  });
  return { tracer, turn, asking, response };
}

describe('the A2A capture', () => {
  it('records the request as a client span, the stream as its events, and the peer’s calls as its spans', async () => {
    const { tracer, asking, response } = await ask([
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
        tool_call: { id: 'w', name: 'write_notebook', arguments: {} },
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
          lastChunk: true,
        },
      },
      {
        artifactUpdate: {
          taskId: 't1',
          contextId: 'c1',
          artifact: {
            artifactId: 'n',
            name: 'Open invoices',
            parts: [{ data: notebook, mediaType: 'application/x-ipynb+json' }],
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
    // The SDK reads the whole stream, as it came.
    expect(await response.text()).toContain('TASK_STATE_COMPLETED');
    await flush();
    const spans = tracer.spans();
    const request = spans.find(
      span => span.span_name === 'a2a SendStreamingMessage',
    )!;
    expect(request).toMatchObject({
      service_name: 'Sales',
      kind: 'CLIENT',
      parent_span_id: asking.context.span_id,
      in_progress: false,
      attributes: {
        'rpc.system': 'jsonrpc',
        'rpc.service': 'a2a',
        'rpc.method': 'SendStreamingMessage',
        'rpc.jsonrpc.request_id': '1',
        'peer.service': 'Accounting',
        'a2a.message.text': 'Open invoices?',
        'a2a.task.id': 't1',
        'a2a.context.id': 'c1',
        'a2a.task.state': 'TASK_STATE_COMPLETED',
        'http.response.status_code': 200,
      },
    });
    // The key is never recorded.
    expect(JSON.stringify(spans)).not.toContain('secret');
    const events = request.events!.map(event => event.name);
    expect(events[0]).toBe('a2a.task');
    expect(events.filter(name => name === 'a2a.status_update')).toHaveLength(8);
    // The chunks of one artifact are one event; the notebook another, whole.
    const artifacts = request.events!.filter(
      event => event.name === 'a2a.artifact_update',
    );
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0].attributes).toMatchObject({
      'a2a.artifact.chunks': 2,
      'a2a.message.text': 'Two open.',
    });
    expect(artifacts[1].attributes).toMatchObject({
      'a2a.artifact.media_type': 'application/x-ipynb+json',
    });
    expect(
      String(artifacts[1].attributes?.['a2a.event']).length,
    ).toBeGreaterThan(30000);
    // Each call, once, paired, the peer's, under the request.
    const calls = spans.filter(span => span.service_name === 'Accounting');
    expect(
      calls.map(call => [
        call.attributes?.['datalayer.tool.kind'],
        call.attributes?.['gen_ai.tool.name'],
        call.in_progress,
      ]),
    ).toEqual([
      ['mcp', 'odoo_accounting_list_invoices', false],
      ['mcp', 'odoo_accounting_list_invoices', false],
      ['runtime', 'write_notebook', false],
    ]);
    expect(calls[0].attributes?.['gen_ai.tool.call.arguments']).toBe(
      '{"payment_state":"not_paid"}',
    );
    expect(calls[1].attributes?.['gen_ai.tool.call.arguments']).toBe(
      '{"payment_state":"partial"}',
    );
    expect(
      calls.every(
        call =>
          call.parent_span_id === request.span_id &&
          call.attributes?.['datalayer.span.origin'] === 'a2a.status',
      ),
    ).toBe(true);
    expect(sourceOfSpan(request)).toBe('a2a');
    expect(describeAgentSpan(request)).toBe('completed · Open invoices?');
  });

  it('records a failed task, a refused request and a network error as errors', async () => {
    const { tracer: failedTask } = await ask([
      { task },
      {
        statusUpdate: {
          taskId: 't1',
          contextId: 'c1',
          status: { state: 'TASK_STATE_FAILED' },
        },
      },
    ]);
    await flush();
    expect(
      failedTask.spans().find(span => span.span_name.startsWith('a2a '))
        ?.status_code,
    ).toBe('ERROR');

    const tracer = createOtelLiveTracer({ serviceName: 'Sales' });
    const refused = traceA2AFetch(
      async () => new Response('no key', { status: 401 }),
      { tracer, asker: 'Sales', peer: 'Accounting' },
    );
    await refused('http://peer/', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'GetTask' }),
    });
    await flush();
    const offline = traceA2AFetch(
      async () => {
        throw new TypeError('Failed to fetch');
      },
      { tracer, asker: 'Sales', peer: 'Accounting' },
    );
    await expect(
      offline('http://peer/', {
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'GetTask' }),
      }),
    ).rejects.toThrow('Failed to fetch');
    await flush();
    const [unauthorized, unreachable] = tracer.spans();
    expect(unauthorized).toMatchObject({
      status_code: 'ERROR',
      attributes: { 'http.response.status_code': 401, 'a2a.error': 'no key' },
    });
    // The second request was not nested under the first: it had ended.
    expect(unreachable.parent_span_id).toBeUndefined();
    expect(unreachable.status_code).toBe('ERROR');
    expect(unreachable.status_message).toBe('Failed to fetch');
  });

  it('records the agent card it fetches', async () => {
    const tracer = createOtelLiveTracer({ serviceName: 'Sales' });
    const traced = traceA2AFetch(
      async () =>
        new Response(
          JSON.stringify({
            name: 'Accounting',
            skills: [{ id: 'report', name: 'Financial report' }],
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      { tracer, asker: 'Sales', peer: 'Accounting' },
    );
    await traced('http://peer/.well-known/agent-card.json');
    await flush();
    const [card] = tracer.spans();
    expect(card).toMatchObject({
      span_name: 'a2a agent card',
      kind: 'CLIENT',
      in_progress: false,
      attributes: {
        'peer.service': 'Accounting',
        'a2a.agent.name': 'Accounting',
        'a2a.agent.skills': ['Financial report'],
      },
    });
    expect(describeAgentSpan(card)).toBe('Financial report');
  });
});

describe('the view', () => {
  it('draws each agent its own spans, a request in the asker’s and the peer’s', async () => {
    const { tracer } = await ask([
      { task },
      working({
        tool_call: {
          id: 'a',
          name: 'odoo_accounting_list_invoices',
          arguments: { payment_state: 'not_paid' },
        },
      }),
    ]);
    await flush();
    const names = (agent: string) =>
      [
        ...document.querySelectorAll(
          `[data-agent-inspector="${agent}"] [data-otel-span-name]`,
        ),
      ].map(row => row.getAttribute('data-otel-span-name'));
    render(
      <ThemeProvider>
        <AgentInspector tracer={tracer} agent="Sales" compact />
        <AgentInspector tracer={tracer} agent="Accounting" compact />
      </ThemeProvider>,
    );
    await act(flush);
    expect(names('Sales')).toEqual([
      'invoke_agent Sales',
      'execute_tool ask_accounting',
      'a2a SendStreamingMessage',
    ]);
    expect(names('Accounting')).toEqual([
      'a2a SendStreamingMessage',
      'execute_tool odoo_accounting_list_invoices',
    ]);
    // The turn is still going: said so, its line the question.
    expect(screen.getAllByText('running').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Report').length).toBeGreaterThan(0);
    // A call opens to its attributes, its arguments unfolded.
    fireEvent.click(
      document.querySelector(
        '[data-agent-inspector="Accounting"] [data-otel-span-name="execute_tool odoo_accounting_list_invoices"]',
      )!,
    );
    expect(
      document.querySelector(
        '[data-agent-inspector="Accounting"] [data-otel-live-detail]',
      )?.textContent,
    ).toContain('not_paid');
  });
});
