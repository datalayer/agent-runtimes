/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An editor and its Preview under one switch (AppEditorWithPreview): the
 * Python editor's *Eject · Preview* showed nothing on *Preview* (27 October
 * 2026). Its switch drew a `null` where *Python* is missing, and Primer's
 * SegmentedControl counts that slot in the index it reports — mirrored here
 * by `React.Children.map`, as Primer calls it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@datalayer/primer-addons', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@datalayer/primer-addons',
  );
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    Box: ({
      sx: _sx,
      display: _d,
      alignItems: _a,
      gap: _g,
      mb: _mb,
      flexWrap: _f,
      children,
      ...rest
    }: any) => react.createElement('div', rest, children),
  };
});

vi.mock('@primer/react', async () => {
  const actual =
    await vi.importActual<Record<string, unknown>>('@primer/react');
  const react = await vi.importActual<typeof import('react')>('react');
  // As Primer's: each child's index from React.Children.map, empty slots counted.
  const SegmentedControl = ({ children, onChange }: any) =>
    react.createElement(
      'div',
      { role: 'toolbar' },
      react.Children.map(children, (child: any, index: number) =>
        react.isValidElement(child)
          ? react.createElement(
              'button',
              {
                'aria-pressed': Boolean((child.props as any).selected),
                onClick: () => onChange(index),
              },
              (child.props as any).children,
            )
          : null,
      ),
    );
  SegmentedControl.Button = () => null;
  return {
    ...actual,
    SegmentedControl,
    Text: ({ sx: _sx, children, ...rest }: any) =>
      react.createElement('p', rest, children),
  };
});

import {
  AppEditorWithPreview,
  surfaceAt,
  surfacesOf,
} from '../composer/AppEditorWithPreview';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const button = (label: string): HTMLButtonElement =>
  [...host.querySelectorAll('button')].find(
    each => each.textContent === label,
  ) as HTMLButtonElement;

describe('an editor and its Preview, under one switch', () => {
  it('lists the surfaces there are, and names one by its index in that list', () => {
    expect(surfacesOf(false, true)).toEqual(['editor', 'preview']);
    expect(surfacesOf(true, true)).toEqual(['editor', 'python', 'preview']);
    expect(surfacesOf(true, false)).toEqual(['editor', 'python']);
    expect(surfaceAt(surfacesOf(false, true), 1)).toBe('preview');
    expect(surfaceAt(surfacesOf(false, true), 2)).toBe('editor');
  });

  it('shows the Preview of the Python editor, which has no Python tab of its own', () => {
    const editorTab = {
      label: 'Eject',
      icon: (() => null) as any,
      hint: 'Built from its spec.',
    };
    act(() =>
      root.render(
        <AppEditorWithPreview
          editorTab={editorTab}
          editor={<i>the file</i>}
          preview={<b>the preview</b>}
        />,
      ),
    );
    expect(
      [...host.querySelectorAll('button')].map(each => each.textContent),
    ).toEqual(['Eject', 'Preview']);
    act(() => button('Preview').click());
    const surface = host.querySelector('[data-editor-surface]') as HTMLElement;
    expect(surface.getAttribute('data-editor-surface')).toBe('preview');
    expect(button('Preview').getAttribute('aria-pressed')).toBe('true');
    expect((host.querySelector('b')!.parentElement as HTMLElement).hidden).toBe(
      false,
    );
    expect((host.querySelector('i')!.parentElement as HTMLElement).hidden).toBe(
      true,
    );
    act(() => button('Eject').click());
    expect(surface.getAttribute('data-editor-surface')).toBe('editor');
  });

  it('shows each of the YAML editor’s three', () => {
    act(() =>
      root.render(
        <AppEditorWithPreview
          editor={<i>yaml</i>}
          python={<u>file</u>}
          preview={<b>the preview</b>}
        />,
      ),
    );
    act(() => button('Python').click());
    expect(
      host
        .querySelector('[data-editor-surface]')
        ?.getAttribute('data-editor-surface'),
    ).toBe('python');
    act(() => button('Preview').click());
    expect(
      host
        .querySelector('[data-editor-surface]')
        ?.getAttribute('data-editor-surface'),
    ).toBe('preview');
  });
});
