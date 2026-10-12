/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The displays a conversation's messages show (REACTOR_UI RU-2).
 *
 * A server shows a display under one of its messages with a `reactor.ui`
 * op — `show`, then `patch` or `append` as it changes, `remove` when it goes
 * — which the AG-UI adapter decodes (`AguiUiDecoder`) and hands on as an
 * `activity` of type `reactor.ui`. A display says the message it is under in
 * `data.message_id`; it is kept on that message (`ChatMessage.displays`) and
 * drawn there by the renderer a plugin contributed for its type.
 *
 * Pure: the chat applies it to what it draws, and to its store.
 *
 * @module chat/base/uiOps
 */

import {
  AGUI_NAME,
  applyPatch,
  isUiOp,
  type Display,
  type UiOp,
} from '@datalayer/reactor/ui';

/** The op an activity carries, or `null` when it is not the reactor's. */
export function uiOpOf(
  activity: { type: string; data: unknown } | undefined,
): UiOp | null {
  if (!activity || activity.type !== AGUI_NAME) return null;
  if (!isUiOp(activity.data)) {
    throw new Error('A reactor.ui activity carries no op');
  }
  return activity.data;
}

/** The message a display is under: its `data.message_id`. */
export function messageOfDisplay(display: Display): string {
  const id = display.data?.message_id;
  if (typeof id !== 'string' || !id) {
    throw new Error(`Display ${display.id} says no message it is under`);
  }
  return id;
}

type WithDisplays = { id?: string; displays?: Display[] };

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
 * The messages with an op applied to the displays they show: a display
 * shown (or asked) kept on its message, replacing one of its id; patched,
 * appended to or removed where it is. `state`, `meta` and `window` ops are
 * not about a message's displays: the messages come back as they were.
 *
 * Throws for a display under no message here, and for a change to a display
 * no message shows: the server said something the page never saw.
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
    case 'remove':
      return changed(items, op.id, () => undefined);
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
    default:
      return items;
  }
}
