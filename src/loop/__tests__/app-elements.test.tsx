/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The side panel and the pages an application's code opens (LOOP P-18):
 * drawn from what the chat keeps, each with its own Close, nothing drawn
 * while nothing is open, a button sent to the application's action.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyLoopElement,
  clearLoopElements,
} from '../../chat/base/loopElement';
import type { LoopWorkspaceContext } from '../core';
import { AppElements, elementsByPlace } from '../plugins/app-elements';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOG =
  'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';

/** What the session API sends: an answer's surface, under the element's id. */
function shows(id: string, title: string, text: string) {
  const surfaceId = `answer-${id}`;
  return {
    surfaceId,
    catalogId: CATALOG,
    title,
    messages: [
      { version: 'v0.9', createSurface: { surfaceId, catalogId: CATALOG } },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId,
          components: [
            { id: 'root', component: 'Column', children: ['t'] },
            { id: 't', component: 'Text', text },
          ],
        },
      },
    ],
  };
}

afterEach(() => {
  act(() => clearLoopElements());
  document.body.replaceChildren();
});

async function mounted(send = vi.fn()) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const workspace = {
    viewControls: { send },
  } as unknown as LoopWorkspaceContext;
  await act(async () => root.render(<AppElements workspace={workspace} />));
  return { container, root };
}

describe('the side panel and the pages', () => {
  it('draw nothing while nothing is open', async () => {
    const { container, root } = await mounted();
    expect(container.innerHTML).toBe('');
    await act(async () => root.unmount());
  });

  it('draw a panel and a page where they belong, each closed by its own button', async () => {
    const { container, root } = await mounted();
    await act(async () => {
      applyLoopElement({
        id: 'runs',
        where: 'panel',
        title: 'Runs',
        shows: shows('runs', 'Runs', 'Two runs'),
      });
      applyLoopElement({
        id: 'report',
        where: 'page',
        title: 'The report',
        shows: shows('report', 'The report', 'All good'),
      });
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    const aside = container.querySelector('aside[aria-label="Side panel"]');
    expect(aside?.textContent).toContain('Runs');
    expect(aside?.textContent).toContain('Two runs');
    const page = container.querySelector('[role="dialog"]');
    expect(page?.getAttribute('aria-label')).toBe('The report');
    expect(page?.textContent).toContain('All good');
    // Its Close, named for it (Primer names an icon button by its tooltip).
    const close = page?.querySelector('button') as HTMLButtonElement;
    const named =
      close.getAttribute('aria-label') ??
      document.getElementById(close.getAttribute('aria-labelledby') ?? '')
        ?.textContent;
    expect(named).toBe('Close The report');
    await act(async () => close.click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('aside')).not.toBeNull();
    await act(async () => applyLoopElement({ id: 'runs', closed: true }));
    expect(container.innerHTML).toBe('');
    await act(async () => root.unmount());
  });

  it('show the last page opened, and the panels in the order they opened', () => {
    const element = (id: string, where: 'panel' | 'page') => ({
      id,
      where,
      title: id,
      shows: null,
    });
    const placed = elementsByPlace([
      element('a', 'panel'),
      element('p1', 'page'),
      element('b', 'panel'),
      element('p2', 'page'),
    ]);
    expect(placed.panels.map(e => e.id)).toEqual(['a', 'b']);
    expect(placed.page?.id).toBe('p2');
  });
});
