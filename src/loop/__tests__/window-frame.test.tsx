/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The window frame's title bar is extensible.
 *
 * The whole reason the frame is a plugin rather than a component is that a
 * host should be able to put a button in its bar without the thing rendering
 * the frame forwarding it. If the slots stop working the frame still draws,
 * which is exactly the kind of break nobody notices.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { buildReactorFromPlugins, definePlugin } from '@datalayer/reactor';
import { useReactor } from '@datalayer/reactor/react';
import {
  WindowFrame,
  WindowFramePlugin,
  WINDOW_ACTIONS_SLOT,
} from '../plugins/window-frame';

/** A host's button, contributed the way a page would contribute one. */
const HostActionPlugin = definePlugin({
  name: '@tests/host-actions',
  build: () => ({
    components: [
      {
        id: 'host-action',
        slot: WINDOW_ACTIONS_SLOT,
        Component: () => <button type="button">Bring your own Agent</button>,
      },
    ],
  }),
});

function Harness({
  plugins,
  title,
  height,
}: {
  plugins: Parameters<typeof buildReactorFromPlugins>[0];
  title?: React.ReactNode;
  height?: string | number;
}) {
  const reactor = React.useMemo(
    () => buildReactorFromPlugins(plugins),
    [plugins],
  );
  useReactor(reactor);
  return (
    <WindowFrame title={title} height={height}>
      <div data-testid="body">the workspace</div>
    </WindowFrame>
  );
}

async function mount(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return { container, root };
}

describe('the window frame', () => {
  it('draws its own window controls', async () => {
    const { container, root } = await mount(
      <Harness plugins={[WindowFramePlugin]} height={200} />,
    );

    // Three dots, contributed by the plugin rather than drawn into the frame,
    // so a host with its own idea of window controls can replace them.
    const dots = container.querySelectorAll('div[class]');
    expect(container.textContent).toContain('the workspace');
    expect(dots.length).toBeGreaterThan(0);

    await act(async () => root.unmount());
  });

  it('renders what a host contributes to the trailing edge', async () => {
    const { container, root } = await mount(
      <Harness plugins={[WindowFramePlugin, HostActionPlugin]} height={200} />,
    );

    // The frame never saw this button: the page mounted a plugin, and the slot
    // did the rest.
    expect(container.textContent).toContain('Bring your own Agent');

    await act(async () => root.unmount());
  });

  it('takes the button away with the plugin that ships it', async () => {
    const { container, root } = await mount(
      <Harness plugins={[WindowFramePlugin]} height={200} />,
    );

    expect(container.textContent).not.toContain('Bring your own Agent');

    await act(async () => root.unmount());
  });

  it('shows the title it is given', async () => {
    const { container, root } = await mount(
      <Harness
        plugins={[WindowFramePlugin]}
        title={<span>Loop</span>}
        height={200}
      />,
    );

    expect(container.textContent).toContain('Loop');

    await act(async () => root.unmount());
  });
});

describe('how tall the frame stands', () => {
  it('fills what it was given when no height is set', async () => {
    const { container, root } = await mount(
      <Harness plugins={[WindowFramePlugin]} />,
    );

    // A full-page host sets the height on whatever wraps the frame; the body
    // then takes what the title bar leaves, rather than the host subtracting
    // the bar's height in a `calc` that goes wrong when the bar gains a row.
    const frame = container.firstElementChild as HTMLElement;
    const style = window.getComputedStyle(frame);
    expect(style.display).toBe('flex');
    expect(style.flexDirection).toBe('column');

    await act(async () => root.unmount());
  });
});

describe('a frame drawn outside the workspace', () => {
  it('renders before any reactor exists', async () => {
    // How a host actually composes it: the frame wraps whatever builds the
    // reactor, so on the first render there is no platform at all. Reading the
    // actions slot used to throw here, and took the page with it.
    const { container, root } = await mount(
      <WindowFrame title={<span>Loop</span>} height={200}>
        <div>the workspace, still starting</div>
      </WindowFrame>,
    );

    expect(container.textContent).toContain('Loop');
    expect(container.textContent).toContain('the workspace, still starting');

    await act(async () => root.unmount());
  });
});
