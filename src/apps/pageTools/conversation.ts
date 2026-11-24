/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an agent builds in the page with its frontend tools — a deck, a
 * workbook — kept for the conversation it was built in.
 *
 * The tools' handlers change it as they are called; the card that draws it
 * reads it here, so it survives every re-render of the transcript. It is
 * not written anywhere else: when the page is loaded again and the
 * conversation comes back with the calls it recorded
 * (`toolCards/toolResults`), it is built again by replaying the calls that
 * succeeded, in order; when the conversation starts over, it is emptied.
 *
 * @module apps/pageTools/conversation
 */

import type { RecordedToolCall } from '../toolCards/toolResults';
import { frontendToolName } from '../../tools/frontendToolNames';

/** An object, or the JSON of one. */
const answered = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.startsWith('{')) {
      return null;
    }
    try {
      return answered(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
};

/** Whether a recorded call did what it was asked: its tool answered `ok`. */
export function succeeded(call: Pick<RecordedToolCall, 'result'>): boolean {
  const result = answered(call.result);
  return result !== null && result.ok === true && !('error' in result);
}

const escaped = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A tool's bare name: a server's or a toolset's prefix taken off, and its
 * public name (`frontendToolNames`: `deckCreate` for `deck_create`) read as
 * the name it stands for, as the tool cards match it (`toolCards/kit`).
 */
export const bareToolName = (
  name: string,
  among: readonly string[],
): string | undefined =>
  among.find(each =>
    [...new Set([each, frontendToolName(each)])].some(
      alias =>
        name === alias || new RegExp(`[_.:\\-/]${escaped(alias)}$`).test(name),
    ),
  );

export type ConversationBoundOptions<S> = {
  /** The state of a conversation that built nothing yet. */
  fresh: () => S;
  /** The tools that change it, by bare name: what a restore replays. */
  writes: readonly string[];
  /** The state after these calls, applied in order to a fresh one. */
  replay: (
    calls: ReadonlyArray<{ name: string; args: Record<string, unknown> }>,
  ) => S | Promise<S>;
};

/** A state bound to the conversation on the page. */
export class ConversationBound<S> {
  private state: S | undefined;
  private live = 0;
  private seen = false;
  private restored = '';
  private revision = 0;
  private listeners = new Set<() => void>();
  private syncing: Promise<void> = Promise.resolve();

  constructor(private readonly options: ConversationBoundOptions<S>) {}

  /** The state as it stands. */
  read(): S {
    if (this.state === undefined) {
      this.state = this.options.fresh();
    }
    return this.state;
  }

  /** A handler changed it: listeners are told, and no restore replaces it. */
  set(next: S): S {
    this.state = next;
    this.touch();
    return next;
  }

  /** A handler changed it in place (a workbook's own commands). */
  touch(): void {
    this.live += 1;
    this.tell();
  }

  /** Whether anything was built in this conversation. */
  get built(): boolean {
    return this.live > 0 || this.restored !== '';
  }

  /**
   * Follow the conversation's recorded calls: emptied when a conversation
   * that had some has none (it started over), and built again from them
   * when no handler ran in this page yet (the conversation was restored).
   * One at a time, in the order asked.
   */
  sync(calls: readonly RecordedToolCall[]): Promise<void> {
    this.syncing = this.syncing.then(() => this.follow(calls));
    return this.syncing;
  }

  private async follow(calls: readonly RecordedToolCall[]): Promise<void> {
    const writes = calls
      .map(call => ({
        id: call.toolCallId,
        name: bareToolName(call.toolName, this.options.writes),
        args: call.args,
        ok: succeeded(call),
      }))
      .filter(
        (call): call is typeof call & { name: string } =>
          call.name !== undefined && call.ok,
      );
    if (writes.length === 0) {
      if (this.seen) {
        this.state = undefined;
        this.live = 0;
        this.seen = false;
        this.restored = '';
        this.tell();
      }
      return;
    }
    this.seen = true;
    if (this.live > 0) {
      return;
    }
    const signature = writes.map(call => call.id).join(',');
    if (signature === this.restored) {
      return;
    }
    const state = await this.options.replay(writes);
    if (this.live > 0) {
      // A handler ran while the replay was on its way: its state stands.
      return;
    }
    this.restored = signature;
    this.state = state;
    this.tell();
  }

  /** Forget everything (tests). */
  reset(): void {
    this.state = undefined;
    this.live = 0;
    this.seen = false;
    this.restored = '';
    this.tell();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getRevision = (): number => this.revision;

  private tell(): void {
    this.revision += 1;
    this.listeners.forEach(listener => listener());
  }
}
