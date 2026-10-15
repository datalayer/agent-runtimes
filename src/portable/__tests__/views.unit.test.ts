/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The conversation's component contract (MOBILE M-030, M-032): presence read
 * from a conversation, and what each row and the message box say, over the
 * fixture every renderer is tested against.
 *
 * @module portable/__tests__/views
 */

import { describe, expect, it } from 'vitest';
import {
  composerOf,
  conversationFixture,
  droppedWords,
  ENDED_WORDS,
  messageLabel,
  presenceLine,
  presenceOfConversation,
  presenceState,
  showsQuestion,
  stepLine,
  toolLabel,
  type ConversationItem,
} from '..';
import {
  PRESENCE_LINES as WEB_LINES,
  presenceState as webPresenceState,
} from '../../chat/presence/presenceStatus';

const rows = conversationFixture().items;
const of = <K extends ConversationItem['kind']>(kind: K) =>
  rows.filter(
    (item): item is Extract<ConversationItem, { kind: K }> =>
      item.kind === kind,
  );

describe('presence (M-030)', () => {
  it('is one with the web chat', () => {
    expect(webPresenceState).toBe(presenceState);
    expect(presenceLine({ state: 'waiting' })).toBe(WEB_LINES.waiting);
  });

  it('reads a conversation: paused wins, a question or an approval waits, an open tool works', () => {
    const fixture = conversationFixture();
    expect(presenceOfConversation(fixture)).toBe('waiting');
    expect(presenceOfConversation(fixture, true)).toBe('paused');
    expect(presenceOfConversation({ ...fixture, asking: null })).toBe('idle');
    expect(
      presenceOfConversation({ ...fixture, asking: null, running: true }),
    ).toBe('thinking');
    const working = {
      ...fixture,
      asking: null,
      running: true,
      items: [
        ...fixture.items,
        {
          kind: 'tool' as const,
          id: 't-9',
          name: 'x',
          args: '',
          input: null,
          status: 'running' as const,
          awaiting: null,
          result: '',
          value: undefined,
          error: '',
          executionError: '',
          codeError: null,
          exitCode: null,
          display: null,
        },
      ],
    };
    expect(presenceOfConversation(working)).toBe('working');
    // A stopped turn can leave a tool open: not working then.
    expect(presenceOfConversation({ ...working, running: false })).toBe('idle');
  });
});

describe('rows (M-032)', () => {
  it('say each row the same way on every renderer', () => {
    expect(of('message').map(messageLabel)).toEqual([
      'You: Where is order 7?',
      'Answer: It **shipped** on Monday.',
    ]);
    expect(of('tool').map(toolLabel)).toEqual([
      'Tool lookup_order, done',
      'Tool send_mail, failed',
    ]);
    expect(of('step').map(stepLine)).toEqual(['✓ Check the carrier']);
    expect(of('end')[0].words).toBe('Stopped');
    expect(droppedWords(3)).toBe('3 earlier rows are not kept on this device.');
    expect(droppedWords(1)).toBe('1 earlier row is not kept on this device.');
    expect(droppedWords(0)).toBe('');
  });

  it('let the person type only when something can be sent', () => {
    const fixture = conversationFixture();
    const base = {
      state: fixture,
      opening: false,
      ended: false,
      placeholder: 'Message Desk',
    };
    expect(composerOf(base)).toEqual({
      blocked: '',
      canType: true,
      running: false,
      placeholder: 'Message Desk',
    });
    expect(showsQuestion(fixture)).toBe(true);
    expect(composerOf({ ...base, ended: true })).toMatchObject({
      blocked: ENDED_WORDS,
      canType: false,
    });
    expect(composerOf({ ...base, closed: 'Desk is paused.' })).toMatchObject({
      blocked: 'Desk is paused.',
      canType: false,
    });
    expect(composerOf({ ...base, opening: true }).canType).toBe(false);
    // A turn streaming: Stop, nothing typed, no question card.
    expect(composerOf({ ...base, running: true })).toMatchObject({
      canType: false,
      running: true,
    });
    expect(showsQuestion(fixture, true)).toBe(false);
    // A text question puts its prompt in the box; a form or a file is answered elsewhere.
    const asking = (kind: 'text' | 'form' | 'file') => ({
      ...fixture.asking!,
      kind,
      prompt: 'Which order?',
    });
    expect(
      composerOf({ ...base, state: { ...fixture, asking: asking('text') } })
        .placeholder,
    ).toBe('Which order?');
    expect(
      composerOf({ ...base, state: { ...fixture, asking: asking('form') } })
        .canType,
    ).toBe(false);
    expect(
      composerOf({ ...base, state: { ...fixture, asking: asking('file') } })
        .canType,
    ).toBe(false);
  });
});
