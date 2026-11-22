/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Overlays at full screen (the user, 20 November 2026): the browser shows only
 * the full-screen element's subtree, so a menu Primer draws under `<body>`
 * opened unseen. While the workspace is held at full screen, Primer's portal
 * root is inside it; once it leaves, the overlays go back under `<body>`.
 */

// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Portal, ThemeProvider } from '@primer/react';
import {
  FULL_SCREEN_PORTAL_CLASS,
  holdOverlaysInside,
} from '../shell/useWorkspaceFullScreen';

afterEach(cleanup);

function Menu() {
  return (
    <Portal>
      <div data-testid="menu">menu</div>
    </Portal>
  );
}

describe('overlays at full screen', () => {
  it('are drawn inside the workspace while it is held, and under <body> after', () => {
    const workspace = document.createElement('div');
    workspace.setAttribute('data-agent-workspace', '');
    document.body.appendChild(workspace);

    const release = holdOverlaysInside(workspace);
    const first = render(
      <ThemeProvider>
        <Menu />
      </ThemeProvider>,
    );
    const inside = first.getByTestId('menu');
    expect(workspace.contains(inside)).toBe(true);
    expect(inside.closest(`.${FULL_SCREEN_PORTAL_CLASS}`)).toBeTruthy();
    first.unmount();

    act(() => release());
    expect(workspace.querySelector(`.${FULL_SCREEN_PORTAL_CLASS}`)).toBeNull();
    const after = render(
      <ThemeProvider>
        <Menu />
      </ThemeProvider>,
    );
    const outside = after.getByTestId('menu');
    expect(workspace.contains(outside)).toBe(false);
    expect(document.body.contains(outside)).toBe(true);
    workspace.remove();
  });
});

describe('an overlay still open when full screen ends', () => {
  it('moves out with its root into the page’s, where it is seen', () => {
    const workspace = document.createElement('div');
    document.body.appendChild(workspace);
    const release = holdOverlaysInside(workspace);
    const open = render(
      <ThemeProvider>
        <Menu />
      </ThemeProvider>,
    );
    const menu = open.getByTestId('menu');
    expect(workspace.contains(menu)).toBe(true);

    act(() => release());
    expect(workspace.contains(menu)).toBe(false);
    expect(document.body.contains(menu)).toBe(true);
    expect(menu.closest('#__primerPortalRoot__')).toBeTruthy();

    open.unmount();
    // The next hold clears the node its overlay left empty.
    const again = holdOverlaysInside(workspace);
    expect(
      document.querySelectorAll(`.${FULL_SCREEN_PORTAL_CLASS}`).length,
    ).toBe(1);
    act(() => again());
    workspace.remove();
  });
});
