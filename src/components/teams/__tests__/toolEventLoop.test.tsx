/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useToolEventLoop } from '../toolEventLoop';

const call = { toolCallId: 'c1', toolName: 'arena_watch', args: {} };
const event = (tick: number, says: string) => ({
  source: 'arena-pong',
  tick,
  at: tick,
  says,
});

/** An arena's events as turns the entry did not ask for (AGENT_BATTLE B1-00). */
describe("the team hook's loop over a streaming tool's events", () => {
  it('sends an event at once while the entry is idle', () => {
    const send = vi.fn();
    const { result } = renderHook(() => useToolEventLoop(send, false));
    act(() => result.current(call, event(1, 'the ball is at x=0.5')));
    expect(send).toHaveBeenCalledWith(
      '[arena-pong · tick 1] the ball is at x=0.5',
    );
  });

  it('holds events while a turn is in flight and sends the latest, counted, once it ends', async () => {
    const send = vi.fn();
    const { result, rerender } = renderHook(
      ({ busy }: { busy: boolean }) => useToolEventLoop(send, busy),
      { initialProps: { busy: true } },
    );
    act(() => {
      result.current(call, event(1, 'x=0.1'));
      result.current(call, event(2, 'x=0.2'));
      result.current(call, event(3, 'x=0.3'));
    });
    expect(send).not.toHaveBeenCalled();
    rerender({ busy: false });
    await act(async () => {
      await Promise.resolve();
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      '[arena-pong · tick 3] x=0.3 (the latest of 3 since your last turn)',
    );
  });

  it('keeps one handler while send changes, and sends through the newest send', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ send }: { send: (text: string) => void }) =>
        useToolEventLoop(send, false),
      { initialProps: { send: first } },
    );
    const handler = result.current;
    rerender({ send: second });
    expect(result.current).toBe(handler);
    act(() => handler(call, event(4, 'x=0.4')));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('[arena-pong · tick 4] x=0.4');
  });
});
