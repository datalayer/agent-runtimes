/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A page composed for the conversation alone: the Canvas says
 * agent-runtimes' sentence and offers the fix, the layout set to `page`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@datalayer/primer-addons', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@datalayer/primer-addons',
  );
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    Box: ({ sx: _sx, children, ...rest }: any) =>
      react.createElement('div', rest, children),
  };
});

vi.mock('@primer/react', async () => {
  const actual =
    await vi.importActual<Record<string, unknown>>('@primer/react');
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    Flash: ({ sx: _sx, variant: _variant, children, ...rest }: any) =>
      react.createElement('div', rest, children),
    Text: ({ sx: _sx, children, ...rest }: any) =>
      react.createElement('span', rest, children),
    Button: ({ size: _size, children, ...rest }: any) =>
      react.createElement('button', rest, children),
  };
});

import { surfaceUnshown } from '../plugins/app-page/appPageModel';
import { getApp } from '../../specs/apps';
import type { AppLayout, AppSpec } from '../../types/agentspecs';
import type { AppDraft } from '../composer/draft';
import { layoutUnshown, withLayout } from '../composer/appLayout';
import { AppLayoutUnshown } from '../composer/AppLayoutUnshown';

/** Support desk, a chat with a page composed on the Canvas, laid out as said. */
const desk = (layout: AppLayout): AppDraft => {
  const spec = getApp('support-desk') as AppSpec;
  return {
    spec: { ...spec, interface: { ...spec.interface, layout } },
  } as unknown as AppDraft;
};

describe('a page composed for the conversation alone', () => {
  it('is said in agent-runtimes’ sentence, and not once it has a page', () => {
    const unshown = desk('chat');
    expect(layoutUnshown(unshown)).toBe(surfaceUnshown(unshown.spec!));
    expect(layoutUnshown(unshown)).toMatch(/layout is chat.*page or split/);
    expect(layoutUnshown(desk('page'))).toBeNull();
    expect(layoutUnshown(desk('split'))).toBeNull();
    // The catalogue's Support desk shows the page it composes.
    expect(
      layoutUnshown({ spec: getApp('support-desk') } as unknown as AppDraft),
    ).toBeNull();
  });

  it('is fixed by laying it out as a page, the rest of the spec untouched', () => {
    const unshown = desk('chat');
    const fixed = withLayout(unshown, 'page');
    expect(fixed.spec!.interface.layout).toBe('page');
    expect(layoutUnshown(fixed)).toBeNull();
    expect({
      ...fixed.spec!,
      interface: { ...fixed.spec!.interface, layout: 'chat' },
    }).toEqual(unshown.spec);
  });

  describe('on the Canvas', () => {
    let host: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
      host = document.createElement('div');
      document.body.appendChild(host);
      root = createRoot(host);
    });

    afterEach(() => {
      act(() => root.unmount());
      host.remove();
    });

    it('says it and offers the page in one click', () => {
      const onChange = vi.fn();
      act(() =>
        root.render(
          <AppLayoutUnshown definition={desk('chat')} onChange={onChange} />,
        ),
      );
      expect(host.textContent).toContain(
        'Its page is composed but its layout is chat',
      );
      act(() => host.querySelector('button')!.click());
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0].spec.interface.layout).toBe('page');
    });

    it('says nothing when the page is shown', () => {
      act(() =>
        root.render(
          <AppLayoutUnshown definition={desk('page')} onChange={vi.fn()} />,
        ),
      );
      expect(host.textContent).toBe('');
    });
  });
});
