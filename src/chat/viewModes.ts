/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The ways a chat can be shown, and which of them a host can offer.
 *
 * The header draws these as a segmented toggle. The list lives here, apart
 * from the header, so the rules about it — the order, the words, and which
 * modes are greyed out — can be read and tested without rendering anything.
 *
 * "Sidebar panel" is the one with a condition. The other three float over
 * the page and need nothing from it; a sidebar has to dock *somewhere*, and
 * where is the host's to say. A host says it by passing a mount point — the
 * element the panel goes into — and without one the option is shown but
 * disabled, so the person can see the mode exists and that this page has no
 * place for it, rather than clicking it and watching nothing happen.
 *
 * @module chat/viewModes
 */

import type { ChatViewMode } from '../types/chat';

/** One entry of the header's toggle. */
export type ChatViewModeOption = {
  mode: ChatViewMode;
  /** The tooltip, and the button's accessible name. */
  label: string;
};

/** The modes, in the order the toggle shows them: floating first, docked last. */
export const CHAT_VIEW_MODES: readonly ChatViewModeOption[] = [
  { mode: 'floating', label: 'Full-height popup' },
  { mode: 'floating-small', label: 'Floating popup' },
  { mode: 'floating-draggable', label: 'Floating draggable' },
  { mode: 'sidebar', label: 'Sidebar panel' },
];

/** Why the sidebar option is greyed out, for its tooltip. */
export const SIDEBAR_NEEDS_MOUNT_POINT =
  'No mount point for a sidebar on this page';

/** Whether a mode floats over the page rather than docking into it. */
export function isFloatingChatViewMode(
  mode: ChatViewMode | undefined,
): boolean {
  return (
    mode === 'floating' ||
    mode === 'floating-small' ||
    mode === 'floating-draggable'
  );
}

/**
 * Where a host said the sidebar goes.
 *
 * An element, or a selector for one — a host that renders the sidebar itself
 * marks the container with an attribute and passes the selector, which is
 * easier than threading a ref through a layout. Resolved when asked, since a
 * container may mount after the chat does; nothing is cached.
 */
export function resolveMountPoint(
  mountPoint: HTMLElement | string | null | undefined,
): HTMLElement | null {
  if (!mountPoint) {
    return null;
  }
  if (typeof mountPoint !== 'string') {
    return mountPoint.isConnected ? mountPoint : null;
  }
  if (typeof document === 'undefined') {
    return null;
  }
  try {
    return document.querySelector<HTMLElement>(mountPoint);
  } catch {
    return null;
  }
}

/**
 * The modes the toggle shows but does not let anyone pick.
 *
 * Only the sidebar can be one, and only for want of a mount point. A chat
 * already docked keeps its option live whatever the host passed: it is
 * there, and greying out the mode it is in would read as a bug.
 */
export function disabledChatViewModes({
  sidebarMountPoint,
  viewMode,
}: {
  /** The resolved element, or nothing. */
  sidebarMountPoint?: HTMLElement | null;
  /** The mode the chat is in now. */
  viewMode?: ChatViewMode;
}): ChatViewMode[] {
  if (sidebarMountPoint || viewMode === 'sidebar') {
    return [];
  }
  return ['sidebar'];
}
