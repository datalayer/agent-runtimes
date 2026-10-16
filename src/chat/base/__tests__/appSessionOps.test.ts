/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a session says to its page besides its messages, as `reactor.ui` ops
 * on its ui socket (RU-3, RU-W), drawn as the chat draws them:
 * the Python test's fixture (`agent_runtimes/tests/fixtures/app_session_ops.json`)
 * — `run`, the run stream's events, and `ui`, the socket's op frames —
 * placed by `routeUiOp`, the socket's ops arriving before the run's text
 * (two connections) and waiting for their messages (`placeable`): a
 * message's author, a step running then ended in place, an element opened
 * and closed, a window message, a message removed. And a press of a
 * display: up the socket, the run naming it only.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyUiModel, type UiOp } from '@datalayer/reactor/ui';
import type { DisplayItem } from '../../../types/chat';
import {
  applyLoopElement,
  clearLoopElements,
  openLoopElements,
  type LoopElement,
} from '../loopElement';
import { withLoopStep } from '../loopStep';
import {
  displayPressOf,
  placeable,
  routeUiOp,
  withPress,
  withUiOp,
} from '../uiOps';

const FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../agent_runtimes/tests/fixtures/app_session_ops.json',
);

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
  run: { type: string; [key: string]: unknown }[];
  ui: { t: 'op'; seq: number; op: UiOp }[];
};

afterEach(() => clearLoopElements());

/**
 * The fixture drawn: every op of the socket first, then the run's events —
 * the worst order two connections can give — an op about a message not here
 * yet waiting for it.
 */
function drawn(): {
  items: DisplayItem[];
  opened: LoopElement[][];
  windows: unknown[];
  waited: number;
} {
  let items: DisplayItem[] = [];
  let steps = emptyUiModel();
  const elements = new Set<string>();
  const opened: LoopElement[][] = [];
  const windows: unknown[] = [];
  let parked: UiOp[] = [];
  let waited: number;
  const place = (op: UiOp) => {
    if (!placeable(items, op)) {
      parked.push(op);
      return;
    }
    items = withUiOp(items, op);
  };
  const retry = () => {
    const waiting = parked;
    parked = [];
    for (const op of waiting) place(op);
  };
  expect(fixture.ui.map(frame => frame.seq)).toEqual(
    fixture.ui.map((_, index) => index + 1),
  );
  for (const { op } of fixture.ui) {
    const next = routeUiOp(op, steps, elements);
    steps = next.steps;
    const routed = next.routed;
    if (routed.to === 'window') windows.push(routed.data);
    else if (routed.to === 'step') items = withLoopStep(items, routed.step);
    else if (routed.to === 'element') {
      elements.add(routed.change.id);
      applyLoopElement(routed.change);
      opened.push(openLoopElements());
    } else place(routed.op);
  }
  waited = parked.length;
  for (const event of fixture.run) {
    if (event.type === 'TEXT_MESSAGE_START') {
      const id = String(event.messageId);
      if (!items.some(item => item.id === id)) {
        items = [
          ...items,
          { id, role: 'assistant', content: '', createdAt: new Date(0) },
        ];
      }
      retry();
    }
  }
  expect(parked).toEqual([]);
  return { items, opened, windows, waited };
}

describe('a session’s ops, from the Python fixture', () => {
  it('leave the run stream its text and steps by name', () => {
    expect(new Set(fixture.run.map(event => event.type))).toEqual(
      new Set([
        'TEXT_MESSAGE_START',
        'TEXT_MESSAGE_CONTENT',
        'TEXT_MESSAGE_END',
        'STEP_STARTED',
        'STEP_FINISHED',
      ]),
    );
  });

  it('draw the author, the step in place, the element, the window message and the removal', () => {
    const { items, opened, windows, waited } = drawn();
    // The author and the removal waited for their messages.
    expect(waited).toBe(2);
    // The first message removed; the second said by its author; the step
    // one row, ended, its streamed output whole.
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({
      id: 'id-2',
      speaker: { id: 'author:Searcher', name: 'Searcher' },
    });
    expect(items[0]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'step-id-3',
      toolName: 'gen_query',
      status: 'complete',
      result: 'SELECT 1',
    });
    // The panel opened, then closed.
    expect(opened.map(open => open.map(e => [e.id, e.where, e.title]))).toEqual(
      [[['id-4', 'panel', 'Runs']], []],
    );
    expect(windows).toEqual([{ open: 'cart' }]);
  });

  it('refuse what nothing here can place', () => {
    const op = (value: Partial<UiOp>): UiOp =>
      ({ v: 1, scope: 's', ...value }) as UiOp;
    const elements = new Set<string>();
    // A window op of a name this page does not act on.
    expect(() =>
      routeUiOp(
        op({ op: 'window', body: { name: 'focus', args: {} } }),
        emptyUiModel(),
        elements,
      ),
    ).toThrow(/not one this page acts on/);
    // A meta op saying anything but an author, or about nothing here.
    const items: DisplayItem[] = [
      { id: 'm', role: 'assistant', content: 'Hi', createdAt: new Date(0) },
    ];
    expect(() =>
      withUiOp(items, op({ op: 'meta', id: 'm', body: { title: 'x' } })),
    ).toThrow(/only a message's author/);
    expect(() =>
      withUiOp(items, op({ op: 'meta', id: 'x', body: { author: 'A' } })),
    ).toThrow(/not here/);
    // A removal of nothing here.
    expect(() => withUiOp(items, op({ op: 'remove', id: 'x' }))).toThrow(
      /cannot be removed/,
    );
    // A step is never removed: it ends.
    let steps = emptyUiModel();
    steps = routeUiOp(
      op({
        op: 'show',
        id: 'st',
        body: {
          type: 'application/vnd.datalayer.loop.step+json',
          id: 'st',
          text: 'run step a running',
          data: { name: 'a', kind: 'run' },
        },
      }),
      steps,
      elements,
    ).steps;
    expect(() =>
      routeUiOp(op({ op: 'remove', id: 'st' }), steps, elements),
    ).toThrow(/never removed/);
  });

  it('send a press of a display up the socket, the run naming it only', () => {
    const forwarded = {
      loop: {
        settings: { a: 1 },
        action: {
          name: 'again',
          display_id: 'm1-shows',
          token: 't0k',
          payload: { row: 2 },
        },
      },
    };
    expect(displayPressOf(forwarded)).toEqual({
      action: 'again',
      display_id: 'm1-shows',
      token: 't0k',
      payload: { row: 2 },
    });
    expect(withPress(forwarded, { press: 'p-1' })).toEqual({
      loop: { settings: { a: 1 }, press: 'p-1' },
    });
    // A page block's action (no display) is not a display's press.
    expect(
      displayPressOf({ loop: { action: { name: 'submit', payload: {} } } }),
    ).toBeNull();
    expect(displayPressOf(undefined)).toBeNull();
    expect(() =>
      displayPressOf({ loop: { action: { name: 'again', display_id: 'd' } } }),
    ).toThrow(/its token/);
    expect(() => withPress(forwarded, {})).toThrow(/named none/);
  });
});
