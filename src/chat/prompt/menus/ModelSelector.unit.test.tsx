/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The model menu's Decisions group: Jev shown, read-only.
 *
 * A typed-decision model answers a decision's questions, not a conversation:
 * its row says so and selects nothing.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ActionList } from '@primer/react';
import { describe, expect, it } from 'vitest';
import { DecisionsGroup } from './ModelSelector';
import type { Decisions } from '../../base/modelChoice';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const NOTE =
  "Answers a decision's typed questions (yes or no, a choice, a score); agents do not chat with it.";

async function render(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return { container, root };
}

const decisions = (isAvailable: boolean, reason?: string): Decisions => ({
  models: [
    {
      id: 'cloudflare:wrk/typesafe/jev',
      name: 'Jev (Cloudflare Workers AI)',
      isAvailable,
      ...(reason ? { unavailableReason: reason } : {}),
    },
  ],
  note: NOTE,
});

describe('the Decisions group', () => {
  it('lists Jev under its heading, with its sentence, and selects nothing', async () => {
    const { container, root } = await render(
      // As the menu draws it: an ActionMenu's list is a menu.
      <ActionList role="menu" selectionVariant="single">
        <DecisionsGroup decisions={decisions(true)} />
      </ActionList>,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Decisions');
    expect(text).toContain('Jev (Cloudflare Workers AI)');
    expect(text).toContain(NOTE);
    const item = [...container.querySelectorAll('li')].find(li =>
      li.textContent?.includes('Jev'),
    );
    expect(item).toBeDefined();
    // Read-only: disabled, never a selected option.
    const disabled = container.querySelector('[aria-disabled="true"]');
    expect(disabled?.textContent).toContain('Jev (Cloudflare Workers AI)');
    expect(container.querySelector('[aria-selected="true"]')).toBeNull();
    expect(container.querySelector('[aria-checked="true"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('says why it cannot be used, as the models above do', async () => {
    const { container, root } = await render(
      <ActionList role="menu">
        <DecisionsGroup decisions={decisions(false, 'No ai-inference token')} />
      </ActionList>,
    );
    expect(container.textContent).toContain(`No ai-inference token · ${NOTE}`);
    await act(async () => root.unmount());
  });
});
