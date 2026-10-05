/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating assistant (LOOP T-21, T-22, T-25): what its character acts
 * out, and the characters Datalayer ships.
 */

import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_CHARACTERS,
  DEFAULT_ASSISTANT_CHARACTER,
  assistantCharacter,
} from '../assistant/characters';
import {
  ASSISTANT_AWAY_KEY,
  POINTER_ROOM,
  SAYING_LIMIT,
  boxesMeet,
  pointerNear,
  keepAway,
  keptAway,
  assistantStateOf,
  latestSaying,
  newestIsAnswer,
} from '../assistant/state';
import { presenceToolOf } from '../presence/presenceStatus';

describe('what the assistant acts out', () => {
  it('is the presence of what answers, at rest and at work', () => {
    expect(assistantStateOf('idle')).toBe('idle');
    expect(assistantStateOf('thinking')).toBe('thinking');
    expect(assistantStateOf('working')).toBe('working');
    expect(assistantStateOf('waiting')).toBe('waiting');
  });

  it('greets when it arrives and says goodbye when sent away', () => {
    expect(assistantStateOf('idle', { arriving: true })).toBe('greeting');
    expect(assistantStateOf('working', { leaving: true })).toBe('goodbye');
    expect(assistantStateOf('idle', { arriving: true, leaving: true })).toBe(
      'goodbye',
    );
  });

  it('dozes while paused: it neither greets nor speaks, and still leaves', () => {
    expect(assistantStateOf('paused')).toBe('paused');
    expect(assistantStateOf('paused', { arriving: true })).toBe('paused');
    expect(assistantStateOf('paused', { speaking: true })).toBe('paused');
    expect(assistantStateOf('paused', { leaving: true })).toBe('goodbye');
  });

  it('speaks while words arrive, but never over a person it waits for', () => {
    expect(assistantStateOf('thinking', { speaking: true })).toBe('speaking');
    expect(assistantStateOf('idle', { speaking: true })).toBe('idle');
    expect(assistantStateOf('waiting', { speaking: true })).toBe('waiting');
  });

  it('reads the newest item: an answer being written, or a tool call', () => {
    expect(newestIsAnswer([])).toBe(false);
    expect(newestIsAnswer([{ role: 'user' }, { role: 'assistant' }])).toBe(
      true,
    );
    expect(
      newestIsAnswer([
        { role: 'assistant', toolName: 'search', toolCallId: 'c1' },
      ]),
    ).toBe(false);
  });

  it('reads the newest tool call the presence line reads', () => {
    expect(presenceToolOf([])).toEqual({ open: false, pendingApproval: false });
    expect(
      presenceToolOf([
        { toolName: 'search', toolCallId: 'c1', status: 'executing' },
      ]),
    ).toEqual({
      open: true,
      pendingApproval: false,
    });
    expect(
      presenceToolOf([
        {
          toolName: 'send',
          toolCallId: 'c2',
          status: 'inProgress',
          result: { pending_approval: true },
        },
      ]),
    ).toEqual({ open: true, pendingApproval: true });
    expect(
      presenceToolOf([
        { toolName: 'search', toolCallId: 'c1', status: 'complete' },
        { role: 'assistant' },
      ]),
    ).toEqual({
      open: false,
      pendingApproval: false,
    });
  });
});

describe('the characters Datalayer ships (T-25)', () => {
  it('are four of its own, a paper clip first', () => {
    expect(ASSISTANT_CHARACTERS.map(character => character.id)).toEqual([
      'paperclip',
      'wizard',
      'cat',
      'eyes',
    ]);
    expect(DEFAULT_ASSISTANT_CHARACTER).toBe('paperclip');
  });

  it('refuse a character that is not there, saying which are', () => {
    expect(() => assistantCharacter('clippy')).toThrow(
      'There is no assistant character "clippy"; the characters are paperclip, wizard, cat, eyes.',
    );
  });
});

describe('what the assistant says in its balloon (T-23)', () => {
  it('is the newest message of the agent, in plain words', () => {
    expect(latestSaying([])).toBeUndefined();
    expect(
      latestSaying([
        { id: 'a1', role: 'assistant', content: 'Hello.' },
        { id: 'u1', role: 'user', content: 'Capital of Belgium?' },
        {
          id: 'a2',
          role: 'assistant',
          content: '**Brussels** — see [the atlas](https://example.org).',
        },
      ]),
    ).toEqual({ id: 'a2', text: 'Brussels — see the atlas.', more: false });
  });

  it('skips the person, the tool calls and empty messages', () => {
    expect(
      latestSaying([
        {
          id: 'a1',
          role: 'assistant',
          content: [{ type: 'text', text: 'Searching the web.' }],
        },
        { id: 't1', role: 'assistant', toolName: 'search', toolCallId: 'c1' },
        { id: 'a2', role: 'assistant', content: '' },
        { id: 'u1', role: 'user', content: 'thanks' },
      ]),
    ).toEqual({ id: 'a1', text: 'Searching the web.', more: false });
  });

  it('cuts a long message at a word, and says there is more', () => {
    const long = 'word '.repeat(80);
    const saying = latestSaying([
      { id: 'a1', role: 'assistant', content: long },
    ]);
    expect(saying?.more).toBe(true);
    expect(saying!.text.length).toBeLessThanOrEqual(SAYING_LIMIT + 1);
    expect(saying!.text.endsWith('word…')).toBe(true);
  });
});

describe('how long the assistant is sent away for (T-27)', () => {
  it('keeps the session and for good apart, and forgets on a call back', () => {
    keepAway('session');
    expect(keptAway()).toBe('session');
    expect(window.localStorage.getItem(ASSISTANT_AWAY_KEY)).toBeNull();
    keepAway('always');
    expect(keptAway()).toBe('always');
    expect(window.sessionStorage.getItem(ASSISTANT_AWAY_KEY)).toBeNull();
    keepAway('page');
    expect(keptAway()).toBe('none');
    keepAway('none');
    expect(keptAway()).toBe('none');
  });
});

describe('what the assistant keeps clear of (T-27)', () => {
  const stage = { left: 100, top: 100, right: 188, bottom: 188 };

  it('meets a box that shares any area with it, not one that only touches it', () => {
    expect(
      boxesMeet(stage, { left: 150, top: 0, right: 300, bottom: 120 }),
    ).toBe(true);
    expect(
      boxesMeet(stage, { left: 188, top: 100, right: 300, bottom: 188 }),
    ).toBe(false);
    expect(
      boxesMeet(stage, { left: 190, top: 100, right: 300, bottom: 188 }, 4),
    ).toBe(true);
  });

  it('counts the pointer as near over it and within its room beside it', () => {
    expect(pointerNear(stage, { x: 140, y: 140 })).toBe(true);
    expect(pointerNear(stage, { x: 100 - POINTER_ROOM + 1, y: 140 })).toBe(
      true,
    );
    expect(pointerNear(stage, { x: 100 - POINTER_ROOM - 1, y: 140 })).toBe(
      false,
    );
  });
});
