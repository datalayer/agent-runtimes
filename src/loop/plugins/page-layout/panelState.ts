/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Whether the page layout's conversation panel is open.
 *
 * One signal, in a module of its own so the layout, the header toggle and a
 * host can all read and write it without any of them importing the others.
 * Closed to start: the page is what a reader came for, and a transcript with
 * nothing in it is a column of nothing.
 *
 * @module loop/plugins/page-layout/panelState
 */

import { signal } from '@datalayer/reactor';

export const pageLayoutPanelOpen = signal(false);

/** Open the panel — for a host that wants the reply seen the moment it lands. */
export function openConversationPanel(): void {
  pageLayoutPanelOpen.value = true;
}
