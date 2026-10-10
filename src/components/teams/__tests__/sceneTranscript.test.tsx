/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The transcript of a scene (LOOP A-06): a scripted scene — the person asks
 * Sales, Sales asks Accounting over A2A, Accounting calls Odoo, answers, and
 * Sales reports — gives the expected lines, in order, from the spans the
 * Agent Inspector reads; the same lines from a finished run's record; and
 * the view draws them behind a Graph · Transcript toggle, copied as text.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '@primer/react';
import { createOtelLiveTracer } from '@datalayer/core/lib/otel/live';
import {
  endAgentTurn,
  endToolCall,
  startAgentTurn,
  startToolCall,
} from '../../inspector/agentSpans';
import {
  lineText,
  PERSON,
  timeText,
  transcriptOfRecord,
  transcriptOfSpans,
  transcriptText,
  type SceneTranscriptMember,
} from '../sceneTranscript';
import { SceneTranscript } from '../SceneTranscript';
import { SceneView } from '../SceneView';
import type { A2ATeamConnection } from '../a2aTeamFlow';
import type { RecordEntry } from '../../../apps/apps/records';

const ODOO: A2ATeamConnection = {
  id: 'odoo-accounting',
  name: 'Odoo Accounting',
  label: 'Odoo',
  via: 'via MCP',
  tools: ['odoo_accounting_aged_balance', 'odoo_accounting_list_invoices'],
  prefix: 'odoo_accounting_',
};

const MEMBERS: SceneTranscriptMember[] = [
  { id: 'sales', name: 'Sales' },
  { id: 'accounting', name: 'Accounting', connections: [ODOO] },
];

/** A clock a test turns by hand, so that the lines' times are known. */
function clock(start = Date.UTC(2026, 9, 7, 12, 0, 0)) {
  let now = start;
  return {
    now: () => now,
    tick(ms: number) {
      now += ms;
      return now;
    },
  };
}

/** The scripted scene, as the page records it: its spans in a tracer. */
function scriptedScene() {
  const time = clock();
  const tracer = createOtelLiveTracer({
    serviceName: 'Scene',
    now: time.now,
    randomHex: (() => {
      let next = 0;
      return (bytes: number) => (++next).toString(16).padStart(bytes * 2, '0');
    })(),
  });
  // The person asks Sales: a turn of Sales'.
  const turn = startAgentTurn(tracer, {
    agent: 'Sales',
    prompt: 'Give me the aged receivables as of today, by customer.',
    model: 'anthropic:claude',
  });
  time.tick(1000);
  // Sales asks Accounting: its tool, and under it the A2A request.
  const ask = startToolCall(tracer, {
    agent: 'Sales',
    name: 'ask_accounting',
    id: 'call-1',
    args: { request: 'Aged receivables as of today, by customer.' },
    tool: { kind: 'frontend' },
    parent: turn.context,
  });
  const request = tracer.startSpan('a2a SendStreamingMessage', {
    serviceName: 'Sales',
    kind: 'CLIENT',
    parent: ask.context,
    attributes: {
      'rpc.service': 'a2a',
      'peer.service': 'Accounting',
      'a2a.message.text': 'Aged receivables as of today, by customer.',
    },
  });
  time.tick(1000);
  // Accounting calls Odoo, told over A2A as a working status.
  const call = startToolCall(tracer, {
    agent: 'Accounting',
    name: 'odoo_accounting_aged_balance',
    id: 'call-2',
    args: { date: '2026-10-07' },
    tool: { kind: 'mcp' },
    parent: request.context,
    origin: 'a2a.status',
  });
  time.tick(2000);
  endToolCall(call, { result: { rows: 3 } });
  time.tick(500);
  request.addEvent('a2a.artifact_update', {
    'a2a.message.text':
      'Three customers owe 12,400 EUR; the oldest is 91 days.',
  });
  request.setAttribute(
    'a2a.answer.text',
    'Three customers owe 12,400 EUR; the oldest is 91 days.',
  );
  request.setStatus('OK');
  request.end();
  endToolCall(ask, { result: 'Three customers owe 12,400 EUR.' });
  time.tick(500);
  endAgentTurn(turn, {
    text: 'Accounting says three customers owe 12,400 EUR; the oldest is 91 days.',
    usage: { inputTokens: 10, outputTokens: 20 },
  });
  return { tracer, time };
}

afterEach(cleanup);

