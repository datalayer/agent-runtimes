/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An anonymous visitor's conversation (the user, 15 November 2026): its
 * turns as the browser counts them, why none is left, where Sign in goes,
 * and which tool results say an account is needed.
 */

import { describe, expect, it } from 'vitest';
import {
  ANONYMOUS_MINUTES,
  ANONYMOUS_WORDS,
  VISITOR_TURNS_KEY,
  anonymousRefusal,
  dayOf,
  isAuthRefusal,
  maxTurnsOf,
  readTurns,
  signInTarget,
  takeTurn,
  turnsLeft,
  turnsToday,
  writeTurns,
} from '../anonymousMode';

const NOON = Date.parse('2026-11-15T12:00:00Z');

describe('the turns a visitor has', () => {
  it('takes maxTurns as a whole number above none, else no limit', () => {
    expect(maxTurnsOf(10)).toBe(10);
    expect(maxTurnsOf('10')).toBe(10);
    expect(maxTurnsOf(0)).toBeUndefined();
    expect(maxTurnsOf(2.5)).toBeUndefined();
    expect(maxTurnsOf(undefined)).toBeUndefined();
  });

  it('counts today in UTC, and starts again another day', () => {
    expect(dayOf(NOON)).toBe('2026-11-15');
    expect(turnsToday({ day: '2026-11-15', taken: 3 }, NOON)).toBe(3);
    expect(turnsToday({ day: '2026-11-14', taken: 9 }, NOON)).toBe(0);
    expect(turnsToday('nonsense', NOON)).toBe(0);
    expect(takeTurn({ day: '2026-11-14', taken: 9 }, NOON)).toEqual({
      day: '2026-11-15',
      taken: 1,
    });
    expect(takeTurn({ day: '2026-11-15', taken: 4 }, NOON).taken).toBe(5);
    expect(turnsLeft(12, 10)).toBe(0);
  });

  it('keeps the count under the landing’s key', () => {
    const kept = new Map<string, string>();
    const storage = {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => void kept.set(key, value),
    };
    writeTurns(storage, { day: '2026-11-15', taken: 2 });
    expect(VISITOR_TURNS_KEY).toBe('datalayer-loop-visitor-turns');
    expect(readTurns(storage)).toEqual({ day: '2026-11-15', taken: 2 });
    expect(readTurns(undefined)).toBeNull();
  });

  it('says why no turn is left: the minutes first, then the day’s turns', () => {
    expect(
      anonymousRefusal({ taken: 3, maxTurns: 10, startedAt: null, now: NOON }),
    ).toBe('');
    expect(
      anonymousRefusal({ taken: 10, maxTurns: 10, startedAt: null, now: NOON }),
    ).toBe(ANONYMOUS_WORDS.turnsTaken(10));
    // No maxTurns: the chat enforces no limit of its own.
    expect(anonymousRefusal({ taken: 99, startedAt: null, now: NOON })).toBe(
      '',
    );
    expect(
      anonymousRefusal({
        taken: 1,
        maxTurns: 10,
        startedAt: NOON - ANONYMOUS_MINUTES * 60_000,
        now: NOON,
      }),
    ).toBe(ANONYMOUS_WORDS.minutesSpent());
  });

  it('says the box in the user’s words', () => {
    expect(ANONYMOUS_WORDS.preview).toBe(
      'Limited preview: sign in to save your work.',
    );
    expect(ANONYMOUS_WORDS.turnsLeft(10, 10)).toBe(
      '10 of 10 turns left today.',
    );
    expect(ANONYMOUS_WORDS.someDisabled).toBe('Some features are disabled.');
    expect(ANONYMOUS_WORDS.anonymous).toBe('Anonymous');
  });
});

describe('Sign in', () => {
  it('goes where the host says, else to Datalayer’s sign-in page and back', () => {
    expect(signInTarget('https://example.com/login', 'https://x.io/a')).toBe(
      'https://example.com/login',
    );
    expect(signInTarget(undefined, 'https://x.io/a?b=1')).toBe(
      'https://datalayer.ai/signin?post_auth_redirect=https%3A%2F%2Fx.io%2Fa%3Fb%3D1',
    );
  });
});

describe('a tool refused for want of an account', () => {
  it('is a 401 or 403, or the runtime’s own sign-in refusal', () => {
    expect(
      isAuthRefusal({ status: 'error', error: 'HTTP 401 Unauthorized' }),
    ).toBe(true);
    expect(
      isAuthRefusal({ status: 'error', executionError: '403 Forbidden' }),
    ).toBe(true);
    expect(
      isAuthRefusal({ status: 'error', error: 'This tool requires sign-in.' }),
    ).toBe(true);
    expect(
      isAuthRefusal({ status: 'complete', result: { status_code: 401 } }),
    ).toBe(true);
    expect(
      isAuthRefusal({
        status: 'complete',
        result:
          'Without an account it only reads: `post_to_x` would do more than read, so it asked nobody and did nothing.',
      }),
    ).toBe(true);
  });

  it('is not any other failure, nor a number in a result', () => {
    expect(
      isAuthRefusal({ status: 'error', error: 'Timed out after 30 s' }),
    ).toBe(false);
    expect(
      isAuthRefusal({ status: 'complete', result: 'Room 401 is booked' }),
    ).toBe(false);
    expect(isAuthRefusal({ status: 'executing' })).toBe(false);
  });
});
