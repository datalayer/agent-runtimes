/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The conversation's document lives in memory (the user, 24 November 2026:
 * "create a notebook and document fails"): the document tools write it with
 * no panel shown, and the panel's editor mirrors it both ways.
 */

import { describe, expect, it } from 'vitest';
import { PageDocumentPlugin } from '../plugins/page-document';
import {
  PAGE_DOCUMENT_ID,
  mirror,
  pageDocumentEditor,
} from '../plugins/page-document/memoryDocument';
import { lexicalStore } from '@datalayer/jupyter-lexical';
import { PAGE_DOCUMENT_TOOL_NAMES } from '../plugins/page-document';
import { createLexicalTools } from '../../tools/adapters/agent-runtimes/lexicalHooks';

void PageDocumentPlugin;

const toolNamed = (part: string) => {
  const tools = createLexicalTools(PAGE_DOCUMENT_ID);
  const flat = (name: string) => name.toLowerCase().replace(/_/g, '');
  const tool = tools.find(t => flat(t.name).includes(flat(part)));
  if (!tool?.handler)
    throw new Error(
      `no ${part} tool among ${tools.map(t => t.name).join(', ')}`,
    );
  return tool;
};

describe('the page document, in memory', () => {
  it('is registered on the first call, with no panel', async () => {
    expect(PAGE_DOCUMENT_TOOL_NAMES.length).toBeGreaterThan(0);
    const editor = await pageDocumentEditor();
    expect(
      lexicalStore.getState().lexicals.get(PAGE_DOCUMENT_ID)?.adapter?.editor,
    ).toBe(editor);
  });

  it('takes a heading and a paragraph from the tools and reads them back', async () => {
    await pageDocumentEditor();
    const insert = toolNamed('insert_block');
    await insert.handler!({
      type: 'heading',
      source: 'Quarterly report',
      afterId: 'BOTTOM',
      properties: { tag: 'h1' },
    });
    await insert.handler!({
      type: 'paragraph',
      source: 'Revenue grew.',
      afterId: 'BOTTOM',
    });
    const read = toolNamed('read_all_blocks');
    const out = JSON.stringify(await read.handler!({}));
    expect(out).toContain('Quarterly report');
    expect(out).toContain('Revenue grew.');
  });

  it('mirrors into the panel editor and back', async () => {
    const memory = await pageDocumentEditor();
    const { buildEditorFromExtensions } = await import('@lexical/extension');
    const { defineExtension, $getRoot } = await import('lexical');
    const { JupyterLexicalExtension } =
      await import('@datalayer/jupyter-lexical');
    const { ReactPluginHostExtension } =
      await import('@lexical/react/ReactPluginHostExtension');
    const view = buildEditorFromExtensions(
      defineExtension({
        name: 'test-view',
        namespace: 'test-view',
        dependencies: [ReactPluginHostExtension, JupyterLexicalExtension],
      }),
    );
    const stop = mirror(memory, view);
    const text = (e: typeof memory) =>
      e.getEditorState().read(() => $getRoot().getTextContent());
    expect(text(view)).toContain('Quarterly report');
    // The person's edit in the panel reaches the agent's document.
    const { $createParagraphNode, $createTextNode } = await import('lexical');
    view.update(
      () => {
        $getRoot().append(
          $createParagraphNode().append($createTextNode('Edited by a person.')),
        );
      },
      { discrete: true },
    );
    expect(text(memory)).toContain('Edited by a person.');
    stop();
  });
});
