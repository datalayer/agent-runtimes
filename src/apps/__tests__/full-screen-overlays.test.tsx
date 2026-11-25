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
  useWorkspaceFullScreen,
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

describe('overlays over the CSS overlay (the user, 24 November 2026)', () => {
  it('are drawn inside the element painted over the page, where its z-index does not hide them', () => {
    let toggle: () => void = () => undefined;
    function View() {
      const ref = React.useRef<HTMLDivElement>(null);
      // The anonymous pages' door: a host header kept on screen forces the overlay.
      const fullScreen = useWorkspaceFullScreen(ref, {
        forceOverlay: true,
        topOffset: 0,
      });
      toggle = fullScreen.toggle;
      return <div ref={ref} data-testid="view" />;
    }
    const view = render(
      <ThemeProvider>
        <View />
      </ThemeProvider>,
    );
    act(() => toggle());
    const menu = render(
      <ThemeProvider>
        <Menu />
      </ThemeProvider>,
    );
    expect(view.getByTestId('view').contains(menu.getByTestId('menu'))).toBe(
      true,
    );
    menu.unmount();
    act(() => toggle());
    expect(
      view.getByTestId('view').querySelector(`.${FULL_SCREEN_PORTAL_CLASS}`),
    ).toBeNull();
  });
});

describe('the full-screen portal root as the overlays’ clipping node (the user, 24 November 2026)', () => {
  it('covers the screen, clips, lets clicks through to the workspace and back to its overlays', () => {
    const workspace = document.createElement('div');
    document.body.appendChild(workspace);
    const release = holdOverlaysInside(workspace);
    const root = workspace.querySelector(
      `.${FULL_SCREEN_PORTAL_CLASS}`,
    ) as HTMLElement;
    expect(root.style.position).toBe('fixed');
    expect([root.style.width, root.style.height]).toEqual(['100%', '100%']);
    // Primer places a menu within the first ancestor whose overflow is not visible: this one.
    expect(root.style.overflow).toBe('hidden');
    expect(root.style.pointerEvents).toBe('none');
    const rule = document.getElementById(`${FULL_SCREEN_PORTAL_CLASS}-rule`);
    expect(rule?.textContent).toBe(
      `.${FULL_SCREEN_PORTAL_CLASS} > * { pointer-events: auto; }`,
    );
    // An overlay still open when full screen ends: an ordinary portal again.
    const open = render(
      <ThemeProvider>
        <Menu />
      </ThemeProvider>,
    );
    act(() => release());
    const moved = open
      .getByTestId('menu')
      .closest(`.${FULL_SCREEN_PORTAL_CLASS}`) as HTMLElement;
    expect([
      moved.style.position,
      moved.style.height,
      moved.style.overflow,
      moved.style.pointerEvents,
    ]).toEqual(['absolute', '', '', '']);
    open.unmount();
    // One rule, however many holds.
    act(() => holdOverlaysInside(workspace)());
    expect(
      document.querySelectorAll(`#${FULL_SCREEN_PORTAL_CLASS}-rule`),
    ).toHaveLength(1);
    workspace.remove();
  });
});

describe('the click-through rule in an inline embed’s shadow root', () => {
  it('is installed in the shadow root, once, and not in the document for it', () => {
    const id = `${FULL_SCREEN_PORTAL_CLASS}-rule`;
    document.getElementById(id)?.remove();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const workspace = document.createElement('div');
    workspace.setAttribute('data-agent-workspace', '');
    shadow.appendChild(workspace);

    const release = holdOverlaysInside(workspace);
    // A stylesheet in the document's head matches nothing inside a shadow root.
    const rules = shadow.querySelectorAll(`style#${id}`);
    expect(rules).toHaveLength(1);
    expect(rules[0].textContent).toBe(
      `.${FULL_SCREEN_PORTAL_CLASS} > * { pointer-events: auto; }`,
    );
    expect(document.getElementById(id)).toBeNull();
    act(() => release());
    // One rule in that root, however many holds.
    act(() => holdOverlaysInside(workspace)());
    expect(shadow.querySelectorAll(`style#${id}`)).toHaveLength(1);
    expect(document.getElementById(id)).toBeNull();
    host.remove();
  });
});
