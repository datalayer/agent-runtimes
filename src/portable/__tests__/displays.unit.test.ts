/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Protocol displays from the stream: the PAP SDK's displays as
 * the runtime sends them beside a tool's result, read strictly; anything
 * that does not read is `unknown` with its text — never a partial card.
 *
 * @module portable/__tests__/displays
 */

import { describe, expect, it } from 'vitest';
import {
  displayLine,
  displayOfToolResult,
  emptyConversation,
  languageOf,
  protocolDisplayOf,
  reduceConversation,
  replyAuthor,
  shieldDisplayFixtures,
  unifiedDiffLines,
  unifiedDiffText,
  type AgUiEvent,
} from '..';

const wire = (type: string, data: Record<string, unknown>, id = 'd-1') => ({
  type: `application/vnd.datalayer.pap.${type}+json`,
  version: 1,
  id,
  text: 'What a model reads.',
  data,
  actions: [],
});

const CONFIRM = {
  company: 'shop.example',
  summary: 'Return order 7 for a refund of 40 EUR',
  terms: { amount: { value: 4000, currency: 'EUR' } },
  operation_ref: 'op-7',
  revision: 'rev_b',
  does: 'buy',
  session: { ref: '0123456789ab', signed_in: true },
  expires_at: '2026-10-15T18:00:00Z',
  differences: ['amount.value'],
  was: {
    revision: 'rev_a',
    terms: { amount: { value: 3000, currency: 'EUR' } },
  },
};

