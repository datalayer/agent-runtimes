/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The events of streaming frontend tools, as turns the model did not ask for
 * (AGENT_BATTLE B1-00). An event that arrives while the model is idle is sent
 * at once; one that arrives while a turn is in flight waits, and when the
 * turn ends every source's latest event is sent as one turn, with how many
 * it stands for — so the model is told, never flooded, and acts on the
 * newest state. Pure: the chat wires `send` and says when it is idle.
 *
 * @module tools/toolEventTurns
 */

import type { ToolStreamEvent } from '../types/tools';

/** What one source's waiting events coalesce to. */
export interface CoalescedEvents {
  source: string;
  latest: ToolStreamEvent;
  /** How many events the latest stands for, itself included. */
  count: number;
}

/** The latest event per source, in the order the sources first spoke. */
export function coalesce(
  events: readonly ToolStreamEvent[],
): CoalescedEvents[] {
  const bySource = new Map<string, CoalescedEvents>();
  for (const event of events) {
    const held = bySource.get(event.source);
    if (held) {
      held.latest = event;
      held.count += 1;
    } else {
      bySource.set(event.source, {
        source: event.source,
        latest: event,
        count: 1,
      });
    }
  }
  return [...bySource.values()];
}

/** One event as the model reads it: its source, its tick, what it says. */
export const eventLine = (event: ToolStreamEvent): string =>
  `[${event.source}${event.tick !== undefined ? ` · tick ${event.tick}` : ''}] ${event.says}`;

/** The turn a set of waiting events becomes, one line per source, the count said when more than one stood behind it. */
export function eventTurn(events: readonly ToolStreamEvent[]): string {
  return coalesce(events)
    .map(({ latest, count }) =>
      count > 1
        ? `${eventLine(latest)} (the latest of ${count} since your last turn)`
        : eventLine(latest),
    )
    .join('\n');
}

/**
 * The queue between the executor and the chat: `take` an event, `idle` says
 * whether the model may be prompted now; `flush` when a turn ends.
 */
export class ToolEventTurns {
  private waiting: ToolStreamEvent[] = [];

  constructor(private readonly send: (turn: string) => void) {}

  /** How many events wait for the turn in flight to end. */
  get pending(): number {
    return this.waiting.length;
  }

  /** An event arrived: sent now when the model is idle, else held. */
  take(event: ToolStreamEvent, idle: boolean): void {
    this.waiting.push(event);
    if (idle) {
      this.flush();
    }
  }

  /** The turn ended: everything held goes as one turn; nothing held, nothing sent. */
  flush(): void {
    if (this.waiting.length === 0) {
      return;
    }
    const turn = eventTurn(this.waiting);
    this.waiting = [];
    this.send(turn);
  }

  /** Forget what waits: the stream ended, or the conversation did. */
  clear(): void {
    this.waiting = [];
  }
}
