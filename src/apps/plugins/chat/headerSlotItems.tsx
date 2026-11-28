/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What plugins put in the chat's title bar, as items of its toolbar.
 *
 * Two slots, one toolbar: `AgentSlots.chatHeader`'s items sit among the
 * chat's own, before its controls, and are the first to leave for the "…"
 * menu when the bar is short (`priority: -1`); `AgentSlots.chatHeaderEnd`'s
 * sit at the bar's trailing end, after full screen, and stay on the bar
 * (`pinned`) — what a reader looks for at the right edge, the agent chooser.
 * Each contribution is its own item, so one that draws nothing takes no room.
 *
 * @module apps/plugins/chat/headerSlotItems
 */

import type { ToolbarItem } from '@datalayer/primer-addons';
import type { ReactorSlotComponent } from '@datalayer/reactor/react';
import type { AgentWorkspaceContext } from '../../core';

/** Where a slot's items go on the title bar: among the chat's own, or at its end. */
export type HeaderSlotPlacement = 'items' | 'end';

/** The toolbar items of a header slot's contributions, for where they go. */
export function headerSlotItems(
  entries: readonly ReactorSlotComponent[],
  workspace: AgentWorkspaceContext,
  placement: HeaderSlotPlacement,
): ToolbarItem[] {
  return entries.map(entry => {
    const Contributed = entry.Component;
    return {
      key: `slot-${entry.slot}:${entry.id}`,
      type: 'custom' as const,
      ...(placement === 'end' ? { pinned: true } : { priority: -1 }),
      render: () => <Contributed workspace={workspace} />,
    };
  });
}
