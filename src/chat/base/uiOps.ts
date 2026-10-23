/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a server says to a conversation's page, as `reactor.ui` ops
 * (RU-2, RU-3), and what the page presses back (RU-W).
 *
 * The ops arrive on the conversation's ui socket (Reactor's `UiSocket`,
 * one per session, beside the run stream that carries the conversation's
 * text); `routeUiOp` says where each goes:
 *
 * - a `window` op to the page the conversation sits in (`loopWindow`);
 * - a step's display to its row (`loopStep`), patched as it streams;
 * - a display that says it shows in a panel or on a page to the elements
 *   open (`loopElement`), a `remove` of its id closing it;
 * - everything else to the messages (`withUiOp`): a display under a message
 *   (`data.message_id`) kept on it (`ChatMessage.displays`) and drawn by the
 *   renderer a plugin contributed for its type; a `meta` op's `author` the
 *   message's voice; a `remove` of a message's id the message gone.
 *
 * An op about a message that has not arrived on the run stream yet — the
 * two are separate connections — waits until it has (`placeable`). A press
 * of what a display offered goes up the socket (`displayPressOf`), and the
 * run that answers it names it only (`withPress`).
 *
 * Pure: the chat applies it to what it draws, and to its store. Nothing it
 * was not told to expect is guessed at: an op it cannot place throws.
 *
 * @module chat/base/uiOps
 */

import {
  applyPatch,
  applyUiOp,
  type Display,
  type UiAction,
  type UiModel,
  type UiOp,
} from '@datalayer/reactor/ui';
import type { MessageSpeaker } from '../../types/messages';
import { elementOfDisplay, type LoopElementChange } from './loopElement';
import { isStepDisplay, stepOfDisplay, type LoopStep } from './loopStep';
import { windowMessageOf } from './loopWindow';

/** The message a display is under: its `data.message_id`. */
export function messageOfDisplay(display: Display): string {
  const id = display.data?.message_id;
  if (typeof id !== 'string' || !id) {
    throw new Error(`Display ${display.id} says no message it is under`);
  }
  return id;
}

/** Who a message is by, as the chat draws a named voice. */
export function speakerOf(author: string): MessageSpeaker {
  return { id: `author:${author}`, name: author };
}

type WithDisplays = {
  id?: string;
  displays?: Display[];
  speaker?: MessageSpeaker;
};

/** The messages with one display changed by `change`, or taken away when it answers nothing. */
function changed<T extends WithDisplays>(
  items: T[],
  id: string,
  change: (display: Display) => Display | undefined,
): T[] {
  const at = items.findIndex(item =>
    (item.displays ?? []).some(display => display.id === id),
  );
  if (at < 0) {
    throw new Error(`Display ${id} is shown under no message here`);
  }
  return items.map((item, index) => {
    if (index !== at) return item;
    const displays: Display[] = [];
    for (const display of item.displays ?? []) {
      if (display.id !== id) {
        displays.push(display);
        continue;
      }
      const next = change(display);
      if (next) displays.push({ ...next, id });
    }
    return { ...item, displays };
  });
}

function replaced(displays: Display[], display: Display): Display[] {
  const at = displays.findIndex(one => one.id === display.id);
  return at < 0
    ? [...displays, display]
    : displays.map((one, index) => (index === at ? display : one));
}

/**
 * The messages with an op applied: a display shown (or asked) kept on its
 * message, replacing one of its id; patched, appended to or removed where it
 * is. A `remove` of a message's own id takes the message away, with what it
 * showed; a `meta` op about a message gives it its `author`. `state` ops are
 * not about the messages: they come back as they were.
 *
 * Throws for a display under no message here, for a change to a display no
 * message shows, for a removal of nothing here, and for a `meta` op that
 * says anything but a message's author: the server said something the page
 * never saw, or does not read.
 */
export function withUiOp<T extends WithDisplays>(items: T[], op: UiOp): T[] {
  switch (op.op) {
    case 'show':
    case 'ask': {
      const shown = op.body;
      const messageId = messageOfDisplay(shown);
      if (!items.some(item => item.id === messageId)) {
        throw new Error(
          `Display ${shown.id} is under message ${messageId}, which is not here`,
        );
      }
      return items.map(item =>
        item.id === messageId
          ? { ...item, displays: replaced(item.displays ?? [], shown) }
          : item,
      );
    }
    case 'remove': {
      const showsIt = items.some(item =>
        (item.displays ?? []).some(display => display.id === op.id),
      );
      if (showsIt) return changed(items, op.id, () => undefined);
      if (!items.some(item => item.id === op.id)) {
        throw new Error(`Nothing here is ${op.id}: it cannot be removed`);
      }
      return items.filter(item => item.id !== op.id);
    }
    case 'patch': {
      const operations = op.body;
      return changed(items, op.id, display => applyPatch(display, operations));
    }
    case 'append': {
      const { path, value } = op.body;
      return changed(items, op.id, display =>
        applyPatch(display, [{ op: 'add', path: `${path}/-`, value }]),
      );
    }
    case 'meta': {
      const author = op.body.author;
      const keys = Object.keys(op.body);
      if (
        !op.id ||
        keys.length !== 1 ||
        typeof author !== 'string' ||
        !author.trim()
      ) {
        throw new Error(
          `A meta op says ${JSON.stringify(op.body)}: only a message's author is read`,
        );
      }
      if (!items.some(item => item.id === op.id)) {
        throw new Error(
          `Message ${op.id} is not here: it has no author to say`,
        );
      }
      return items.map(item =>
        item.id === op.id
          ? { ...item, speaker: speakerOf(author.trim()) }
          : item,
      );
    }
    case 'window':
      throw new Error('A window op is for the page, not the messages');
    default:
      return items;
  }
}