describe('transcriptOfSpans', () => {
  it('gives the scripted scene its lines, in order', () => {
    const { tracer } = scriptedScene();
    const lines = transcriptOfSpans(tracer.spans(), MEMBERS);
    expect(lines.map(lineText)).toEqual([
      `${PERSON} → Sales: Give me the aged receivables as of today, by customer.`,
      'Sales → Accounting: Aged receivables as of today, by customer.',
      'Accounting → Odoo: odoo_accounting_aged_balance',
      'Accounting: Three customers owe 12,400 EUR; the oldest is 91 days.',
      'Sales: Accounting says three customers owe 12,400 EUR; the oldest is 91 days.',
    ]);
    expect(lines.map(line => line.kind)).toEqual([
      'asked',
      'asked',
      'called',
      'said',
      'said',
    ]);
    // Each with its time, as the clock said it.
    expect(lines.map(line => line.at - lines[0].at)).toEqual([
      0, 1000, 2000, 4500, 5000,
    ]);
    // The call to the peer (Sales' own tool) is told by the A2A request, once.
    expect(lines.some(line => line.text === 'ask_accounting')).toBe(false);
  });

  it('says what is still happening, and what failed', () => {
    const time = clock();
    const tracer = createOtelLiveTracer({
      serviceName: 'Scene',
      now: time.now,
    });
    const turn = startAgentTurn(tracer, {
      agent: 'Sales',
      prompt: 'Open invoices?',
    });
    const request = tracer.startSpan('a2a SendStreamingMessage', {
      serviceName: 'Sales',
      parent: turn.context,
      attributes: {
        'rpc.service': 'a2a',
        'peer.service': 'Accounting',
        'a2a.message.text': 'Open invoices.',
      },
    });
    startToolCall(tracer, {
      agent: 'Accounting',
      name: 'odoo_accounting_list_invoices',
      tool: { kind: 'mcp' },
      parent: request.context,
    });
    let lines = transcriptOfSpans(tracer.spans(), MEMBERS);
    expect(lines.map(lineText)).toEqual([
      `${PERSON} → Sales: Open invoices?`,
      'Sales → Accounting: Open invoices.…',
      'Accounting → Odoo: odoo_accounting_list_invoices…',
    ]);
    expect(lines[2].open).toBe(true);
    time.tick(1000);
    request.setStatus('ERROR', 'TASK_STATE_FAILED');
    request.end();
    lines = transcriptOfSpans(tracer.spans(), MEMBERS);
    expect(lines.at(-1)).toMatchObject({
      from: 'Accounting',
      kind: 'said',
      failed: true,
      text: 'could not answer: TASK_STATE_FAILED',
    });
    // The agent card, read without a word: not a line.
    tracer.startSpan('a2a agent card', {
      serviceName: 'Sales',
      attributes: { 'rpc.service': 'a2a', 'peer.service': 'Accounting' },
    });
    expect(transcriptOfSpans(tracer.spans(), MEMBERS)).toHaveLength(4);
  });

  it('names a tool that is no connection’s by where it comes from', () => {
    const tracer = createOtelLiveTracer({ serviceName: 'Scene' });
    startToolCall(tracer, {
      agent: 'Accounting',
      name: 'write_notebook',
      tool: { kind: 'runtime' },
    });
    startToolCall(tracer, {
      agent: 'Sales',
      name: 'show_chart',
      tool: { kind: 'frontend' },
    });
    expect(transcriptOfSpans(tracer.spans(), MEMBERS).map(lineText)).toEqual([
      'Accounting → its runtime: write_notebook…',
      'Sales → the page: show_chart…',
    ]);
  });

  it('says one thing once when a runtime’s own spans repeat the answer', () => {
    const time = clock();
    const tracer = createOtelLiveTracer({
      serviceName: 'Scene',
      now: time.now,
    });
    const request = tracer.startSpan('a2a SendStreamingMessage', {
      serviceName: 'Sales',
      attributes: {
        'rpc.service': 'a2a',
        'peer.service': 'Accounting',
        'a2a.message.text': 'Trial balance.',
        'a2a.answer.text': 'The trial balance balances.',
      },
    });
    // The peer's own turn, as its runtime's spans would say it, under the request.
    const turn = tracer.startSpan('invoke_agent Accounting', {
      serviceName: 'Accounting',
      parent: request.context,
      attributes: {
        'gen_ai.operation.name': 'invoke_agent',
        'gen_ai.agent.name': 'Accounting',
        'gen_ai.input.messages': JSON.stringify([
          {
            role: 'user',
            parts: [{ type: 'text', content: 'Trial balance.' }],
          },
        ]),
      },
    });
    time.tick(100);
    endAgentTurn(turn, { text: 'The trial balance balances.' });
    request.end();
    expect(transcriptOfSpans(tracer.spans(), MEMBERS).map(lineText)).toEqual([
      'Sales → Accounting: Trial balance.',
      'Accounting: The trial balance balances.',
    ]);
  });
});

