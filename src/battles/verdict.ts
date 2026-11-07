/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The referee: one pure function of a Battle's record, `verdictOf`, for the
 * three ways a Battle is decided. A race goes to the contestant done first
 * within the clock, and is a draw when the clock ends first; a game goes to
 * the higher score the arena kept; a challenge goes to the higher measure a
 * Guard gave each outcome, equal measures tying on time. Tested without a
 * browser.
 *
 * @module battles/verdict
 */

import type { BattleSpec } from '../types/agentspecs';

/** One contestant's side of the record. */
export interface BattleContestantRecord {
  /** The contestant's id in the Battle. */
  id: string;
  /** When it reported done, as a time in milliseconds; unset while it runs. */
  doneAt?: number;
  /** How many turns it took. */
  turns: number;
  /** How many tool calls it made. */
  toolCalls: number;
  /** A challenge: the Guard's measure of its outcome, between 0 and 1. */
  measure?: number;
  /** A game: its score, as the arena kept it. */
  score?: number;
  /** Its final output, for the measure and the result card. */
  output?: string;
}

/** A game: one move, with its tick. */
export interface BattleMove {
  contestant: string;
  tick: number;
  at: number;
  tool: string;
  args?: Record<string, unknown>;
}

/** What a played Battle leaves. */
export interface BattleRecord {
  /** The Battle, `id:version`. */
  battle: string;
  /** When every contestant was started, as a time in milliseconds. */
  startedAt: number;
  /** When it ended, on the referee's rule or the clock; unset while it runs. */
  endedAt?: number;
  contestants: BattleContestantRecord[];
  /** A game: every move, with its tick. */
  moves: BattleMove[];
}

/** One line of the standings: a contestant, what it is ranked on, and its time. */
export interface BattleStanding {
  id: string;
  /** Seconds from the start to done, when it reported done. */
  seconds?: number;
  /** The score or the measure, when it has one. */
  value?: number;
}

/** What the referee says. */
export interface BattleVerdict {
  /** `unconfirmed` (the user, 7 November 2026): the referee named a winner whose evals did not all pass — the page says what failed, and no winner. */
  outcome: 'won' | 'draw' | 'unfinished' | 'unconfirmed';
  /** The winner's id, when there is one. */
  winner?: string;
  /** Why, in a sentence. */
  why: string;
  /** Every contestant, best first. */
  standings: BattleStanding[];
}

const seconds = (
  record: BattleRecord,
  contestant: BattleContestantRecord,
): number | undefined =>
  contestant.doneAt === undefined
    ? undefined
    : Math.max(0, (contestant.doneAt - record.startedAt) / 1000);

/** Whether the clock of a Battle has run out at a time. */
export function clockEnded(
  spec: BattleSpec,
  record: BattleRecord,
  now: number,
): boolean {
  return now - record.startedAt >= spec.clockSeconds * 1000;
}

/** The seconds left on the clock at a time, never under zero. */
export function secondsLeft(
  spec: BattleSpec,
  record: BattleRecord,
  now: number,
): number {
  return Math.max(0, spec.clockSeconds - (now - record.startedAt) / 1000);
}

const byId = (spec: BattleSpec, id: string): string =>
  spec.contestants.find(c => c.id === id)?.name || id;

const unfinished = (
  standings: BattleStanding[],
  why: string,
): BattleVerdict => ({ outcome: 'unfinished', why, standings });
const draw = (standings: BattleStanding[], why: string): BattleVerdict => ({
  outcome: 'draw',
  why,
  standings,
});

