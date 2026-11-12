/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A streaming frontend tool (AGENT_BATTLE B1-00): subscribed once, its events
 * reach the harness while it is subscribed, nothing after; refused where
 * nobody listens.
 */

import { describe, expect, it, vi } from 'vitest';
import { ToolExecutor } from '../ToolExecutor';
import type {
  FrontendToolDefinition,
  ToolStreamEvent,
} from '../../types/tools';

/** A scripted arena: pushes one event per `tick()` until stopped. */
function arena(): {
  tool: FrontendToolDefinition;
  tick: () => void;
  stopped: () => boolean;
} {
  let push: ((event: ToolStreamEvent) => void) | undefined;
  let stopped = false;
  let tick = 0;
  const tool: FrontendToolDefinition = {
    name: 'arena_watch',
    description: 'Watch the arena',
    parameters: [],
    streams: true,
    subscribe: async (_args, send) => {
      push = send;
      return () => {
        stopped = true;
        push = undefined;
      };
    },
  };
  return {
    tool,
    tick: () => {
      tick += 1;
      push?.({
        source: 'arena-pong',
        tick,
        at: 1_700_000_000_000 + tick * 50,
        says: `tick ${tick}: the ball moves right`,
      });
    },
    stopped: () => stopped,
  };
}

describe('a streaming frontend tool', () => {
  it('is subscribed once, its events reach the harness with the call, and stop with the subscription', async () => {
    const pong = arena();
    const events: [string, ToolStreamEvent][] = [];
    const executor = new ToolExecutor({
      getToolDefinition: name =>
        name === 'arena_watch' ? pong.tool : undefined,
      onToolEvent: (call, event) => events.push([call.toolCallId, event]),
    });
    const result = await executor.execute({
      toolCallId: 'c1',
      toolName: 'arena_watch',
      args: {},
    });
    expect(result).toMatchObject({
      success: true,
      result: { subscribed: true, tool: 'arena_watch' },
    });
    expect(executor.subscribed()).toEqual(['c1']);
    pong.tick();
    pong.tick();
    expect(events.map(([id, event]) => [id, event.tick, event.says])).toEqual([
      ['c1', 1, 'tick 1: the ball moves right'],
      ['c1', 2, 'tick 2: the ball moves right'],
    ]);
    // Subscribed twice under one call: refused.
    expect(
      await executor.execute({
        toolCallId: 'c1',
        toolName: 'arena_watch',
        args: {},
      }),
    ).toMatchObject({ success: false });
    expect(executor.unsubscribe('c1')).toBe(true);
    expect(pong.stopped()).toBe(true);
    pong.tick();
    expect(events).toHaveLength(2);
    expect(executor.unsubscribe('c1')).toBe(false);
  });

  it('is refused where nobody listens, and when it has no subscribe', async () => {
    const pong = arena();
    const deaf = new ToolExecutor({ getToolDefinition: () => pong.tool });
    expect(
      await deaf.execute({
        toolCallId: 'c2',
        toolName: 'arena_watch',
        args: {},
      }),
    ).toMatchObject({
      success: false,
      error:
        'Frontend tool "arena_watch" streams, and this conversation takes no events',
    });
    const broken = new ToolExecutor({
      getToolDefinition: () => ({ ...pong.tool, subscribe: undefined }),
      onToolEvent: vi.fn(),
    });
    expect(
      await broken.execute({
        toolCallId: 'c3',
        toolName: 'arena_watch',
        args: {},
      }),
    ).toMatchObject({
      success: false,
      error: 'Frontend tool "arena_watch" streams and has no subscribe',
    });
  });

  it('stops every stream at once', async () => {
    const a = arena();
    const b = arena();
    const executor = new ToolExecutor({
      getToolDefinition: name =>
        name === 'a' ? { ...a.tool, name: 'a' } : { ...b.tool, name: 'b' },
      onToolEvent: vi.fn(),
    });
    await executor.execute({ toolCallId: 'x', toolName: 'a', args: {} });
    await executor.execute({ toolCallId: 'y', toolName: 'b', args: {} });
    expect(executor.subscribed()).toEqual(['x', 'y']);
    executor.unsubscribeAll();
    expect(executor.subscribed()).toEqual([]);
    expect(a.stopped() && b.stopped()).toBe(true);
  });
});
