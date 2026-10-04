/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `visible_when` (LOOP C-03): any block of a surface drawn by Datalayer's
 * renderer is shown only while what it names holds, and appears and goes as
 * the data changes; the basic catalog alone refuses the key.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { basicCatalog } from '@a2ui/react/v0_9';
import { MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import {
  InlineSurface,
  SURFACE_CATALOG_ID,
} from '../../../loop/plugins/a2ui-surface/InlineSurface';
import { VISIBLE_WHEN, datalayerCatalog, isShown } from '..';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const messages = (data: Record<string, unknown>): A2uiMessage[] =>
  [
    {
      version: 'v0.9',
      createSurface: { surfaceId: 's', catalogId: SURFACE_CATALOG_ID },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: 's',
        components: [
          {
            id: 'root',
            component: 'Column',
            children: ['always', 'never', 'chosen', 'items'],
          },
          { id: 'always', component: 'Text', text: 'Always here' },
          {
            id: 'never',
            component: 'Text',
            text: 'Never here',
            [VISIBLE_WHEN]: false,
          },
          {
            id: 'chosen',
            component: 'Text',
            text: 'Something is chosen',
            [VISIBLE_WHEN]: { path: '/chosen' },
          },
          {
            id: 'items',
            component: 'List',
            children: { componentId: 'item', path: '/items' },
          },
          {
            id: 'item',
            component: 'Text',
            text: { path: 'name' },
            [VISIBLE_WHEN]: { path: 'isChosen' },
          },
        ],
      },
    },
    {
      version: 'v0.9',
      updateDataModel: { surfaceId: 's', path: '/', value: data },
    },
  ] as A2uiMessage[];

describe('visible_when', () => {
  it('is shown while the value is true or not empty', () => {
    for (const value of [true, 'chosen', 1, ['a'], { a: 1 }]) {
      expect(isShown(value), JSON.stringify(value)).toBe(true);
    }
    for (const value of [false, '', 0, null, undefined, []]) {
      expect(isShown(value), JSON.stringify(value)).toBe(false);
    }
  });

  it('is declared on every component, under the basic catalog id', () => {
    expect(datalayerCatalog.id).toBe(basicCatalog.id);
    expect([...datalayerCatalog.components.keys()]).toEqual([
      ...basicCatalog.components.keys(),
    ]);
    for (const component of datalayerCatalog.components.values()) {
      const shape = (component.schema as { shape: Record<string, unknown> })
        .shape;
      expect(VISIBLE_WHEN in shape, component.name).toBe(true);
    }
  });

  it('is refused by the basic catalog alone, accepted by Datalayer’s', () => {
    expect(() =>
      new MessageProcessor([basicCatalog]).processMessages(messages({})),
    ).toThrow(/visible_when/);
    expect(() =>
      new MessageProcessor([datalayerCatalog]).processMessages(messages({})),
    ).not.toThrow();
  });

  it('shows a block, in a template too, only while its condition holds', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const items = [
      { name: 'Alpha', isChosen: '' },
      { name: 'Beta', isChosen: 'chosen' },
    ];
    await act(async () =>
      root.render(
        <InlineSurface
          messages={messages({ chosen: '', items })}
          onAction={() => undefined}
        />,
      ),
    );
    // The first render shows the loading state; content follows.
    await act(async () => undefined);
    const text = () => container.textContent ?? '';
    expect(text()).toContain('Always here');
    expect(text()).not.toContain('Never here');
    expect(text()).not.toContain('Something is chosen');
    expect(text()).toContain('Beta');
    expect(text()).not.toContain('Alpha');

    await act(async () =>
      root.render(
        <InlineSurface
          messages={messages({ chosen: '', items })}
          onAction={() => undefined}
          data={{ '/chosen': 'Beta', '/items/0/isChosen': 'chosen' }}
        />,
      ),
    );
    expect(text()).toContain('Something is chosen');
    expect(text()).toContain('Alpha');

    await act(async () =>
      root.render(
        <InlineSurface
          messages={messages({ chosen: '', items })}
          onAction={() => undefined}
          data={{ '/chosen': '', '/items/0/isChosen': 'chosen' }}
        />,
      ),
    );
    expect(text()).not.toContain('Something is chosen');
    await act(async () => root.unmount());
  });
});
