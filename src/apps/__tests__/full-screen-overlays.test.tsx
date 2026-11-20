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
    workspace.setAttribute('data-loop-workspace', '');
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
