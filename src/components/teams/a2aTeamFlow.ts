/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which way a team's A2A link carries a message, read from what happens to
 * a request (`A2APeerEvent`).
 *
 * The member that is asked is the peer; the one that asks is the entry (the
 * team's `entry`, who talks to the person). While a request is out — asked,
 * then worked on — the link carries it from the entry to the peer:
 * `asking`. When the peer answers, the answer comes back the other way for a
 * moment: `answering`. Otherwise, and when a request fails, it is `still`.
 *
 * Pure, so that a test reads it and a page drives it the same way.
 *
 * @module components/teams/a2aTeamFlow
 */

import type { A2APeerEvent } from '../../runtimes/browser/a2aPeer';

/** Which way the link carries a message, if it carries one. */
export type A2ATeamFlow = 'still' | 'asking' | 'answering';

/** How long an answer is shown travelling back, in milliseconds. */
export const ANSWER_SHOWN_MS = 1800;

/**
 * The flow after an event: where the link goes now, and for how long it
 * stays that way before it is `still` again (`holdMs`, only for an answer:
 * the request's flow lasts as long as the request).
 */
export function flowAfter(event: A2APeerEvent): {
  flow: A2ATeamFlow;
  holdMs?: number;
} {
  switch (event.phase) {
    case 'asked':
    case 'working':
      return { flow: 'asking' };
    case 'answered':
      return { flow: 'answering', holdMs: ANSWER_SHOWN_MS };
    default:
      return { flow: 'still' };
  }
}

/** The member a message leaves, and the one it reaches, for a flow. */
export function flowEnds(
  flow: A2ATeamFlow,
  entry: string,
  peer: string,
): { from: string; to: string } | undefined {
  if (flow === 'asking') {
    return { from: entry, to: peer };
  }
  if (flow === 'answering') {
    return { from: peer, to: entry };
  }
  return undefined;
}
