// @vitest-environment jsdom
/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The header's view-mode toggle offers what its host places: every mode
 * unsaid, only the modes named otherwise — the Workspace's floating
 * assistant and sidebar — in the toggle's own order, the current one pressed.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import { ChatViewModeToggle } from '../header/ChatViewModeToggle';
import type { ChatViewMode } from '../../types/chat';

const mounted: Array<() => void> = [];
afterEach(() => {
  mounted.splice(0).forEach(unmount => unmount());
  document.body.innerHTML = '';
});

async function render(props: {
  value: ChatViewMode;
  onChange: (mode: ChatViewMode) => void;
  modes?: readonly ChatViewMode[];
}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ThemeProvider>
        <ChatViewModeToggle {...props} />
      </ThemeProvider>,
    );
  });
  mounted.push(() => act(() => root.unmount()));
}

const buttons = () =>
  [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[data-chat-view-mode-toggle] button',
    ),
  ].map(button => ({
    label: button.getAttribute('aria-label'),
    pressed: button.getAttribute('aria-pressed'),
    button,
  }));

describe('the view-mode toggle', () => {
  it('offers every mode when its host names none', async () => {
    await render({ value: 'sidebar', onChange: () => {} });
    expect(buttons().map(entry => entry.label)).toEqual([
      'Full-height popup',
      'Floating popup',
      'Floating draggable',
      'Floating assistant',
      'Sidebar panel',
    ]);
  });

  it('offers only the modes named, in its own order, the current one pressed', async () => {
    await render({
      value: 'sidebar',
      onChange: () => {},
      modes: ['sidebar', 'assistant'],
    });
    expect(buttons().map(entry => [entry.label, entry.pressed])).toEqual([
      ['Floating assistant', 'false'],
      ['Sidebar panel', 'true'],
    ]);
  });

  it('says which mode was picked', async () => {
    const onChange = vi.fn();
    await render({
      value: 'sidebar',
      onChange,
      modes: ['assistant', 'sidebar'],
    });
    await act(async () => {
      buttons()[0].button.click();
    });
    expect(onChange).toHaveBeenCalledWith('assistant');
  });
});