describe('transcriptOfRecord', () => {
  const entry = (
    uid: string,
    kind: RecordEntry['kind'],
    summary: string,
    payload: Record<string, unknown>,
    at: string,
  ): RecordEntry => ({
    uid,
    sessionUid: 's1',
    deploymentUid: 'd1',
    version: 1,
    kind,
    summary,
    payload,
    createdAt: at,
  });

  it('reads a finished run the same way', () => {
    const entries = [
      entry(
        't1',
        'turn',
        'Aged receivables?',
        {
          asked: 'Aged receivables?',
          answered: 'Three customers owe 12,400 EUR.',
        },
        '2026-10-07T12:00:05Z',
      ),
      entry(
        'c1',
        'tool_call',
        'odoo_accounting_aged_balance called',
        {
          tool: 'odoo_accounting_aged_balance',
          arguments: {},
          result: '…',
        },
        '2026-10-07T12:00:02Z',
      ),
      entry(
        'o1',
        'output',
        'Three customers owe 12,400 EUR.',
        {},
        '2026-10-07T12:00:05Z',
      ),
    ];
    const lines = transcriptOfRecord(entries, MEMBERS[1]);
    expect(lines.map(lineText)).toEqual([
      `${PERSON} → Accounting: Aged receivables?`,
      'Accounting → Odoo: odoo_accounting_aged_balance',
      'Accounting: Three customers owe 12,400 EUR.',
    ]);
    // The question is placed where the turn began: with its first call.
    expect(lines[0].at).toBe(Date.parse('2026-10-07T12:00:02Z'));
    // A record kept without its conversations: the answer's summary stands in.
    expect(
      transcriptOfRecord([entries[1], entries[2]], MEMBERS[1]).map(lineText),
    ).toEqual([
      'Accounting → Odoo: odoo_accounting_aged_balance',
      'Accounting: Three customers owe 12,400 EUR.',
    ]);
  });
});

describe('transcriptText', () => {
  it('copies each line with its time', () => {
    const { tracer } = scriptedScene();
    const lines = transcriptOfSpans(tracer.spans(), MEMBERS);
    const text = transcriptText(lines);
    const rows = text.split('\n');
    expect(rows).toHaveLength(5);
    expect(rows[2]).toBe(
      `${timeText(lines[2].at)}  Accounting → Odoo: odoo_accounting_aged_balance`,
    );
    expect(rows[0]).toMatch(/^\d\d:\d\d:\d\d {2}You → Sales: /);
  });
});

