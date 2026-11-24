/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The conversation's document, in memory (the user, 24 November 2026: "the
 * notebook and document tools ... should be able to manipulate in memory
 * documents"). The document tools act on a Lexical editor registered in
 * jupyter-lexical's store; that editor was the one the side panel mounts,
 * and a panel that was not shown (or waited for a runtime) left the tools
 * with no document. Here the document is an editor of its own, built with
 * the Jupyter Lexical nodes and no DOM, registered under `page-document`
 * from the first tool call. The panel shows and edits it (`useMirror`); it
 * is never needed for the tools to work.
 *
 * Loaded on the first call, not with the chat: the Jupyter Lexical
 * extension is heavy, and the embed's first load is budgeted.
 *
 * @module apps/plugins/page-document/memoryDocument
 */

import type { LexicalEditor } from 'lexical';

/** The id the tools and the store know the conversation's document by. */
export const PAGE_DOCUMENT_ID = 'page-document';

/** The id of the panel's editor, which mirrors it. */
export const PAGE_DOCUMENT_VIEW_ID = 'page-document-view';

let built: Promise<LexicalEditor> | undefined;

/** The in-memory document, built and registered once. */
export function pageDocumentEditor(): Promise<LexicalEditor> {
  built ??= (async () => {
    const [
      { buildEditorFromExtensions },
      { defineExtension },
      { ReactPluginHostExtension },
      lexical,
    ] = await Promise.all([
      import('@lexical/extension'),
      import('lexical'),
      import('@lexical/react/ReactPluginHostExtension'),
      import('@datalayer/jupyter-lexical'),
    ]);
    const editor = buildEditorFromExtensions(
      defineExtension({
        name: '@datalayer/agent-runtimes/page-document',
        namespace: PAGE_DOCUMENT_ID,
        // The extension's React parts (toolbars, pickers) are hosted by the
        // plugin host, never mounted: an in-memory document draws nothing.
        dependencies: [
          ReactPluginHostExtension,
          lexical.JupyterLexicalExtension,
        ],
        onError(error: Error) {
          console.error('[page-document]', error);
        },
      }),
    );
    lexical.registerLexicalState(editor, PAGE_DOCUMENT_ID);
    return editor;
  })();
  return built;
}

/** Tags an update carries so the two editors do not echo each other. */
const FROM_MEMORY = 'page-document-from-memory';
const FROM_VIEW = 'page-document-from-view';

/**
 * Keep the panel's editor and the in-memory document the same: the view
 * starts from the document, the document's changes reach the view, and the
 * person's edits in the view reach the document. Returns how to stop.
 */
export function mirror(memory: LexicalEditor, view: LexicalEditor): () => void {
  view.setEditorState(view.parseEditorState(memory.getEditorState().toJSON()), {
    tag: FROM_MEMORY,
  });
  const toView = memory.registerUpdateListener(({ editorState, tags }) => {
    if (tags.has(FROM_VIEW)) {
      return;
    }
    view.setEditorState(view.parseEditorState(editorState.toJSON()), {
      tag: FROM_MEMORY,
    });
  });
  const toMemory = view.registerUpdateListener(
    ({ editorState, tags, dirtyElements, dirtyLeaves }) => {
      if (
        tags.has(FROM_MEMORY) ||
        (dirtyElements.size === 0 && dirtyLeaves.size === 0)
      ) {
        return;
      }
      memory.setEditorState(memory.parseEditorState(editorState.toJSON()), {
        tag: FROM_VIEW,
      });
    },
  );
  return () => {
    toView();
    toMemory();
  };
}
