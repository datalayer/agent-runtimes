// @vitest-environment jsdom
/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which display modes the header offers, and which it greys out.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  CHAT_VIEW_MODES,
  disabledChatViewModes,
  isFloatingChatViewMode,
  resolveMountPoint,
} from '../viewModes';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the modes', () => {
  it('are the three floating ones, then the docked one', () => {
    expect(CHAT_VIEW_MODES.map(option => option.mode)).toEqual([
      'floating',
      'floating-small',
      'floating-draggable',
      'sidebar',
    ]);
  });

  it('name the draggable one for what it is', () => {
    const draggable = CHAT_VIEW_MODES.find(
      option => option.mode === 'floating-draggable',
    );
    expect(draggable?.label).toBe('Floating draggable');
  });

  it('know which of them float', () => {
    expect(isFloatingChatViewMode('floating')).toBe(true);
    expect(isFloatingChatViewMode('floating-small')).toBe(true);
    expect(isFloatingChatViewMode('floating-draggable')).toBe(true);
    expect(isFloatingChatViewMode('sidebar')).toBe(false);
    expect(isFloatingChatViewMode(undefined)).toBe(false);
  });
});

describe('the sidebar option', () => {
  it('is disabled without a mount point', () => {
    expect(disabledChatViewModes({ viewMode: 'floating' })).toEqual([
      'sidebar',
    ]);
    expect(
      disabledChatViewModes({ sidebarMountPoint: null, viewMode: 'floating' }),
    ).toEqual(['sidebar']);
  });

  it('is enabled by a mount point', () => {
    const mount = document.createElement('aside');
    expect(
      disabledChatViewModes({ sidebarMountPoint: mount, viewMode: 'floating' }),
    ).toEqual([]);
  });

  it('stays enabled while the chat is already docked', () => {
    expect(disabledChatViewModes({ viewMode: 'sidebar' })).toEqual([]);
  });
});

describe('a mount point', () => {
  it('is an element, when it is in the document', () => {
    const mount = document.createElement('aside');
    expect(resolveMountPoint(mount)).toBeNull();
    document.body.appendChild(mount);
    expect(resolveMountPoint(mount)).toBe(mount);
  });

  it('is found by its selector', () => {
    const mount = document.createElement('div');
    mount.setAttribute('data-chat-sidebar-mount', 'notebook');
    document.body.appendChild(mount);
    expect(resolveMountPoint('[data-chat-sidebar-mount="notebook"]')).toBe(
      mount,
    );
    expect(resolveMountPoint('[data-chat-sidebar-mount="other"]')).toBeNull();
  });

  it('is nothing for nothing, or for a selector that cannot be one', () => {
    expect(resolveMountPoint(null)).toBeNull();
    expect(resolveMountPoint(undefined)).toBeNull();
    expect(resolveMountPoint('')).toBeNull();
    expect(resolveMountPoint('[[[')).toBeNull();
  });
});
