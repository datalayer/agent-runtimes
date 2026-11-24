/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The conversation's document in a side-panel tab: an editor that mirrors
 * the in-memory document the agent's tools write (`memoryDocument`), so the
 * person reads and edits the same document, and closing the tab loses
 * nothing.
 */

import { useEffect, type JSX } from 'react';
import { lexicalStore } from '@datalayer/jupyter-lexical';
import { EphemeralDocument } from '../../../chat/document/EphemeralDocument';
import { usePageKernel } from '../../pageTools/usePageKernel';
import {
  PAGE_DOCUMENT_VIEW_ID,
  mirror,
  pageDocumentEditor,
} from './memoryDocument';

/** Mirror the in-memory document into the view's editor once it registers. */
function useMirror(): void {
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    const attach = async () => {
      const view = lexicalStore.getState().lexicals.get(PAGE_DOCUMENT_VIEW_ID)
        ?.adapter?.editor;
      if (!view || stop) {
        return;
      }
      const memory = await pageDocumentEditor();
      if (!cancelled && !stop) {
        stop = mirror(memory, view);
      }
    };
    void attach();
    const unsubscribe = lexicalStore.subscribe(() => void attach());
    return () => {
      cancelled = true;
      unsubscribe();
      stop?.();
    };
  }, []);
}

export default function PageDocumentEditor(): JSX.Element {
  useMirror();
  // Its Jupyter cells run on the workspace's kernel, or in this browser (a
  // public demo); its text is drawn at once either way (withoutRuntime).
  const kernel = usePageKernel();
  return (
    <EphemeralDocument
      serviceManager={kernel.serviceManager}
      kernelId={kernel.kernelId}
      runtimeOverride={kernel.runtimeOverride}
      inheritTheme
      documentId={PAGE_DOCUMENT_VIEW_ID}
      autoFocus={false}
      showToolbar
      // The conversation's document needs no runtime to be read and edited.
      withoutRuntime
    />
  );
}