function firstDone(spec: BattleSpec, record: BattleRecord): BattleVerdict {
  const within = record.contestants
    .map(contestant => ({
      id: contestant.id,
      seconds: seconds(record, contestant),
    }))
    .filter(
      (standing): standing is { id: string; seconds: number } =>
        standing.seconds !== undefined && standing.seconds <= spec.clockSeconds,
    )
    .sort((a, b) => a.seconds - b.seconds);
  const rest = record.contestants
    .filter(
      contestant => !within.some(standing => standing.id === contestant.id),
    )
    .map(contestant => ({ id: contestant.id }));
  const standings: BattleStanding[] = [...within, ...rest];
  if (within.length === 0) {
    return record.endedAt === undefined
      ? unfinished(standings, 'Nobody is done yet.')
      : draw(
          standings,
          `The clock ended first: nobody was done within ${spec.clockSeconds} seconds.`,
        );
  }
  const [first, second] = within;
  if (second && second.seconds === first.seconds) {
    return draw(
      standings,
      `${byId(spec, first.id)} and ${byId(spec, second.id)} were done at the same instant.`,
    );
  }
  return {
    outcome: 'won',
    winner: first.id,
    why: `${byId(spec, first.id)} was done first, in ${first.seconds.toFixed(1)} seconds.`,
    standings,
  };
}

function highest(
  spec: BattleSpec,
  record: BattleRecord,
  value: (contestant: BattleContestantRecord) => number | undefined,
  what: string,
  tieOnTime: boolean,
): BattleVerdict {
  const standings: BattleStanding[] = record.contestants
    .map(contestant => ({
      id: contestant.id,
      value: value(contestant),
      seconds: seconds(record, contestant),
    }))
    .sort(
      (a, b) =>
        (b.value ?? -Infinity) - (a.value ?? -Infinity) ||
        (a.seconds ?? Infinity) - (b.seconds ?? Infinity),
    );
  if (standings.every(standing => standing.value === undefined)) {
    return unfinished(standings, `No ${what} yet.`);
  }
  if (record.endedAt === undefined) {
    return unfinished(
      standings,
      `The ${what}s are not final: the Battle is still on.`,
    );
  }
  const [first, second] = standings;
  if (second && second.value === first.value) {
    if (
      tieOnTime &&
      first.seconds !== undefined &&
      second.seconds !== undefined &&
      first.seconds !== second.seconds
    ) {
      return {
        outcome: 'won',
        winner: first.id,
        why: `${byId(spec, first.id)} and ${byId(spec, second.id)} measured ${first.value}; ${byId(spec, first.id)} was done first.`,
        standings,
      };
    }
    return draw(
      standings,
      `${byId(spec, first.id)} and ${byId(spec, second.id)} both ${what}d ${first.value}.`,
    );
  }
  return {
    outcome: 'won',
    winner: first.id,
    why: `${byId(spec, first.id)} ${what}d ${first.value}, ${byId(spec, second?.id ?? '')} ${second?.value ?? 'nothing'}.`,
    standings,
  };
}

/** What the referee says of a record, by the Battle's rule. */
export function verdictOf(
  spec: BattleSpec,
  record: BattleRecord,
): BattleVerdict {
  switch (spec.referee.decidesBy) {
    case 'first_done':
      return firstDone(spec, record);
    case 'score':
      return highest(
        spec,
        record,
        contestant => contestant.score,
        'score',
        false,
      );
    case 'measure':
      return highest(
        spec,
        record,
        contestant => contestant.measure,
        'measure',
        true,
      );
  }
}

/** A record at the start of a Battle: every contestant started, nothing done. */
export function startRecord(spec: BattleSpec, startedAt: number): BattleRecord {
  return {
    battle: `${spec.id}:${spec.version}`,
    startedAt,
    contestants: spec.contestants.map(contestant => ({
      id: contestant.id,
      turns: 0,
      toolCalls: 0,
    })),
    moves: [],
  };
}

/**
 * Whether the Battle's own rule ends it now: a race once every contestant is
 * done (the user, 7 November 2026: the slowest may be the one whose tests
 * pass, so nobody is stopped on the first answer; the first done still
 * ranks first), a game once the arena says so, a challenge once everyone is
 * done. The clock ends any of them.
 */
export function ruleEnds(
  spec: BattleSpec,
  record: BattleRecord,
  arenaOver = false,
): boolean {
  switch (spec.referee.decidesBy) {
    case 'first_done':
      return record.contestants.every(
        contestant => contestant.doneAt !== undefined,
      );
    case 'score':
      return arenaOver;
    case 'measure':
      return record.contestants.every(
        contestant => contestant.doneAt !== undefined,
      );
  }
}
