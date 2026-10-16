/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 *
 * @vitest-environment node
 */

/**
 * The in-memory work queue and the table prefix every Postgres
 * implementation takes (plans/DISCORD.md DC-004).
 */

import { describe, expect, it, vi } from 'vitest';
import { MemoryWorkQueue, tablePrefixOf } from '../queue';

describe('MemoryWorkQueue', () => {
  it('acknowledges enqueue before slow work finishes', async () => {
    const queue = new MemoryWorkQueue<number>();
    let release: (() => void) | undefined;
    const handled = vi.fn(
      async () =>
        new Promise<void>(resolve => {
          release = resolve;
        }),
    );
    queue.start(handled);
    await queue.enqueue(1);
    await vi.waitFor(() => expect(handled).toHaveBeenCalledWith(1));
    release?.();
    await queue.stop();
  });

  it('takes a job once under its idempotency key', async () => {
    const queue = new MemoryWorkQueue<string>();
    expect(await queue.enqueue('a', 'ev-1')).toBe(true);
    expect(await queue.enqueue('a', 'ev-1')).toBe(false);
    expect(await queue.ready()).toBe(true);
  });
});

describe('tablePrefixOf', () => {
  it('takes lowercase letters and digits, and refuses anything else', () => {
    expect(tablePrefixOf('slack')).toBe('slack');
    expect(tablePrefixOf('discord')).toBe('discord');
    for (const bad of ['', 'x', 'Slack', 'slack_x', '1slack', 'a;drop'])
      expect(() => tablePrefixOf(bad), bad).toThrow(/table prefix/);
  });
});
