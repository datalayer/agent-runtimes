/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Python editor of an application written in Python: its `app.py`, as
 * `agent apps push` keeps it beside its Appspec, in a code editor — a line
 * asked for (a link of the Canvas, where its code decides something) marked
 * and brought into view.
 *
 * Controlled: the host holds the text and is handed each change; without
 * `onChange` the editor is read only. What is done with the file — run it
 * where it builds its application, eject an application into one, open it
 * elsewhere — is the host's: its controls go in `actions`, drawn under the
 * editor, and what they said in `children`.
 *
 * @module apps/composer/AppPythonEditor
 */

import type { JSX, ReactNode } from 'react';
import { useMemo } from 'react';
import { Text } from '@primer/react';
import { Decoration, EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { Box } from '@datalayer/primer-addons';
import { CodeEditor } from './CodeEditor';
import { askedLine, type AppCodeFile } from './appCode';

/** The line asked for, marked in the attention colour and scrolled into view once. */
export function markedLine(line: number | null): Extension[] {
  if (line === null) {
    return [];
  }
  const mark = Decoration.line({
    attributes: {
      style: 'background-color: var(--bgColor-attention-muted)',
      'data-marked-line': String(line),
    },
  });
  return [
    EditorView.decorations.compute([], state =>
      line <= state.doc.lines
        ? Decoration.set([mark.range(state.doc.line(line).from)])
        : Decoration.none,
    ),
    EditorView.updateListener.of(update => {
      if (!update.view.dom.dataset.marked && line <= update.state.doc.lines) {
        update.view.dom.dataset.marked = 'yes';
        const { from } = update.state.doc.line(line);
        update.view.dispatch({
          effects: EditorView.scrollIntoView(from, { y: 'center' }),
        });
      }
    }),
  ];
}

export type AppPythonEditorProps = {
  /** The file: its name, and its text as it was last kept. */
  code: AppCodeFile;
  /** The text shown, when the host holds a change of it; else the file's. */
  value?: string;
  /** A change of the person's. Without one, read only. */
  onChange?: (text: string) => void;
  /** Read only, even with an `onChange`: while the host runs it. */
  readOnly?: boolean;
  /** The line to mark and show, as an address asks for it (`?line=12`). */
  line?: string | number | null;
  /** What is said above the editor; nothing when absent. */
  says?: ReactNode;
  /** What the host draws between what is said and the editor: where it runs, say. */
  toolbar?: ReactNode;
  /** The host's controls, under the editor: run it, open it elsewhere. */
  actions?: ReactNode;
  /** What the host says under its controls: what running it built, say. */
  children?: ReactNode;
  /** CSS height of the editor; it scrolls inside. */
  height?: string;
};

export function AppPythonEditor({
  code,
  value,
  onChange,
  readOnly = false,
  line = null,
  says,
  toolbar,
  actions,
  children,
  height = '520px',
}: AppPythonEditorProps): JSX.Element {
  const marked = askedLine(code, line === null ? null : String(line));
  const extensions = useMemo(() => markedLine(marked), [marked]);
  return (
    <Box
      display="flex"
      flexDirection="column"
      sx={{ gap: 2 }}
      data-app-python-editor={code.file}
    >
      {says ? (
        <Text as="p" sx={{ m: 0 }}>
          {says}
        </Text>
      ) : null}
      {toolbar}
      <CodeEditor
        language="python"
        extensions={extensions}
        value={value ?? code.text}
        height={height}
        readOnly={readOnly || !onChange}
        ariaLabel={code.file}
        onChange={onChange}
      />
      {actions ? (
        <Box display="flex" alignItems="center" flexWrap="wrap" sx={{ gap: 2 }}>
          {actions}
        </Box>
      ) : null}
      {children}
    </Box>
  );
}

export default AppPythonEditor;
