/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The current turn, as the chat keeps it for whoever shows a conversation
 * without the transcript.
 *
 * What is pinned: a new message replaces the previous turn entirely (that is
 * what "cleared on each turn" means), the reply moves the turn to streaming
 * as it arrives, ending settles the status, nothing happens while idle, and
 * an identical reply does not produce a new snapshot for readers to re-render
 * on.
 */

import { describe, expect, it } from 'vitest';
import {
  createTurnFeed,
  feedWriters,
  turnWritersOf,
} from '../plugins/chat/turnState';

describe('the turn feed', () => {
  it('starts idle and ignores replies and endings until a turn begins', () => {
    const feed = createTurnFeed();
    expect(feed.turn.value.status).toBe('idle');
    feed.assistant('hello');
    feed.end('done');
    expect(feed.turn.value).toEqual({ id: 0, status: 'idle' });
  });

  it('keeps the window figures while idle and carries them into a new turn', () => {
    const feed = createTurnFeed();
    const snapshot = { totalTokens: 1200, contextWindow: 200_000 } as never;
    // Reported once at mount, before anyone has typed.
    feed.usage(snapshot);
    expect(feed.turn.value.status).toBe('idle');
    expect(feed.turn.value.usage).toBe(snapshot);
    // The first turn starts with those figures rather than none.
    feed.begin('hi');
    expect(feed.turn.value.usage).toBe(snapshot);
    // An identical snapshot publishes nothing new.
    const before = feed.turn.value;
    feed.usage(snapshot);
    expect(feed.turn.value).toBe(before);
  });

  it('a new message is a new turn, and the old one is gone', () => {
    const feed = createTurnFeed();
    feed.begin('Analyze the dataset');
    feed.assistant('Looking at the frame…');
    feed.end('done');
    const first = feed.turn.value;
    expect(first).toMatchObject({
      id: 1,
      user: 'Analyze the dataset',
      assistant: 'Looking at the frame…',
      status: 'done',
    });

    feed.begin('Find what is wrong');
    expect(feed.turn.value).toEqual({
      id: 2,
      user: 'Find what is wrong',
      status: 'thinking',
    });
    // Nothing of the previous reply survives into the new turn.
    expect(feed.turn.value.assistant).toBeUndefined();
  });

  it('streams: the first text moves the turn from thinking to streaming', () => {
    const feed = createTurnFeed();
    feed.begin('hi');
    expect(feed.turn.value.status).toBe('thinking');
    feed.assistant('');
    expect(feed.turn.value.status).toBe('thinking');
    feed.assistant('Hel');
    expect(feed.turn.value.status).toBe('streaming');
    feed.assistant('Hello there');
    expect(feed.turn.value.assistant).toBe('Hello there');
  });

  it('does not publish a new snapshot for an identical reply', () => {
    const feed = createTurnFeed();
    feed.begin('hi');
    feed.assistant('same');
    const before = feed.turn.value;
    feed.assistant('same');
    expect(feed.turn.value).toBe(before);
  });

  it('ending settles the status and a late reply keeps it settled', () => {
    const feed = createTurnFeed();
    feed.begin('hi');
    feed.assistant('partial');
    feed.end('error');
    expect(feed.turn.value.status).toBe('error');
    feed.assistant('partial and more');
    expect(feed.turn.value.status).toBe('error');
    expect(feed.turn.value.assistant).toBe('partial and more');
  });

  it('carries its writers on the contribution without naming them in the type', () => {
    const feed = createTurnFeed();
    const contributed = {
      id: 'chat-turn',
      turn: feed.turn,
      ...feedWriters(feed),
    };
    expect(turnWritersOf(contributed)).toBe(feed);
    expect(turnWritersOf({ id: 'x', turn: feed.turn })).toBeUndefined();
    expect(turnWritersOf(undefined)).toBeUndefined();
    // The public shape stays a plain id + signal for readers.
    expect(Object.keys(contributed)).toEqual(['id', 'turn']);
  });
});
