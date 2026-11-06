/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** The referee, on records: first done, the clock ending a race, the score, the measure, the ties. */

import { describe, expect, it } from 'vitest';
import { getBattle } from '../../specs/battles';
import {
  clockEnded,
  ruleEnds,
  secondsLeft,
  startRecord,
  verdictOf,
  type BattleRecord,
} from '../verdict';

const T0 = 1_700_000_000_000;
const race = getBattle('invoice-race')!;
const game = getBattle('pong')!;
const challenge = getBattle('report-challenge')!;

const done = (
  record: BattleRecord,
  id: string,
  seconds: number,
  more: Record<string, unknown> = {},
): BattleRecord => ({
  ...record,
  contestants: record.contestants.map(c =>
    c.id === id ? { ...c, doneAt: T0 + seconds * 1000, ...more } : c,
  ),
});
const ended = (record: BattleRecord, seconds: number): BattleRecord => ({
  ...record,
  endedAt: T0 + seconds * 1000,
});

describe('a race', () => {
  it('goes to the contestant done first, within the clock', () => {
    const record = ended(
      done(done(startRecord(race, T0), 'red', 41.2), 'blue', 58),
      58,
    );
    const verdict = verdictOf(race, record);
    expect(verdict).toMatchObject({ outcome: 'won', winner: 'red' });
    expect(verdict.why).toBe('Red was done first, in 41.2 seconds.');
    expect(verdict.standings.map(s => s.id)).toEqual(['red', 'blue']);
  });

  it('is a draw when the clock ends first, and unfinished before', () => {
    const running = startRecord(race, T0);
    expect(verdictOf(race, running)).toMatchObject({ outcome: 'unfinished' });
    expect(verdictOf(race, ended(running, 120))).toMatchObject({
      outcome: 'draw',
      why: 'The clock ended first: nobody was done within 120 seconds.',
    });
    // Done after the clock does not count.
    expect(
      verdictOf(race, ended(done(running, 'blue', 130), 120)),
    ).toMatchObject({ outcome: 'draw' });
  });

  it('is a draw at the same instant', () => {
    const record = ended(
      done(done(startRecord(race, T0), 'blue', 30), 'red', 30),
      30,
    );
    expect(verdictOf(race, record)).toMatchObject({
      outcome: 'draw',
      why: 'Blue and Red were done at the same instant.',
    });
  });

  it('ends on its rule once someone is done', () => {
    expect(ruleEnds(race, startRecord(race, T0))).toBe(false);
    expect(ruleEnds(race, done(startRecord(race, T0), 'blue', 3))).toBe(true);
  });
});

describe('a game', () => {
  it('goes to the higher score once the arena is over', () => {
    const record = ended(
      done(
        done(startRecord(game, T0), 'left', 90, { score: 11 }),
        'right',
        90,
        { score: 7 },
      ),
      90,
    );
    expect(verdictOf(game, record)).toMatchObject({
      outcome: 'won',
      winner: 'left',
      why: 'Left scored 11, Right 7.',
    });
  });

  it('is unfinished while the scores are not final, a draw when equal', () => {
    const scored = done(
      done(startRecord(game, T0), 'left', 10, { score: 3 }),
      'right',
      10,
      { score: 3 },
    );
    expect(verdictOf(game, scored)).toMatchObject({ outcome: 'unfinished' });
    expect(verdictOf(game, ended(scored, 180))).toMatchObject({
      outcome: 'draw',
      why: 'Left and Right both scored 3.',
    });
    expect(verdictOf(game, startRecord(game, T0))).toMatchObject({
      outcome: 'unfinished',
      why: 'No score yet.',
    });
    expect(ruleEnds(game, scored)).toBe(false);
    expect(ruleEnds(game, scored, true)).toBe(true);
  });
});

describe('a challenge', () => {
  it('goes to the higher measure', () => {
    const record = ended(
      done(
        done(startRecord(challenge, T0), 'blue', 170, { measure: 0.6 }),
        'red',
        150,
        { measure: 0.85 },
      ),
      180,
    );
    expect(verdictOf(challenge, record)).toMatchObject({
      outcome: 'won',
      winner: 'red',
      why: 'Red measured 0.85, Blue 0.6.',
    });
  });

  it('ties on time when the measures are equal, and draws when the times are too', () => {
    const equal = ended(
      done(
        done(startRecord(challenge, T0), 'blue', 170, { measure: 0.7 }),
        'red',
        150,
        { measure: 0.7 },
      ),
      180,
    );
    expect(verdictOf(challenge, equal)).toMatchObject({
      outcome: 'won',
      winner: 'red',
    });
    const same = ended(
      done(
        done(startRecord(challenge, T0), 'blue', 150, { measure: 0.7 }),
        'red',
        150,
        { measure: 0.7 },
      ),
      180,
    );
    expect(verdictOf(challenge, same)).toMatchObject({ outcome: 'draw' });
  });

  it('ends on its rule once every contestant is done', () => {
    const one = done(startRecord(challenge, T0), 'blue', 20);
    expect(ruleEnds(challenge, one)).toBe(false);
    expect(ruleEnds(challenge, done(one, 'red', 25))).toBe(true);
  });
});

describe('the clock', () => {
  it('counts down from the start', () => {
    const record = startRecord(race, T0);
    expect(secondsLeft(race, record, T0)).toBe(120);
    expect(secondsLeft(race, record, T0 + 30_000)).toBe(90);
    expect(secondsLeft(race, record, T0 + 500_000)).toBe(0);
    expect(clockEnded(race, record, T0 + 119_999)).toBe(false);
    expect(clockEnded(race, record, T0 + 120_000)).toBe(true);
  });
});
