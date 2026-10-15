/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Protocol displays from the stream (MOBILE M-037): the PAP SDK's displays as
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
  protocolDisplayOf,
  reduceConversation,
  replyAuthor,
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
  revision: 2,
  does: 'buy',
  session: { ref: '0123456789ab', signed_in: true },
  expires_at: '2026-10-15T18:00:00Z',
  was: { revision: 1, terms: { amount: { value: 3000, currency: 'EUR' } } },
  only_the_person: true,
};

describe('protocol displays (M-037)', () => {
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
      revision: 2,
      onlyThePerson: true,
      signedIn: true,
      was: { revision: 1 },
    });
    expect(displayLine(shown!)).toBe(
      'shop.example asks you to confirm: Return order 7 for a refund of 40 EUR (version 2)',
    );
    // Fails closed: a later "was", an unknown class, no terms, an id that names no approval.
    for (const data of [
      { ...CONFIRM, was: { revision: 3 } },
      { ...CONFIRM, does: 'teleport' },
      { ...CONFIRM, terms: 'x' },
    ]) {
      expect(
        protocolDisplayOf(wire('confirm', data, 'a-confirm')),
      ).toMatchObject({ kind: 'unknown', text: 'What a model reads.' });
    }
    expect(protocolDisplayOf(wire('confirm', CONFIRM, 'no-suffix'))!.kind).toBe(
      'unknown',
    );
  });

  it('reads outcomes, final only with the company’s words', () => {
    const base = {
      company: 'shop.example',
      summary: 'Return order 7',
      operation_ref: 'op-7',
      revision: 2,
    };
    expect(
      displayLine(
        protocolDisplayOf(
          wire('outcome', {
            ...base,
            state: 'succeeded',
            result: 'Refund sent.',
            approved_by: 'user',
          }),
        )!,
      ),
    ).toBe('Done at shop.example: Refund sent.');
    expect(
      protocolDisplayOf(wire('outcome', { ...base, state: 'in_progress' })),
    ).toMatchObject({ kind: 'outcome', state: 'in_progress' });
    expect(
      protocolDisplayOf(wire('outcome', { ...base, state: 'failed' }))!.kind,
    ).toBe('unknown');
    expect(
      protocolDisplayOf(
        wire('outcome', { ...base, state: 'in_progress', result: 'early' }),
      )!.kind,
    ).toBe('unknown');
  });

  it('reads replies with who wrote each one, and who answers now', () => {
    const replies = protocolDisplayOf(
      wire('replies', {
        company: 'shop.example',
        conversation: 'conv_1',
        status: 'queued',
        responder: 'human',
        replies: [
          { sender: 'agent', text: 'A person will take over.' },
          { sender: 'human', text: 'Hello, I am Sam.' },
        ],
      }),
    );
    expect(replies).toMatchObject({
      kind: 'replies',
      status: 'queued',
      responder: 'human',
    });
    expect(replyAuthor('shop.example', 'human')).toBe(
      'shop.example, one of its people',
    );
    expect(
      protocolDisplayOf(
        wire('replies', {
          company: 'shop.example',
          conversation: 'conv 1',
          replies: [{ sender: 'agent', text: 'x' }],
        }),
      )!.kind,
    ).toBe('unknown');
    expect(
      protocolDisplayOf(
        wire('replies', {
          company: 'shop.example',
          conversation: 'c',
          replies: [{ sender: 'robot', text: 'x' }],
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
});
