/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The code editor is controlled like an input: what the host puts in it is
 * shown, never said back as a change — an application's page that only opened
 * held an edit nobody made, its spec dropped — and what
 * the person types is.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EditorView } from '@codemirror/view';

vi.mock('@datalayer/primer-addons', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@datalayer/primer-addons',
  );
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    Box: react.forwardRef(
      (
        {
          sx: _sx,
          children,
          borderColor: _b,
          borderRadius: _r,
          overflow: _o,
          border: _d,
          ...rest
        }: any,
        ref: any,
      ) => react.createElement('div', { ...rest, ref }, children),
    ),
  };
});

import { CodeEditor } from '../composer/CodeEditor';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('the code editor, controlled like an input', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const view = (): EditorView => {
    const dom = host.querySelector('.cm-editor') as HTMLElement;
    return EditorView.findFromDOM(dom)!;
  };

  it('shows what the host puts in it without saying it back as a change', () => {
    const onChange = vi.fn();
    act(() =>
      root.render(
        <CodeEditor
          language="yaml"
          value={'name: one\n'}
          onChange={onChange}
        />,
      ),
    );
    expect(view().state.doc.toString()).toBe('name: one\n');
    act(() =>
      root.render(
        <CodeEditor
          language="yaml"
          value={'name: "one"\n'}
          onChange={onChange}
        />,
      ),
    );
    expect(view().state.doc.toString()).toBe('name: "one"\n');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('says what the person types', () => {
    const onChange = vi.fn();
    act(() =>
      root.render(
        <CodeEditor
          language="yaml"
          value={'name: one\n'}
          onChange={onChange}
        />,
      ),
    );
    act(() => view().dispatch({ changes: { from: 9, insert: ' # mine' } }));
    expect(onChange).toHaveBeenCalledWith('name: one # mine\n');
  });
});
