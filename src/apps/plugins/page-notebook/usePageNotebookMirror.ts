/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The panel's live notebook, given the conversation's in-memory notebook's
 * cells (their outputs included) once it mounts.
 */

import { useEffect } from 'react';
import { notebookStore } from '@datalayer/jupyter-react';
import { pageNotebook, pageNotebookViewId } from './memoryNotebook';

export function usePageNotebookMirror(conversation = ''): void {
  useEffect(() => {
    let attached: unknown;
    let stop: (() => void) | undefined;
    const attach = () => {
      const live = notebookStore
        .getState()
        .notebooks.get(pageNotebookViewId(conversation))?.adapter;
      if (!live || live === attached) {
        return;
      }
      stop?.();
      attached = live;
      stop = pageNotebook(conversation).attach(live as never);
    };
    attach();
    const unsubscribe = notebookStore.subscribe(attach);
    return () => {
      unsubscribe();
      stop?.();
    };
  }, [conversation]);
}
