/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a spec editor is, whatever spec it edits: the
 * CodeMirror extensions that make the text answer as you write it —
 * the fields and values where the cursor is, what a field means
 * when you rest on it, every refusal underlined on its own line with a mark
 * in the gutter, and the line a check opened the editor at.
 *
 * One editor, three specs. The application's (`AppYamlEditor`), a scene's
 * and its stage pass their own completion, their own
 * hover and their own checks; everything a person feels — where the
 * underline falls, when the completion opens, what the tooltip looks like —
 * is here and is the same for all of them.
 *
 * Pure of the specs themselves: it knows nothing of an Appspec or a scene,
 * only how to ask.
 *
 * @module apps/composer/specEditing
 */

import {
  autocompletion,
  type CompletionContext,
} from '@codemirror/autocomplete';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { EditorView, ViewPlugin, hoverTooltip } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { lineOfProblem, type SpecCompletion } from './appSpecLanguage';

/** What the editor asks of the spec it edits. */
export type SpecEditing = {
  /** What may be written where the cursor is, and from which column. */
  completionsAt: (
    text: string,
    offset: number,
  ) => { from: number; options: SpecCompletion[] };
  /** What the key under the cursor means, or null. */
  hoverAt: (
    text: string,
    offset: number,
  ) => { from: number; to: number; text: string } | null;
  /** What stands in the way, in sentences, and what wants a decision. */
  checkOf: (text: string) => {
    problems: readonly string[];
    attention?: readonly string[];
  };
  /** A check to open at, on the line it is about; empty for none. */
  reveal?: string;
  /**
   * Told the editor's view once it exists: what an editor whose checks read
   * something besides the text needs, to check again when that changes
   * (`forceLinting`) rather than at the next keystroke.
   */
  onView?: (view: EditorView) => void;
};

/** How long after a keystroke the checks run again. */
export const CHECK_DELAY = 300;

/** Every sentence underlined on the line it is about, by `lineOfProblem`. */
function placed(
  view: EditorView,
  text: string,
  messages: readonly string[],
  severity: Diagnostic['severity'],
): Diagnostic[] {
  return messages.flatMap(message => {
    const number = lineOfProblem(text, message);
    if (number === null || number > view.state.doc.lines) {
      return [];
    }
    const line = view.state.doc.line(number);
    return [{ from: line.from, to: line.to, severity, message }];
  });
}

/**
 * The extensions of a spec editor: completion from the catalogues,
 * the meaning of a field on hover, every check underlined as it is typed
 *, and the line a check opened it at.
 */
export function specExtensions(editing: SpecEditing): Extension[] {
  return [
    // Opened from a check that stands in the way: at its line.
    ViewPlugin.define(view => {
      const number = editing.reveal
        ? lineOfProblem(view.state.doc.toString(), editing.reveal)
        : null;
      if (number !== null && number <= view.state.doc.lines) {
        const { from } = view.state.doc.line(number);
        window.setTimeout(() =>
          view.dispatch({
            selection: { anchor: from },
            effects: EditorView.scrollIntoView(from, { y: 'center' }),
          }),
        );
      }
      return {};
    }),
    autocompletion({
      override: [
        (context: CompletionContext) => {
          const { from, options } = editing.completionsAt(
            context.state.doc.toString(),
            context.pos,
          );
          if (
            !options.length ||
            (!context.explicit &&
              from === context.pos &&
              !context.matchBefore(/[:-]\s*$/))
          ) {
            return null;
          }
          return { from, options, validFor: /^[\w:.-]*$/ };
        },
      ],
    }),
    hoverTooltip((view: EditorView, pos: number) => {
      const hover = editing.hoverAt(view.state.doc.toString(), pos);
      if (!hover) {
        return null;
      }
      return {
        pos: hover.from,
        end: hover.to,
        above: true,
        create: () => {
          const dom = document.createElement('div');
          dom.textContent = hover.text;
          dom.style.maxWidth = '420px';
          dom.style.padding = '4px 8px';
          return { dom };
        },
      };
    }),
    linter(
      (view: EditorView): Diagnostic[] => {
        const text = view.state.doc.toString();
        const check = editing.checkOf(text);
        return [
          ...placed(view, text, check.problems, 'error'),
          ...placed(view, text, check.attention ?? [], 'warning'),
        ];
      },
      { delay: CHECK_DELAY },
    ),
    lintGutter(),
    ...(editing.onView
      ? [
          ViewPlugin.define(view => {
            editing.onView?.(view);
            return {};
          }),
        ]
      : []),
  ];
}