describe('protocol displays', () => {
  it('reads Direct, Device and Mediated sign-ins, https only', () => {
    const device = protocolDisplayOf(
      wire('sign-in', {
        mode: 'device',
        open: 'https://shop.example/device',
        code: 'AB-12',
        expires_at: '2026-10-15T10:00:00Z',
        needs: ['orders:read', 'bad scope'],
      }),
    );
    expect(device).toMatchObject({
      kind: 'sign-in',
      mode: 'device',
      host: 'shop.example',
      code: 'AB-12',
      needs: ['orders:read'],
    });
    expect(
      protocolDisplayOf(
        wire('sign-in', {
          mode: 'direct',
          open: 'https://datalayer.ai/pap/start/x',
          company: 'shop.example',
        }),
      ),
    ).toMatchObject({
      kind: 'sign-in',
      mode: 'direct',
      company: 'shop.example',
    });
    expect(
      protocolDisplayOf(
        wire('sign-in', {
          mode: 'mediated',
          open: 'https://datalayer.ai/pap/typed/x',
          sent_to: 'a***@x',
        }),
      ),
    ).toMatchObject({ kind: 'sign-in', mode: 'mediated', sentTo: 'a***@x' });
    expect(
      protocolDisplayOf(
        wire('sign-in', { mode: 'direct', open: 'http://shop.example' }),
      ),
    ).toMatchObject({ kind: 'sign-in-refused' });
    // A business's sign-in over PACT, as a plain answer.
    expect(
      displayOfToolResult(
        'gateway_pact_sign_in',
        {
          status: 'waiting_for_the_person',
          mode: 'device',
          open: 'https://brand.example/d',
          code: 'Q',
        },
        't-1',
      ),
    ).toMatchObject({ kind: 'sign-in', id: 't-1', host: 'brand.example' });
  });

  it('reads an operation to confirm, a purchase included, and names the approval it stands for', () => {
    const shown = protocolDisplayOf(wire('confirm', CONFIRM, 'appr-9-confirm'));
    expect(shown).toMatchObject({
      kind: 'confirm',
      approvalId: 'appr-9',
      does: 'buy',
      revision: 'rev_b',
      differences: ['amount.value'],
      signedIn: true,
      was: { revision: 'rev_a' },
    });
    expect(displayLine(shown!)).toBe(
      'shop.example asks you to approve: Return order 7 for a refund of 40 EUR (revision rev_b)',
    );
    // Fails closed: a "was" of the same revision, an unknown class, no terms, no
    // expiry, an integer revision, an id that names no approval.
    for (const data of [
      { ...CONFIRM, was: { revision: 'rev_b' } },
      { ...CONFIRM, does: 'teleport' },
      { ...CONFIRM, terms: 'x' },
      { ...CONFIRM, expires_at: '' },
      { ...CONFIRM, differences: undefined },
      { ...CONFIRM, revision: 2 },
    ]) {
      expect(
        protocolDisplayOf(wire('confirm', data, 'a-confirm')),
      ).toMatchObject({ kind: 'unknown', text: 'What a model reads.' });
    }
    expect(protocolDisplayOf(wire('confirm', CONFIRM, 'no-suffix'))!.kind).toBe(
      'unknown',
    );
  });

  it('reads no outcome: an answer to pap_confirm carries no display', () => {
    expect(
      protocolDisplayOf(
        wire('outcome', {
          company: 'shop.example',
          summary: 'Return order 7',
          state: 'succeeded',
          result: 'Refund sent.',
        }),
      ),
    ).toMatchObject({ kind: 'unknown', text: 'What a model reads.' });
  });

  it('reads replies with who wrote each one, and who answers now', () => {
    const replies = protocolDisplayOf(
      wire('replies', {
        company: 'shop.example',
        conversation: 'conv_1',
        status: 'queued',
        responder: 'human',
        replies: [
          { author: 'agent', text: 'A person will take over.' },
          { author: 'human', name: 'Sam', text: 'Hello, I am Sam.' },
        ],
      }),
    );
    expect(replies).toMatchObject({
      kind: 'replies',
      status: 'queued',
      responder: 'human',
      replies: [
        { author: 'agent', name: null, text: 'A person will take over.' },
        { author: 'human', name: 'Sam', text: 'Hello, I am Sam.' },
      ],
    });
    expect(replyAuthor('shop.example', 'human')).toBe(
      'shop.example, one of its people',
    );
    expect(replyAuthor('shop.example', 'human', 'Sam')).toBe(
      'shop.example, one of its people (Sam)',
    );
    // PAP draft 0.2's `sender` is not read (draft 0.3: `author`).
    expect(
      protocolDisplayOf(
        wire('replies', {
          company: 'shop.example',
          conversation: 'c',
          replies: [{ sender: 'agent', text: 'x' }],
        }),
      )!.kind,
    ).toBe('unknown');
    expect(
      protocolDisplayOf(
        wire('replies', {
          company: 'shop.example',
          conversation: 'conv 1',
          replies: [{ author: 'agent', text: 'x' }],
        }),
      )!.kind,
    ).toBe('unknown');
    expect(
      protocolDisplayOf(
        wire('replies', {
          company: 'shop.example',
          conversation: 'c',
          replies: [{ author: 'robot', text: 'x' }],
        }),
      )!.kind,
    ).toBe('unknown');
  });

  it('reads a handoff, and keeps an unknown display diagnosable and safe', () => {
    expect(
      displayOfToolResult(
        'pap_handoff',
        { status: 'queued', responder: 'human' },
        't-2',
      ),
    ).toMatchObject({ kind: 'handoff', handed: true, responder: 'human' });
    expect(
      displayOfToolResult('pap_handoff', { status: 'closed', note: 'Closed.' }),
    ).toMatchObject({ handed: false });
    const odd = protocolDisplayOf({
      type: 'application/vnd.example.chart+json',
      version: 3,
      id: 'x',
      text: 'A chart.',
      data: { script: '<script>' },
    });
    expect(odd).toEqual({
      kind: 'unknown',
      id: 'x',
      type: 'application/vnd.example.chart+json',
      version: 3,
      text: 'A chart.',
    });
    expect(displayOfToolResult('search', { hits: 3 })).toBeNull();
  });

  it('comes from the stream: the reducer keeps the display on its tool row, and the model’s words without it', () => {
    const events: AgUiEvent[] = [
      { type: 'RUN_STARTED' },
      {
        type: 'TOOL_CALL_START',
        toolCallId: 't1',
        toolCallName: 'pap_confirm',
      },
      {
        type: 'TOOL_CALL_RESULT',
        toolCallId: 't1',
        content: JSON.stringify({
          status: 'waiting_for_the_person',
          _meta: {
            'reactor.ui/display': wire('confirm', CONFIRM, 'appr-9-confirm'),
          },
        }),
      },
      { type: 'RUN_FINISHED' },
    ];
    const state = events.reduce(reduceConversation, emptyConversation());
    const [tool] = state.items;
    expect(tool).toMatchObject({
      kind: 'tool',
      display: { kind: 'confirm', approvalId: 'appr-9' },
    });
    expect(tool.kind === 'tool' && tool.result).not.toContain(
      'reactor.ui/display',
    );
  });

  it('reads a coding agent’s diff and draws it as a unified diff in the file’s language', () => {
    const { diff } = shieldDisplayFixtures();
    const read = protocolDisplayOf(diff);
    expect(read).toEqual({
      kind: 'diff',
      id: 'c1-diff',
      path: 'hello.py',
      oldText: 'print("hi")\n',
      newText: 'def hello():\n    print("hi, shield")\n',
      language: 'python',
    });
    if (!read || read.kind !== 'diff') throw new Error('not a diff');
    expect(displayLine(read)).toBe('Changed hello.py (+2 −1 lines)');
    expect(unifiedDiffLines(read.oldText, read.newText)).toEqual([
      { kind: 'remove', text: 'print("hi")' },
      { kind: 'add', text: 'def hello():' },
      { kind: 'add', text: '    print("hi, shield")' },
    ]);
    expect(unifiedDiffText(read)).toBe(
      '--- a/hello.py\n+++ b/hello.py\n-print("hi")\n+def hello():\n+    print("hi, shield")',
    );
    // A new file: from /dev/null, every line added; the language from the path when unsaid.
    const written = protocolDisplayOf({
      ...diff,
      data: { path: 'src/x.tsx', old_text: null, new_text: 'a\nb\n' },
    });
    if (!written || written.kind !== 'diff') throw new Error('not a diff');
    expect(written.language).toBe('tsx');
    expect(displayLine(written)).toBe('Wrote src/x.tsx (2 lines)');
    expect(unifiedDiffText(written)).toBe(
      '--- /dev/null\n+++ b/src/x.tsx\n+a\n+b',
    );
    // Kept lines stay context; a change in the middle is one remove and one add.
    expect(unifiedDiffLines('a\nb\nc\n', 'a\nB\nc\n')).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'remove', text: 'b' },
      { kind: 'add', text: 'B' },
      { kind: 'context', text: 'c' },
    ]);
    expect(languageOf('Dockerfile')).toBe('dockerfile');
    expect(languageOf('notes')).toBe('text');
    // What does not read is unknown, never a partial card.
    expect(protocolDisplayOf({ ...diff, data: { path: 'x' } })).toMatchObject({
      kind: 'unknown',
    });
    expect(
      protocolDisplayOf({ ...diff, data: { path: '', new_text: 'x' } }),
    ).toMatchObject({ kind: 'unknown' });
  });

  it('reads a coding agent’s terminal with the output kept after release', () => {
    const { terminal } = shieldDisplayFixtures();
    const read = protocolDisplayOf(terminal);
    expect(read).toEqual({
      kind: 'terminal',
      id: 'c3-terminal',
      terminalId: 'term_1',
      command: 'pytest -q',
      output: '3 passed in 0.12s\n',
      exitCode: 0,
      released: true,
    });
    if (!read || read.kind !== 'terminal') throw new Error('not a terminal');
    expect(displayLine(read)).toBe('Ran `pytest -q`: exit 0');
    const running = protocolDisplayOf({
      ...terminal,
      data: { terminal_id: 'term_2' },
    });
    expect(running).toMatchObject({
      kind: 'terminal',
      command: '',
      exitCode: null,
      released: false,
    });
    if (!running || running.kind !== 'terminal')
      throw new Error('not a terminal');
    expect(displayLine(running)).toBe('Terminal term_2: running');
    expect(
      protocolDisplayOf({
        ...terminal,
        data: { terminal_id: 't', exit_code: 'zero' },
      }),
    ).toMatchObject({ kind: 'unknown' });
    expect(protocolDisplayOf({ ...terminal, data: {} })).toMatchObject({
      kind: 'unknown',
    });
  });

  it('keeps a coding agent’s diff on its tool row from the stream', () => {
    const { diff } = shieldDisplayFixtures();
    const events: AgUiEvent[] = [
      { type: 'RUN_STARTED' },
      {
        type: 'TOOL_CALL_START',
        toolCallId: 'c1',
        toolCallName: 'Edit hello.py',
      },
      {
        type: 'TOOL_CALL_RESULT',
        toolCallId: 'c1',
        content: JSON.stringify({
          result: null,
          status: 'completed',
          display: [{ display: 'diff', path: 'hello.py' }],
          _meta: { 'reactor.ui/display': diff },
        }),
      },
      { type: 'RUN_FINISHED' },
    ];
    const state = events.reduce(reduceConversation, emptyConversation());
    const [tool] = state.items;
    expect(tool).toMatchObject({
      kind: 'tool',
      display: { kind: 'diff', path: 'hello.py', language: 'python' },
    });
  });
});
