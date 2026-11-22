/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Composer's text editors (`apps/composer`): the YAML editor reads its
 * text as an Appspec with the instant checks under it, hands a change with
 * what it reads as, and is read only without a change handler or with a
 * host's own reader; the Python editor draws an `app.py`, marks the line
 * asked for, and draws the host's controls and words around it.
 */

// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseStyles, ThemeProvider } from '@primer/react';
import { EditorView } from '@codemirror/view';
import { emptyAppspec } from '../apps/appspec';
import { writeAppspecYaml } from '../apps/yaml';
import { NOT_READY, PASSES } from '../apps/checks';
import { AppYamlEditor, readAppYaml } from '../composer/AppYamlEditor';
import { AppPythonEditor } from '../composer/AppPythonEditor';
import { draftOfAppspec } from '../composer/draft';
import { getApp } from '../../specs/apps';

afterEach(() => cleanup());

const themed = (node: React.ReactElement) => (
  <ThemeProvider>
    <BaseStyles>{node}</BaseStyles>
  </ThemeProvider>
);

/** The editor's view, to type into it as a person does. */
const viewIn = (container: HTMLElement): EditorView => {
  const dom = container.querySelector('.cm-editor') as HTMLElement;
  const view = EditorView.findFromDOM(dom);
  if (!view) {
    throw new Error('No editor drawn.');
  }
  return view;
};

const APP = writeAppspecYaml({
  ...emptyAppspec('chat'),
  id: 'desk',
  name: 'Desk',
  agent: 'datalayer-ai',
  instructions: 'Answer from the docs.',
});

describe('readAppYaml', () => {
  it('reads a text as its Appspec, with its instant checks', () => {
    const read = readAppYaml(APP);
    expect(read.app?.id).toBe('desk');
    expect(read.check.problems).toEqual(
      expect.not.arrayContaining([expect.stringMatching(/^Line \d+:/)]),
    );
  });

  it('gives no Appspec for a text YAML cannot read, and says where', () => {
    const read = readAppYaml('name: [unclosed\n');
    expect(read.app).toBeNull();
    expect(read.check.verdict).toBe(NOT_READY);
    expect(read.check.problems[0]).toMatch(/^Line \d+:/);
  });
});

describe('AppYamlEditor', () => {
  it('draws its text and the checks under it', () => {
    const { container } = render(themed(<AppYamlEditor value={APP} />));
    expect(container.textContent).toContain('id: desk');
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      readAppYaml(APP).check.verdict,
    );
  });

  it('hands a change of the person’s with what it reads as', () => {
    const onChange = vi.fn();
    const { container } = render(
      themed(<AppYamlEditor value={APP} onChange={onChange} />),
    );
    const view = viewIn(container);
    act(() => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: 'name: [' },
      });
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const [text, read] = onChange.mock.calls[0];
    expect(text).toBe('name: [');
    expect(read.app).toBeNull();
  });

  it('says nothing back of what its host put in it', () => {
    const onChange = vi.fn();
    const { rerender, container } = render(
      themed(<AppYamlEditor value={APP} onChange={onChange} />),
    );
    rerender(
      themed(
        <AppYamlEditor
          value={APP.replace('name: Desk', 'name: Help')}
          onChange={onChange}
        />,
      ),
    );
    expect(container.textContent).toContain('name: Help');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('checks with its host’s reader, and draws no checks when asked not to', () => {
    const read = vi.fn(() => ({
      app: null,
      check: {
        verdict: PASSES,
        problems: [],
        attention: [],
        setup: ['Connect it.'],
      },
    }));
    const { container, rerender } = render(
      themed(<AppYamlEditor value={APP} read={read as never} />),
    );
    expect(read).toHaveBeenCalledWith(APP);
    expect(container.textContent).toContain('To set up: Connect it.');
    rerender(themed(<AppYamlEditor value={APP} checks={false} />));
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});

describe('AppPythonEditor', () => {
  const code = {
    file: 'app.py',
    text: 'from loop import App\n\napp = App()\n',
  };

  it('draws the file, what its host says and its host’s controls', () => {
    const { container } = render(
      themed(
        <AppPythonEditor
          code={code}
          says="As it was last saved."
          toolbar={<span data-toolbar="" />}
          actions={<button type="button">Run it</button>}
        >
          <p data-said="">Built.</p>
        </AppPythonEditor>,
      ),
    );
    expect(
      container.querySelector('[data-app-python-editor="app.py"]'),
    ).toBeTruthy();
    expect(container.textContent).toContain('app = App()');
    expect(container.textContent).toContain('As it was last saved.');
    expect(container.querySelector('[data-toolbar]')).toBeTruthy();
    expect(container.querySelector('button')?.textContent).toBe('Run it');
    expect(container.querySelector('[data-said]')).toBeTruthy();
  });

  it('marks the line asked for, and none it does not have', () => {
    const { container, rerender } = render(
      themed(<AppPythonEditor code={code} line="3" />),
    );
    expect(container.querySelector('[data-marked-line="3"]')?.textContent).toBe(
      'app = App()',
    );
    rerender(themed(<AppPythonEditor code={code} line={40} />));
    expect(container.querySelector('[data-marked-line]')).toBeNull();
  });

  it('hands the text a person changes', () => {
    const onChange = vi.fn();
    const { container } = render(
      themed(<AppPythonEditor code={code} onChange={onChange} />),
    );
    const view = viewIn(container);
    act(() => {
      view.dispatch({ changes: { from: 0, insert: '# mine\n' } });
    });
    expect(onChange).toHaveBeenCalledWith(`# mine\n${code.text}`);
  });
});

describe('draftOfAppspec', () => {
  it('reads an Appspec as the editors read it: its spec, its page and its components', () => {
    const app = getApp('support-desk')!;
    const draft = draftOfAppspec(app);
    expect(draft.spec?.id).toBe('support-desk');
    expect(draft.interface?.components).toEqual(
      app.interface.surface?.components,
    );
    expect(draft.components).toEqual(app.interface.components);
  });
});
