/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** The panel's live notebook, given the in-memory notebook's cells once it mounts. */

import { useEffect } from 'react';
import { notebookStore } from '@datalayer/jupyter-react';
import { PAGE_NOTEBOOK_VIEW_ID, pageNotebook } from './memoryNotebook';

export function usePageNotebookMirror(): void {
  useEffect(() => {
    let attached: unknown;
    let stop: (() => void) | undefined;
    const attach = () => {
      const live = notebookStore
        .getState()
        .notebooks.get(PAGE_NOTEBOOK_VIEW_ID)?.adapter;
      if (!live || live === attached) {
        return;
      }
      stop?.();
      attached = live;
      stop = pageNotebook().attach(live as never);
    };
    attach();
    const unsubscribe = notebookStore.subscribe(attach);
    return () => {
      unsubscribe();
      stop?.();
    };
  }, []);
}
