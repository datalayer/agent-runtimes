/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const editors = vi.hoisted(() => ({
  list: [] as { value: { surfaceId: string } }[],
}));
vi.mock('@datalayer/reactor/react', async importOriginal => ({
  ...(await importOriginal<object>()),
  useContributions: () => editors.list,
}));

import { ChatViewPlugin } from '../plugins/chat-view';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  const mounted = root;
  if (mounted) act(() => mounted.unmount());
  root = null;
});

function drawn(): HTMLElement {
  const output = ChatViewPlugin.build?.({
    config: {},
    reactor: {} as never,
    contribute: (() => {}) as never,
    state: {} as never,
  } as never) as {
    components: { Component: React.ComponentType }[];
  };
  const Icon = output.components[0].Component;
  const container = document.createElement('div');
  root = createRoot(container);
  act(() => root!.render(<Icon />));
  return container;
}

describe("the footer's 'Show the chat' (the user, 18 November 2026: clicking it did nothing)", () => {
  it('is not drawn while no editor is contributed: the chat is all there is', () => {
    editors.list = [];
    expect(drawn().querySelector('button')).toBeNull();
  });

  it('is drawn once an editor is, to come back to the chat from it', () => {
    editors.list = [{ value: { surfaceId: 'notebook' } }];
    expect(
      drawn().querySelector('button[data-component="IconButton"]'),
    ).not.toBeNull();
  });
});
