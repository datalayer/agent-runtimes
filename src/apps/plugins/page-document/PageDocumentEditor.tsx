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

import { useEffect, useMemo, useState, type JSX } from 'react';
import type { LexicalEditor } from 'lexical';
import type { IKernelConnection } from '@jupyterlab/services/lib/kernel/kernel';
import { lexicalStore } from '@datalayer/jupyter-lexical';
import { EphemeralDocument } from '../../../chat/document/EphemeralDocument';
import {
  PAGE_DOCUMENT_VIEW_ID,
  bindPageDocumentKernel,
  mirror,
  pageDocumentEditor,
} from './memoryDocument';
import { usePageDocumentServices } from './usePageDocumentServices';
import { pageKernelToolbarItems } from './PageKernelIndicator';

/**
 * Mirror the in-memory document into the view's editor once it registers,
 * and into the next one if the view's editor is drawn again.
 */
function useMirror(): void {
  useEffect(() => {
    let stop: (() => void) | undefined;
    let mirrored: LexicalEditor | undefined;
    let cancelled = false;
    const attach = async () => {
      const view = lexicalStore.getState().lexicals.get(PAGE_DOCUMENT_VIEW_ID)
        ?.adapter?.editor;
      if (!view || view === mirrored) {
        return;
      }
      mirrored = view;
      const memory = await pageDocumentEditor();
      if (cancelled || mirrored !== view) {
        return;
      }
      stop?.();
      stop = mirror(memory, view);
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
  // The in-memory document the agent's tools write runs on the same one.
  const { source, services } = usePageDocumentServices();
  useEffect(() => {
    void bindPageDocumentKernel(services);
  }, [services]);
  const [connection, setConnection] = useState<IKernelConnection | null>(null);
  const toolbarExtraItems = useMemo(
    () => pageKernelToolbarItems(source, connection),
    [source, connection],
  );
  return (
    <EphemeralDocument
      serviceManager={services?.serviceManager}
      kernelId={services?.kernelId}
      awaitingKernel={!services}
      onKernelChange={setConnection}
      toolbarExtraItems={toolbarExtraItems}
      inheritTheme
      documentId={PAGE_DOCUMENT_VIEW_ID}
      autoFocus={false}
      showToolbar
      // The conversation's document needs no runtime to be read and edited.
      withoutRuntime
    />
  );
}