describe('SceneTranscript and SceneView', () => {
  it('draws the lines, and copies them as text', async () => {
    const { tracer } = scriptedScene();
    const lines = transcriptOfSpans(tracer.spans(), MEMBERS);
    const copied: string[] = [];
    const { container } = render(
      <ThemeProvider>
        <SceneTranscript
          lines={lines}
          writeText={async text => {
            copied.push(text);
          }}
        />
      </ThemeProvider>,
    );
    const drawn = Array.from(
      container.querySelectorAll('[data-transcript-line]'),
    );
    expect(drawn).toHaveLength(5);
    expect(drawn[2].getAttribute('data-transcript-line')).toBe('called');
    expect(drawn[2].getAttribute('data-transcript-from')).toBe('Accounting');
    expect(drawn[2].getAttribute('data-transcript-to')).toBe('Odoo');
    expect(drawn[2].textContent).toContain(
      'Accounting → Odoo: odoo_accounting_aged_balance',
    );
    const copy = container.querySelector(
      '[data-transcript-copy]',
    ) as HTMLButtonElement;
    expect(copy.textContent).toBe('Copy as text');
    await act(async () => {
      fireEvent.click(copy);
    });
    expect(copied).toEqual([transcriptText(lines)]);
    expect(copy.textContent).toBe('Copied');
  });

  it('shows the graph, then the transcript read live from the tracer', async () => {
    const { tracer } = scriptedScene();
    const { container } = render(
      <ThemeProvider>
        <SceneView members={MEMBERS} tracer={tracer}>
          <div data-the-graph="">the graph</div>
        </SceneView>
      </ThemeProvider>,
    );
    expect(
      container
        .querySelector('[data-scene-view]')
        ?.getAttribute('data-scene-view'),
    ).toBe('graph');
    expect(
      container.querySelector('[data-scene-graph]')?.hasAttribute('hidden'),
    ).toBe(false);
    expect(container.querySelector('[data-scene-transcript]')).toBeNull();
    const toggle = container.querySelector(
      '[data-scene-choice="transcript"]',
    ) as HTMLButtonElement;
    expect(toggle.textContent).toBe('Transcript (5)');
    fireEvent.click(toggle);
    expect(
      container
        .querySelector('[data-scene-view]')
        ?.getAttribute('data-scene-view'),
    ).toBe('transcript');
    // The graph stays mounted, hidden, so that it is as it was when it comes back.
    expect(container.querySelector('[data-the-graph]')).not.toBeNull();
    expect(
      container.querySelector('[data-scene-graph]')?.hasAttribute('hidden'),
    ).toBe(true);
    expect(container.querySelectorAll('[data-transcript-line]')).toHaveLength(
      5,
    );
    // A new span is a new line, as it happens (the tracer tells in a microtask).
    await act(async () => {
      startToolCall(tracer, {
        agent: 'Accounting',
        name: 'odoo_accounting_list_invoices',
        tool: { kind: 'mcp' },
      });
    });
    expect(container.querySelectorAll('[data-transcript-line]')).toHaveLength(
      6,
    );
    fireEvent.click(
      container.querySelector(
        '[data-scene-choice="graph"]',
      ) as HTMLButtonElement,
    );
    expect(
      container.querySelector('[data-scene-graph]')?.hasAttribute('hidden'),
    ).toBe(false);
  });

  it('draws an answer’s markdown as the chat does: a table is a table', () => {
    const lines = transcriptOfRecord(
      [
        {
          uid: 't2',
          sessionUid: 's1',
          deploymentUid: 'd1',
          version: 1,
          kind: 'turn',
          summary: 'Open invoices?',
          payload: {
            asked: 'Open invoices?',
            answered:
              'There are **2 open invoices**:\n\n| Invoice | Due |\n|---|---|\n| INV/1 | €3,993.00 |\n| INV/2 | €2,359.50 |',
          },
          createdAt: '2026-10-07T12:00:05Z',
        },
      ],
      MEMBERS[1],
    );
    const { container } = render(
      <ThemeProvider>
        <SceneView members={MEMBERS} lines={lines} defaultView="transcript">
          <div>the graph</div>
        </SceneView>
      </ThemeProvider>,
    );
    const said = container.querySelectorAll('[data-transcript-line="said"]');
    expect(said).toHaveLength(1);
    // Not its markdown run into one line (2026-10-10).
    expect(said[0].querySelector('table')).not.toBeNull();
    expect(said[0].querySelectorAll('tbody tr')).toHaveLength(2);
    expect(said[0].textContent).toContain('2 open invoices');
    expect(said[0].textContent).not.toContain('**');
    expect(said[0].textContent).not.toContain('|---|');
  });

  it('takes a finished run’s lines instead of the tracer', () => {
    const lines = transcriptOfRecord(
      [
        {
          uid: 't1',
          sessionUid: 's1',
          deploymentUid: 'd1',
          version: 1,
          kind: 'turn',
          summary: 'Open invoices?',
          payload: { asked: 'Open invoices?', answered: 'Two are open.' },
          createdAt: '2026-10-07T12:00:05Z',
        },
      ],
      MEMBERS[1],
    );
    const { container } = render(
      <ThemeProvider>
        <SceneView members={MEMBERS} lines={lines} defaultView="transcript">
          <div>the graph</div>
        </SceneView>
      </ThemeProvider>,
    );
    expect(
      Array.from(container.querySelectorAll('[data-transcript-line]')).map(
        node => node.textContent,
      ),
    ).toEqual([
      expect.stringContaining('You → Accounting: Open invoices?'),
      expect.stringContaining('Accounting: Two are open.'),
    ]);
  });
});
