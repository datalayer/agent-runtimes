/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Where an element of an application's code shows (LOOP P-18): in a side
 * panel beside the conversation, or on a page of its own over it. Inline,
 * an element is a message, and the chat draws it as one (P-04).
 *
 * The session API says it with a `CUSTOM` event named `loop.element` —
 * `{id, where, title, shows}`, `shows` the A2UI surface an answer's
 * components are drawn from, or `{id, closed: true}` — which the AG-UI
 * adapter hands on as an `activity`. The chat does not draw it: it keeps
 * what is open here, and whoever draws panels and pages (the `app-elements`
 * plugin) listens. One store per page, as there is one chat per
 * application on it.
 */

/** The `CUSTOM` event's name. */
export const LOOP_ELEMENT = 'loop.element';

/** Where an element opens, besides inline. */
export type LoopElementWhere = 'panel' | 'page';

/** An element open in a side panel or on a page. */
export type LoopElement = {
  id: string;
  where: LoopElementWhere;
  title: string;
  /** The surface it draws: what `render_a2ui_surface` returns. */
  shows: unknown;
};

/** What an event says: an element opened or changed, or one closed. */
export type LoopElementChange = LoopElement | { id: string; closed: true };

/** The change an activity says, or `null` when it says none. */
export function loopElementChange(
  activity: { type: string; data: unknown } | undefined,
): LoopElementChange | null {
  if (!activity || activity.type !== LOOP_ELEMENT) return null;
  const data = activity.data as Record<string, unknown> | null;
  if (!data || typeof data.id !== 'string' || !data.id) return null;
  if (data.closed === true) return { id: data.id, closed: true };
  if (data.where !== 'panel' && data.where !== 'page') return null;
  return {
    id: data.id,
    where: data.where,
    title: typeof data.title === 'string' ? data.title : '',
    shows: data.shows ?? null,
  };
}

/**
 * The elements open with a change applied: one opened is added last, one
 * changed is replaced where it is, one closed is taken away.
 */
export function withLoopElement(
  open: readonly LoopElement[],
  change: LoopElementChange,
): LoopElement[] {
  if ('closed' in change) {
    return open.filter(element => element.id !== change.id);
  }
  const at = open.findIndex(element => element.id === change.id);
  if (at < 0) return [...open, change];
  return open.map((element, index) => (index === at ? change : element));
}

let opened: LoopElement[] = [];
const listeners = new Set<(open: LoopElement[]) => void>();

/** The elements open now, in the order they opened. */
export const openLoopElements = (): LoopElement[] => opened;

/** Apply a change, and tell whoever draws them. */
export function applyLoopElement(change: LoopElementChange): void {
  opened = withLoopElement(opened, change);
  for (const listener of [...listeners]) listener(opened);
}

/**
 * Close an element on this screen: the person closed it. The code is not
 * told; it may show it again.
 */
export const closeLoopElement = (id: string): void =>
  applyLoopElement({ id, closed: true });

/** Close every element: a new conversation starts with none. */
export function clearLoopElements(): void {
  opened = [];
  for (const listener of [...listeners]) listener(opened);
}

/** Listen for what is open. Returns the unsubscribe. */
export function onLoopElements(
  listener: (open: LoopElement[]) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