/** Where an op goes (`routeUiOp`). */
export type RoutedUiOp =
  | { to: 'window'; data: unknown }
  | { to: 'step'; step: LoopStep }
  | { to: 'element'; change: LoopElementChange }
  | { to: 'messages'; op: UiOp };

/**
 * Where an op goes, and the steps kept after it: a step's display is kept
 * (in a Reactor `UiModel`) so a patch of its output applies to it.
 *
 * `elements` is the ids of the elements shown in this conversation: a
 * `remove` of one closes it (a no-op when the person closed it already).
 */
export function routeUiOp(
  op: UiOp,
  steps: UiModel,
  elements: ReadonlySet<string>,
): { routed: RoutedUiOp; steps: UiModel } {
  switch (op.op) {
    case 'window':
      return { routed: { to: 'window', data: windowMessageOf(op) }, steps };
    case 'show':
    case 'ask': {
      if (isStepDisplay(op.body)) {
        const kept = applyUiOp(steps, op);
        return {
          routed: { to: 'step', step: stepOfDisplay(op.body) },
          steps: kept,
        };
      }
      const element = elementOfDisplay(op.body);
      if (element) {
        return { routed: { to: 'element', change: element }, steps };
      }
      return { routed: { to: 'messages', op }, steps };
    }
    case 'patch':
    case 'append': {
      if (op.id in steps.displays) {
        const kept = applyUiOp(steps, op);
        return {
          routed: { to: 'step', step: stepOfDisplay(kept.displays[op.id]) },
          steps: kept,
        };
      }
      return { routed: { to: 'messages', op }, steps };
    }
    case 'remove': {
      if (op.id in steps.displays) {
        throw new Error(`Step ${op.id} is never removed: it ends`);
      }
      if (elements.has(op.id)) {
        return {
          routed: { to: 'element', change: { id: op.id, closed: true } },
          steps,
        };
      }
      return { routed: { to: 'messages', op }, steps };
    }
    default:
      return { routed: { to: 'messages', op }, steps };
  }
}

/**
 * Whether the messages hold what an op is about: the message a display is
 * under, the message a `meta` op names, the display a change is to, what a
 * `remove` takes away. An op about what has not arrived yet waits.
 */
export function placeable<T extends WithDisplays>(
  items: readonly T[],
  op: UiOp,
): boolean {
  const hasItem = (id: string | null | undefined) =>
    !!id && items.some(item => item.id === id);
  const hasDisplay = (id: string | null | undefined) =>
    !!id &&
    items.some(item =>
      (item.displays ?? []).some(display => display.id === id),
    );
  switch (op.op) {
    case 'show':
    case 'ask': {
      const under = op.body.data?.message_id;
      return typeof under === 'string' && hasItem(under);
    }
    case 'meta':
      return hasItem(op.id);
    case 'patch':
    case 'append':
      return hasDisplay(op.id);
    case 'remove':
      return hasDisplay(op.id) || hasItem(op.id);
    default:
      return true;
  }
}

/**
 * The press a run's `forwardedProps` carries for a display's button — what
 * `AnswerShowsView` hands the chat — or `null` for a run that presses
 * nothing of a display's. It goes up the ui socket, never in the run.
 */
export function displayPressOf(
  forwardedProps: Record<string, unknown> | undefined,
): UiAction | null {
  const loop = forwardedProps?.loop as Record<string, unknown> | undefined;
  const action = loop?.action as Record<string, unknown> | undefined;
  if (!action || typeof action.display_id !== 'string') return null;
  if (typeof action.name !== 'string' || typeof action.token !== 'string') {
    throw new Error('A press of a display says its action and its token');
  }
  return {
    action: action.name,
    display_id: action.display_id,
    token: action.token,
    payload: (action.payload as Record<string, unknown> | undefined) ?? {},
  };
}

/**
 * The run's `forwardedProps` once its press was checked on the socket: the
 * press named by the id the runtime answered, the action itself gone.
 */
export function withPress(
  forwardedProps: Record<string, unknown>,
  answered: unknown,
): Record<string, unknown> {
  const press = (answered as { press?: unknown } | null)?.press;
  if (typeof press !== 'string' || !press) {
    throw new Error('The runtime checked the press but named none');
  }
  const loop = { ...(forwardedProps.loop as Record<string, unknown>) };
  delete loop.action;
  return { ...forwardedProps, loop: { ...loop, press } };
}
