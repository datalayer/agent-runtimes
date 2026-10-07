/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Sales side of the team `sales-and-accounting`: `@a2a-js/sdk`'s client
 * asking Accounting over A2A, against a faked endpoint.
 *
 * The endpoint answers with what the runtime serves: the agent card is
 * `fixtures/accounting-agent-card.json` and the stream
 * `fixtures/accounting-stream.sse`, both recorded from Accounting served with
 * fasta2a in process (`agent_runtimes/tests/test_apps_a2a.py`, which also
 * fails when the card drifts from the fixture).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  A2UI_MEDIA_TYPE,
  NOTEBOOK_MEDIA_TYPE,
  a2aPeerTool,
  askA2APeer,
  connectA2APeer,
  faceOfCard,
  offeredFormats,
  peerToolDescription,
  type A2APeerEvent,
} from '../browser/a2aPeer';

const FIXTURES = join(__dirname, 'fixtures');
const URL = 'http://runtime.test/api/v1/a2a/agents/accounting';
const KEY = 'a-key-granted-to-the-route';
const REPORT = 'Open invoices: INV/2026/0007, 1,200.00 EUR due.';
const CARD = readFileSync(join(FIXTURES, 'accounting-agent-card.json'), 'utf8');
const STREAM = readFileSync(join(FIXTURES, 'accounting-stream.sse'), 'utf8');
/** Accounting's answer to a request that accepts a notebook: the text, and the notebook. */
const NOTEBOOK_STREAM = readFileSync(
  join(FIXTURES, 'accounting-notebook-stream.sse'),
  'utf8',
);
const ACCEPT = [NOTEBOOK_MEDIA_TYPE, 'text/markdown'];

type Seen = { url: string; method: string; headers: Headers; body?: any };

