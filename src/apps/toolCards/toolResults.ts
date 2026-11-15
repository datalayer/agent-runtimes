/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The tool calls a conversation has answered, for the UI in the chat's own
 * chrome (the header chips: the basket's total, the Odoo company, the trip,
 * the area searched, the savings found) to read its state from — never made
 * up. The transcript (`ChatMessageList`) records each completed call into the
 * store of its context; `Chat` gives each chat a store of its own, and a Loop
 * workspace shares the page's.
 *
 * @module apps/toolCards/toolResults
 */

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { toolPattern } from './kit';

export type RecordedToolCall = {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  /** In the order answered. */
  order: number;
};

/** The completed tool calls of one conversation (or one page). */
export class ToolResultsStore {
  private calls = new Map<string, RecordedToolCall>();
  private listeners = new Set<() => void>();
  private revision = 0;
  private counter = 0;

  /** Records the completed calls among a transcript's items; tells listeners once if any is new. */
  record(
    items: ReadonlyArray<{
      type?: string;
      toolCallId?: string;
      toolName?: string;
      args?: Record<string, unknown>;
      result?: unknown;
      status?: string;
    }>,
  ): void {
    let changed = false;
    for (const item of items) {
      if (
        item.type !== 'tool-call' ||
        item.status !== 'complete' ||
        !item.toolCallId ||
        !item.toolName ||
        this.calls.has(item.toolCallId)
      ) {
        continue;
      }
      this.calls.set(item.toolCallId, {
        toolCallId: item.toolCallId,
        toolName: item.toolName,
        args: item.args ?? {},
        result: item.result,
        order: (this.counter += 1),
      });
      changed = true;
    }
    if (changed) {
      this.revision += 1;
      this.listeners.forEach(listener => listener());
    }
  }

  /** Forgets every call: a new conversation. */
  clear(): void {
    if (this.calls.size > 0) {
      this.calls.clear();
      this.revision += 1;
      this.listeners.forEach(listener => listener());
    }
  }

  /** The calls of these tools (a server's prefix allowed), oldest first. */
  callsOf(names: readonly string[]): RecordedToolCall[] {
    const patterns = names.map(toolPattern);
    return [...this.calls.values()]
      .filter(call => patterns.some(pattern => pattern.test(call.toolName)))
      .sort((a, b) => a.order - b.order);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getRevision = (): number => this.revision;
}

/** The page's store: a Loop workspace's chrome and transcript share it. */
export const PAGE_TOOL_RESULTS = new ToolResultsStore();

export const ToolResultsContext =
  createContext<ToolResultsStore>(PAGE_TOOL_RESULTS);

/** The answered calls of these tools, oldest first, kept current. */
export function useToolCalls(names: readonly string[]): RecordedToolCall[] {
  const store = useContext(ToolResultsContext);
  const revision = useSyncExternalStore(
    store.subscribe,
    store.getRevision,
    store.getRevision,
  );
  const key = names.join(',');
  return useMemo(
    () => store.callsOf(names),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, revision, key],
  );
}

/** The last answered call of these tools, if any. */
export function useLatestToolCall(
  names: readonly string[],
): RecordedToolCall | undefined {
  const calls = useToolCalls(names);
  return calls[calls.length - 1];
}
