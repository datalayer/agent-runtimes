/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A code editor: CodeMirror 6 with the JSON, YAML or Python grammar, in
 * Primer's colours — what the Composer writes an Appspec and an `app.py` in.
 *
 * Controlled from the outside like a text input — `value` in, `onChange`
 * out — so a host can put a fresh document in it (an agent rewrote the spec,
 * a Revert) without the editor losing its own state for a keystroke. A
 * change that arrives while the document already reads that way is a no-op,
 * which is what keeps typing from fighting the host's echo; and, as an input
 * does, the editor never says back as a change what the host put in it — a
 * page that only opened would otherwise hold an edit nobody made.
 *
 * @module apps/composer/CodeEditor
 */

import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import { Annotation, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { python } from '@codemirror/lang-python';
import { basicSetup } from 'codemirror';
import { Box } from '@datalayer/primer-addons';

export type CodeEditorProps = {
  value: string;
  /** The person's change; read only, there is none. */
  onChange?: (value: string) => void;
  /** CSS height of the editor; it scrolls inside. */
  height?: string;
  ariaLabel?: string;
  readOnly?: boolean;
  /** The grammar: JSON unless said, YAML — an application's spec — or Python, its `app.py`. */
  language?: 'json' | 'yaml' | 'python';
  /**
   * What the editor knows besides the grammar — completion, hover, lint.
   * Read when the editor is built: pass a stable value.
   */
  extensions?: readonly Extension[];
};

/** Primer's tokens, so the editor follows the page's colour mode. */
const primerTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '12px',
    backgroundColor: 'var(--bgColor-default, #ffffff)',
    color: 'var(--fgColor-default, #1f2328)',
  },
  '.cm-scroller': {
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    lineHeight: '1.5',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bgColor-muted, #f6f8fa)',
    color: 'var(--fgColor-muted, #59636e)',
    borderRight: '1px solid var(--borderColor-default, #d1d9e0)',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: 'var(--bgColor-neutral-muted, rgba(175, 184, 193, 0.2))',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--bgColor-accent-muted, #ddf4ff)',
  },
});

const NO_EXTENSIONS: readonly Extension[] = [];

/** A document the host put in the editor: not a change of the person's. */
const fromHost = Annotation.define<boolean>();

export const CodeEditor = ({
  value,
  onChange,
  height = '400px',
  ariaLabel,
  readOnly = false,
  language = 'json',
  extensions = NO_EXTENSIONS,
}: CodeEditorProps): JSX.Element => {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // The latest handler, read at dispatch time: the view is built once.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current) {
      return undefined;
    }
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        language === 'yaml'
          ? yaml()
          : language === 'python'
            ? python()
            : json(),
        primerTheme,
        ...extensions,
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of(update => {
          if (
            update.docChanged &&
            !update.transactions.some(transaction =>
              transaction.annotation(fromHost),
            )
          ) {
            onChangeRef.current?.(update.state.doc.toString());
          }
        }),
      ],
    });
    const created = new EditorView({ state, parent: host.current });
    if (ariaLabel) {
      created.contentDOM.setAttribute('aria-label', ariaLabel);
    }
    view.current = created;
    return () => {
      created.destroy();
      view.current = null;
    };
    // Built once; `value` is fed through the effect below afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, language, extensions]);

  useEffect(() => {
    const current = view.current;
    if (!current) {
      return;
    }
    const shown = current.state.doc.toString();
    if (shown !== value) {
      current.dispatch({
        changes: { from: 0, to: shown.length, insert: value },
        annotations: fromHost.of(true),
      });
    }
  }, [value]);

  return (
    <Box
      ref={host}
      overflow="hidden"
      border="1px solid"
      borderColor="border.default"
      borderRadius={2}
      sx={{
        height,
        '& .cm-editor': { height: '100%' },
      }}
    />
  );
};

export default CodeEditor;
