/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `LoopEmbed` starts the platform it builds.
 *
 * `LoopWorkspace` starts a reactor only when it is managing one, and the embed
 * tells it not to — the reactor is the embed's, and a shell that stopped it on
 * unmount would be stopping somebody else's. Registering without starting
 * leaves every plugin inactive, so nothing contributes a view and the
 * workspace draws "No view is available yet" — which is what a host embedding
 * Loop saw.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { LoopEmbed } from '../embed/LoopEmbed';

describe('the embed', () => {
  it('brings a view up rather than reporting none', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<LoopEmbed target="browser" agentId="a" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('No view is available yet');

    await act(async () => root.unmount());
  });
});

describe('the palette, through the preset', () => {
  it('is off unless a host asks for it', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<LoopEmbed target="browser" agentId="a" />);
    });

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(
      document.querySelector('[role="dialog"][aria-label="Command palette"]'),
    ).toBeNull();

    await act(async () => root.unmount());
  });

  it('opens on Ctrl-K when it does', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<LoopEmbed target="browser" agentId="a" commandPalette />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // The whole chain the landing page depends on: the preset mounts the
    // loop's adapter, which pulls in the generic palette, which contributes to
    // the `root` slot the shell renders. A break anywhere in it looks the
    // same from outside — the browser keeps the keystroke.
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(
      document.querySelector('[role="dialog"][aria-label="Command palette"]'),
    ).not.toBeNull();

    await act(async () => root.unmount());
  });
});
