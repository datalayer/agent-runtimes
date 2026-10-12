/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a session says to its page besides its messages, as `reactor.ui` ops
 * (REACTOR_UI RU-3), drawn as the chat draws them: the stream of the
 * Python test's fixture (`agent_runtimes/tests/fixtures/app_session_ops.json`)
 * decoded with Reactor's `AguiUiDecoder` and placed by `routeUiOp` — a
 * message's author, a step running then ended in place, an element opened
 * and closed, a window message, a message removed.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AguiUiDecoder,
  emptyUiModel,
  type AguiEvent,
  type UiOp,
} from '@datalayer/reactor/ui';
import type { DisplayItem } from '../../../types/chat';
import {
  applyLoopElement,
  clearLoopElements,
  openLoopElements,
  type LoopElement,
} from '../loopElement';
import { withLoopStep } from '../loopStep';
import { routeUiOp, withUiOp } from '../uiOps';

const FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../agent_runtimes/tests/fixtures/app_session_ops.json',
);

const events = JSON.parse(readFileSync(FIXTURE, 'utf8')) as AguiEvent[];

afterEach(() => clearLoopElements());

/** The fixture's stream, drawn: the conversation, the elements seen open, the window messages. */
function drawn(): {
  items: DisplayItem[];
  opened: LoopElement[][];
  windows: unknown[];
} {
  const decoder = new AguiUiDecoder();
  let items: DisplayItem[] = [];
  let steps = emptyUiModel();
  const elements = new Set<string>();
  const opened: LoopElement[][] = [];
  const windows: unknown[] = [];
  for (const event of events) {
    if (event.type === 'TEXT_MESSAGE_START') {
      items = [
        ...items,
        {
          id: String(event.messageId),
          role: 'assistant',
          content: '',
          createdAt: new Date(0),
        },
      ];
      continue;
    }
    const op: UiOp | null = decoder.decode(event);
    if (!op) continue;
    const next = routeUiOp(op, steps, elements);
    steps = next.steps;
    const routed = next.routed;
    if (routed.to === 'window') windows.push(routed.data);
    else if (routed.to === 'step') items = withLoopStep(items, routed.step);
    else if (routed.to === 'element') {
      elements.add(routed.change.id);
      applyLoopElement(routed.change);
      opened.push(openLoopElements());
    } else items = withUiOp(items, routed.op);
  }
  return { items, opened, windows };
}

describe('a session’s ops, from the Python fixture', () => {
  it('carry no loop.* event', () => {
    const names = events
      .filter(event => event.type === 'CUSTOM')
      .map(event => event.name);
    expect(new Set(names)).toEqual(new Set(['reactor.ui']));
  });

  it('draw the author, the step in place, the element, the window message and the removal', () => {
    const { items, opened, windows } = drawn();
    // The first message removed; the second said by its author; the step
    // one row, ended, its streamed output whole.
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'id-2',
      speaker: { id: 'author:Searcher', name: 'Searcher' },
    });
    expect(items[1]).toMatchObject({
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
});
