/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** Events as turns: sent at once when idle, coalesced to the latest per source when a turn was in flight. */

import { describe, expect, it } from 'vitest';
import {
  ToolEventTurns,
  coalesce,
  eventLine,
  eventTurn,
} from '../toolEventTurns';
import type { ToolStreamEvent } from '../../types/tools';

const at = (
  tick: number,
  says: string,
  source = 'arena-pong',
): ToolStreamEvent => ({
  source,
  tick,
  at: 1_700_000_000_000 + tick * 50,
  says,
});

describe('events as turns', () => {
  it('coalesces to the latest per source, counting what each stands for', () => {
    const events = [
      at(1, 'serve'),
      at(2, 'the ball moves right'),
      at(1, 'wave one', 'arena-invaders'),
      at(3, 'a bounce'),
    ];
    expect(
      coalesce(events).map(c => [c.source, c.latest.tick, c.count]),
    ).toEqual([
      ['arena-pong', 3, 3],
      ['arena-invaders', 1, 1],
    ]);
    expect(eventLine(at(3, 'a bounce'))).toBe('[arena-pong · tick 3] a bounce');
    expect(
      eventLine({ source: 'clock', at: 0, says: 'ten seconds left' }),
    ).toBe('[clock] ten seconds left');
    expect(eventTurn(events)).toBe(
      '[arena-pong · tick 3] a bounce (the latest of 3 since your last turn)\n[arena-invaders · tick 1] wave one',
    );
  });

  it('sends at once when the model is idle, holds while a turn is in flight, and flushes as one turn', () => {
    const sent: string[] = [];
    const turns = new ToolEventTurns(turn => sent.push(turn));
    turns.take(at(1, 'serve'), true);
    expect(sent).toEqual(['[arena-pong · tick 1] serve']);
    turns.take(at(2, 'right'), false);
    turns.take(at(3, 'bounce'), false);
    expect(turns.pending).toBe(2);
    expect(sent).toHaveLength(1);
    turns.flush();
    expect(sent[1]).toBe(
      '[arena-pong · tick 3] bounce (the latest of 2 since your last turn)',
    );
    expect(turns.pending).toBe(0);
    turns.flush();
    expect(sent).toHaveLength(2);
    turns.take(at(4, 'point'), false);
    turns.clear();
    turns.flush();
    expect(sent).toHaveLength(2);
  });
});
