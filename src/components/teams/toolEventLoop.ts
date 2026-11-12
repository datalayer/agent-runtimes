/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A streaming tool's events, told to an entry that runs in the page
 * (AGENT_BATTLE B1-00, 6 November 2026): each event is a turn the entry did
 * not ask for — sent at once while it is idle, held while a turn is in
 * flight and sent as one turn, the latest per source, when it ends — the
 * way the chat's loop does it (`ChatBase`), for the team hook's own loop.
 *
 * @module components/teams/toolEventLoop
 */

import { useCallback, useEffect, useRef } from 'react';
import { ToolEventTurns } from '../../tools/toolEventTurns';
import type { ToolCallRequest, ToolStreamEvent } from '../../types/tools';

/** What a streaming tool's executor is handed: where each event goes. */
export type ToolEventHandler = (
  toolCall: ToolCallRequest,
  event: ToolStreamEvent,
) => void;

/**
 * The handler for an entry's streaming tools: events become turns through
 * `send`, at once while `busy` is false, held and coalesced while it is
 * true. The handler's identity is stable, so an agent built with it is not
 * built again.
 */
export function useToolEventLoop(
  send: (text: string) => unknown,
  busy: boolean,
): ToolEventHandler {
  const sendRef = useRef(send);
  const busyRef = useRef(busy);
  const turns = useRef(new ToolEventTurns(turn => void sendRef.current(turn)));
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  useEffect(() => {
    busyRef.current = busy;
    if (!busy) {
      // After this commit's effects, so that `send` is the one that knows the entry is idle.
      const flush = turns.current;
      void Promise.resolve().then(() => flush.flush());
    }
  }, [busy]);
  return useCallback((_call: ToolCallRequest, event: ToolStreamEvent) => {
    turns.current.take(event, !busyRef.current);
  }, []);
}
