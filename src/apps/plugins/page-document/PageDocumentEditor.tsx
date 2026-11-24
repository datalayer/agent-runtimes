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
  bindPageDocumentKernel,
  mirror,
  pageDocumentEditor,
  pageDocumentViewId,
} from './memoryDocument';
import { usePageDocumentServices } from './usePageDocumentServices';
import { pageKernelToolbarItems } from './PageKernelIndicator';

/**
 * Mirror the conversation's in-memory document into the view's editor once
 * it registers, and into the next one if the view's editor is drawn again.
 */
function useMirror(conversation = ''): void {
  useEffect(() => {
    const viewId = pageDocumentViewId(conversation);
    let stop: (() => void) | undefined;
    let mirrored: LexicalEditor | undefined;
    let cancelled = false;
    const attach = async () => {
      const view = lexicalStore.getState().lexicals.get(viewId)
        ?.adapter?.editor;
      if (!view || view === mirrored) {
        return;
      }
      mirrored = view;
      const memory = await pageDocumentEditor(conversation);
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
  }, [conversation]);
}

export default function PageDocumentEditor({
  conversation = '',
}: {
  /** The conversation whose document it mirrors (`conversationScope`). */
  conversation?: string;
}): JSX.Element {
  useMirror(conversation);
  // Its Jupyter cells run on the workspace's kernel, or in this browser (a
  // public demo); its text is drawn at once either way (withoutRuntime).
  // The in-memory document the agent's tools write runs on the same one.
  const { source, services } = usePageDocumentServices();
  useEffect(() => {
    void bindPageDocumentKernel(services, conversation);
  }, [services, conversation]);
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
      documentId={pageDocumentViewId(conversation)}
      autoFocus={false}
      showToolbar
      // The conversation's document needs no runtime to be read and edited.
      withoutRuntime
    />
  );
}
