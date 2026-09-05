/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the document editor holds before anyone types.
 *
 * A heading, a paragraph and a Jupyter cell that has already run — the same
 * small analysis the opening notebook shows, so the two editors open on one
 * story. It exists for the same reason the notebook's opening cell does: an
 * empty editor shows what the editor is, and a short document shows what it is
 * *for* — prose and live code on one page, the output already there.
 *
 * Serialised Lexical state, as `EphemeralDocument` loads it. The cell is the
 * pair the slash menu's "Jupyter Cell" inserts — a `jupyter-input` holding the
 * code and a `jupyter-output` holding what it printed, tied by one uuid. The
 * code is stored already tokenised, the way the editor's own highlighter
 * stores it after a keystroke: a loaded state runs no transforms, so code
 * handed over as plain text would sit unhighlighted until somebody typed in
 * it. The same Prism grammar the highlighter uses does the tokenising here.
 * The output is what this code prints, from a real run: a fabricated output
 * on a page asking to be trusted is a lie told at the worst possible moment.
 *
 * @module loop/plugins/document/openingDocument
 */

import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import {
  OPENING_FRAME_REPR,
  OPENING_SOURCE,
} from '../notebook/openingNotebook';

export const OPENING_DOCUMENT_TITLE = 'Quarterly revenue by region';

export const OPENING_DOCUMENT_PARAGRAPH =
  'Six rows of revenue, two quarters, three regions. The cell below loads them and ' +
  'shows the frame; run it, change it, or ask an agent to take it further — the ' +
  'code and its output live in this document, beside the words about them.';

const INPUT_UUID = 'opening-document-input';
const OUTPUT_UUID = 'opening-document-output';

const text = (content: string): SerializedLexicalNode =>
  ({
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
    text: content,
    type: 'text',
    version: 1,
  }) as SerializedLexicalNode;

const block = (
  type: string,
  children: SerializedLexicalNode[],
  extra: Record<string, unknown> = {},
): SerializedLexicalNode =>
  ({
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    type,
    version: 1,
    ...extra,
  }) as SerializedLexicalNode;

const LINE_BREAK = { type: 'linebreak', version: 1 } as SerializedLexicalNode;

/** One run of code as the highlighter stores it: text, and the token type it is. */
const highlight = (
  content: string,
  highlightType?: string,
): SerializedLexicalNode =>
  ({
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
    text: content,
    type: 'jupyter-input-highlight',
    version: 1,
    highlightType,
  }) as SerializedLexicalNode;

/**
 * Prism's tokens as highlight nodes — the same walk `@datalayer/jupyter-lexical`
 * makes when it tokenises a code block, so what is stored here is what the
 * editor would have stored itself.
 */
const tokenNodes = (
  tokens: (string | Prism.Token)[],
): SerializedLexicalNode[] =>
  tokens.flatMap(token => {
    if (typeof token === 'string') {
      return token
        .split('\n')
        .flatMap((part, index) => [
          ...(index > 0 ? [LINE_BREAK] : []),
          ...(part.length > 0 ? [highlight(part)] : []),
        ]);
    }
    const { content, type } = token;
    if (typeof content === 'string') {
      return [highlight(content, type)];
    }
    if (Array.isArray(content)) {
      return content.length === 1 && typeof content[0] === 'string'
        ? [highlight(content[0], type)]
        : tokenNodes(content as (string | Prism.Token)[]);
    }
    return [];
  });

/** The code, tokenised; plain lines only if the grammar is somehow missing. */
const codeNodes = (source: string): SerializedLexicalNode[] => {
  const grammar = Prism.languages.python;
  if (grammar) {
    return tokenNodes(Prism.tokenize(source, grammar));
  }
  return source
    .split('\n')
    .flatMap((line, index) => [
      ...(index > 0 ? [LINE_BREAK] : []),
      ...(line.length > 0 ? [highlight(line)] : []),
    ]);
};

/** The opening document, built fresh: the editor keeps what it is handed. */
export function openingDocument(): SerializedEditorState {
  const source = OPENING_SOURCE.join('');
  return {
    root: {
      children: [
        block('heading', [text(OPENING_DOCUMENT_TITLE)], { tag: 'h1' }),
        block('paragraph', [text(OPENING_DOCUMENT_PARAGRAPH)], {
          textFormat: 0,
          textStyle: '',
        }),
        block('jupyter-input', codeNodes(source), {
          language: 'python',
          jupyterInputNodeUuid: INPUT_UUID,
        }),
        {
          type: 'jupyter-output',
          version: 1,
          format: '',
          source,
          outputs: [
            {
              output_type: 'execute_result',
              execution_count: 1,
              data: { 'text/plain': OPENING_FRAME_REPR },
              metadata: {},
            },
          ],
          jupyterInputNodeUuid: INPUT_UUID,
          jupyterOutputNodeUuid: OUTPUT_UUID,
        } as unknown as SerializedLexicalNode,
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  } as SerializedEditorState;
}

export default openingDocument;