/** Accounting, as the runtime serves it, and what it was sent. */
function accounting(options: { refuse?: number; stream?: string } = {}): {
  fetch: typeof globalThis.fetch;
  seen: Seen[];
} {
  const seen: Seen[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    seen.push({ url, method: init?.method ?? 'GET', headers, body });
    if (url === `${URL}/.well-known/agent-card.json`) {
      return new Response(CARD, {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === `${URL}/` && init?.method === 'POST') {
      if (options.refuse) {
        return new Response(
          JSON.stringify({
            detail:
              'accounting answers a key granted to its A2A route, and this token was not granted to it.',
          }),
          {
            status: options.refuse,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
      return new Response(options.stream ?? STREAM, {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof globalThis.fetch;
  return { fetch, seen };
}

describe('Sales asks Accounting over A2A', () => {
  it('reads the card: one skill, text in and out, a key asked for', async () => {
    const { fetch, seen } = accounting();
    const peer = await connectA2APeer({ url: `${URL}/`, key: KEY, fetch });
    expect(peer.card.name).toBe('Accounting');
    // Its face rides the face extension; its name stays plain.
    expect(peer.face).toEqual({ emoji: '🧾' });
    expect(peer.skill.id).toBe('accounting');
    expect(peer.skill.inputModes).toEqual(['text/plain']);
    expect(peer.skill.examples).toContain(
      'List the customer invoices that are still open, with the total due.',
    );
    expect(Object.keys(peer.card.securitySchemes)).toEqual(['datalayer']);
    expect(seen[0].headers.get('Authorization')).toBe(`Bearer ${KEY}`);
    const description = peerToolDescription(peer);
    expect(description).toContain('Ask Accounting, over A2A');
    expect(description).toContain('Give the trial balance for last month.');
  });

  it('asks in A2A 1.0, with the key, and tells each step', async () => {
    const { fetch, seen } = accounting();
    const peer = await connectA2APeer({ url: URL, key: KEY, fetch });
    const events: A2APeerEvent[] = [];
    const { answer, artifacts } = await askA2APeer(
      peer,
      'Which invoices are open?',
      { onEvent: event => events.push(event) },
    );
    expect(answer).toBe(REPORT);
    expect(artifacts).toEqual([]);
    const [request] = seen.filter(entry => entry.method === 'POST');
    expect(request.url).toBe(`${URL}/`);
    expect(request.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
    expect(request.body.method).toBe('SendStreamingMessage');
    expect(request.body.params.message.role).toBe('ROLE_USER');
    expect(request.body.params.message.parts).toEqual([
      { text: 'Which invoices are open?' },
    ]);
    // Accepting nothing named, it is answered in words alone.
    expect(
      request.body.params.configuration?.acceptedOutputModes ?? [],
    ).toEqual([]);
    expect(events[0]).toEqual({
      phase: 'asked',
      request: 'Which invoices are open?',
    });
    const working = events.filter(event => event.phase === 'working');
    expect(working.map(event => event.note).filter(Boolean)).toEqual([
      'Calling odoo_accounting_list_invoices',
      'Read odoo_accounting_list_invoices',
    ]);
    // Each tool call and its end, as the runtime's A2A worker tells them.
    expect(working.map(event => event.tool).filter(Boolean)).toEqual([
      { id: 'c1', name: 'odoo_accounting_list_invoices', ended: false },
      { id: 'c1', name: 'odoo_accounting_list_invoices', ended: true },
    ]);
    expect(events.at(-1)).toMatchObject({ phase: 'answered', answer: REPORT });
  });

  it('says why when the runtime refuses the key, and the tool returns it', async () => {
    const { fetch } = accounting({ refuse: 403 });
    const peer = await connectA2APeer({ url: URL, key: 'another-key', fetch });
    const events: A2APeerEvent[] = [];
    const ask = a2aPeerTool({ peer, onEvent: event => events.push(event) });
    const result = await ask.execute!(
      { request: 'Which invoices are open?' },
      { toolCallId: 'call-1', messages: [] },
    );
    expect(result).toMatchObject({ error: expect.stringContaining('403') });
    expect(events.map(event => event.phase)).toEqual(['asked', 'failed']);
  });

  it('a task that fails is not an answer', async () => {
    const failed = STREAM.split('\n\n')
      .filter(Boolean)
      .slice(0, 1)
      .concat(
        `data: ${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            statusUpdate: {
              taskId: 't',
              contextId: 'c',
              status: {
                state: 'TASK_STATE_FAILED',
                message: {
                  role: 'ROLE_AGENT',
                  parts: [{ text: 'The odoo tools were refused.' }],
                  messageId: 'm',
                },
              },
            },
          },
        })}`,
      )
      .join('\n\n')
      .concat('\n\n');
    const { fetch } = accounting({ stream: failed });
    const peer = await connectA2APeer({ url: URL, key: KEY, fetch });
    await expect(askA2APeer(peer, 'Open invoices?')).rejects.toThrow(
      'Accounting failed: The odoo tools were refused.',
    );
  });

  it('a request that says nothing is not sent', async () => {
    const { fetch, seen } = accounting();
    const peer = await connectA2APeer({ url: URL, key: KEY, fetch });
    const ask = a2aPeerTool({ peer });
    const result = await ask.execute!(
      { request: '  ' },
      { toolCallId: 'call-1', messages: [] },
    );
    expect(result).toEqual({
      error: 'A request to Accounting says what it asks.',
    });
    expect(seen.filter(entry => entry.method === 'POST')).toEqual([]);
  });

  it('reads on the card the formats Accounting gives besides words', async () => {
    const { fetch } = accounting();
    const peer = await connectA2APeer({ url: URL, key: KEY, fetch });
    expect(peer.skill.outputModes).toEqual([
      'text/markdown',
      NOTEBOOK_MEDIA_TYPE,
      A2UI_MEDIA_TYPE,
    ]);
    expect(offeredFormats(peer, ACCEPT)).toEqual([NOTEBOOK_MEDIA_TYPE]);
    expect(offeredFormats(peer, ['text/markdown'])).toEqual([]);
    expect(offeredFormats(peer, undefined)).toEqual([]);
    expect(peerToolDescription(peer, ACCEPT)).toContain(
      'It can also give a Jupyter notebook',
    );
    expect(peerToolDescription(peer)).not.toContain('Jupyter notebook');
  });

  it('sends a button pressed on an answer with its action, in the message', async () => {
    const { fetch, seen } = accounting();
    const peer = await connectA2APeer({ url: URL, key: KEY, fetch });
    await askA2APeer(peer, 'Send them', {
      action: { name: 'Send them', payload: { does: 'send' } },
    });
    const [request] = seen.filter(entry => entry.method === 'POST');
    expect(request.body.params.message.metadata).toEqual({
      loop: { action: { name: 'Send them', payload: { does: 'send' } } },
    });
  });

  it('accepts a notebook, and is answered with one beside the words', async () => {
    const { fetch, seen } = accounting({ stream: NOTEBOOK_STREAM });
    const peer = await connectA2APeer({ url: URL, key: KEY, fetch });
    const events: A2APeerEvent[] = [];
    const { answer, artifacts } = await askA2APeer(peer, 'Open invoices?', {
      accept: ACCEPT,
      onEvent: event => events.push(event),
    });
    const [request] = seen.filter(entry => entry.method === 'POST');
    expect(request.body.params.configuration.acceptedOutputModes).toEqual(
      ACCEPT,
    );
    // The words are the answer; the notebook is not in them.
    expect(answer).toBe(REPORT);
    expect(artifacts).toHaveLength(1);
    const [notebook] = artifacts;
    expect(notebook).toMatchObject({
      mediaType: NOTEBOOK_MEDIA_TYPE,
      name: 'Open invoices',
      filename: 'open-invoices.ipynb',
    });
    const content = notebook.data as {
      nbformat: number;
      cells: { cell_type: string }[];
    };
    expect(content.nbformat).toBe(4);
    expect(content.cells.map(cell => cell.cell_type)).toEqual([
      'markdown',
      'code',
    ]);
    expect(events[0]).toEqual({
      phase: 'asked',
      request: 'Open invoices?',
      accept: ACCEPT,
    });
    // While it writes it, it says so in words.
    const notes = events
      .filter(event => event.phase === 'working')
      .map(event => (event.phase === 'working' ? event.note : undefined))
      .filter(Boolean);
    expect(notes).toContain('Writing a notebook…');
    expect(notes).toContain('Notebook written');
    expect(events.at(-1)).toMatchObject({
      phase: 'answered',
      answer: REPORT,
      artifacts: [{ mediaType: NOTEBOOK_MEDIA_TYPE }],
    });
  });

  it('the tool tells the model a notebook came, not its content', async () => {
    const { fetch, seen } = accounting({ stream: NOTEBOOK_STREAM });
    const peer = await connectA2APeer({ url: URL, key: KEY, fetch });
    const ask = a2aPeerTool({ peer, accept: ACCEPT });
    const result = await ask.execute!(
      {
        request: 'Open invoices, as a notebook',
        formats: [NOTEBOOK_MEDIA_TYPE],
      },
      { toolCallId: 'call-1', messages: [] },
    );
    expect(result).toEqual({
      answer: REPORT,
      attached: [
        {
          mediaType: NOTEBOOK_MEDIA_TYPE,
          name: 'Open invoices',
          shown: 'to the person, as it arrived',
        },
      ],
    });
    const [request] = seen.filter(entry => entry.method === 'POST');
    expect(request.body.params.configuration.acceptedOutputModes).toEqual([
      'text/markdown',
      NOTEBOOK_MEDIA_TYPE,
    ]);
  });

  it('the model may ask for words alone', async () => {
    const { fetch, seen } = accounting();
    const peer = await connectA2APeer({ url: URL, key: KEY, fetch });
    const ask = a2aPeerTool({ peer, accept: ACCEPT });
    await ask.execute!(
      { request: 'Open invoices?', formats: [] },
      { toolCallId: 'call-1', messages: [] },
    );
    const [request] = seen.filter(entry => entry.method === 'POST');
    expect(request.body.params.configuration.acceptedOutputModes).toEqual([
      'text/markdown',
    ]);
  });
});

describe('faceOfCard', () => {
  it('reads nothing from a card that carries no face', () => {
    const card = JSON.parse(CARD);
    card.capabilities.extensions = [];
    expect(faceOfCard(card)).toBeUndefined();
  });

  it('reads the avatar beside the emoji when the card names one', () => {
    const card = JSON.parse(CARD);
    card.capabilities.extensions = [
      {
        uri: 'https://datalayer.ai/extensions/face/v1',
        description: '',
        required: false,
        params: { emoji: '🧾', avatar: 'wizard' },
      },
    ];
    expect(faceOfCard(card)).toEqual({ emoji: '🧾', avatar: 'wizard' });
  });
});
