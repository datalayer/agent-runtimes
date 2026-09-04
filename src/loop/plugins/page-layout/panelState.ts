/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The page layout's shared state: whether the conversation panel is open,
 * and what the sheet holds.
 *
 * Signals, in a module of their own so the layout, the header toggle, the
 * turn panel and a host can all read and write them without any of them
 * importing the others.
 * Closed to start: the page is what a reader came for, and a transcript with
 * nothing in it is a column of nothing.
 *
 * @module loop/plugins/page-layout/panelState
 */

import { signal } from '@datalayer/reactor';

export const pageLayoutPanelOpen = signal(false);

/**
 * What lies on the sheet: an editor, or — in the chat view, where there is
 * none — the transcript itself.
 *
 * Written by the layout as it renders, read by the parts that only make
 * sense beside an editor: the turn panel under the composer would repeat
 * the transcript it floats over, and the conversation toggle would open a
 * second copy of the page.
 */
export const pageLayoutSheet = signal<'editor' | 'transcript'>('editor');

/** Open the panel — for a host that wants the reply seen the moment it lands. */
export function openConversationPanel(): void {
  pageLayoutPanelOpen.value = true;
}
