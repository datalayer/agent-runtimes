/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The model of a notebook drawn on the page, as it stands now: read from
 * jupyter-react's notebook store by the id the notebook was drawn under.
 *
 * Its adapter exposes the notebook through `notebook` (the widget) and
 * `panel`, both getters, so the model is read through those accessors.
 *
 * @module chat/notebook/liveNotebookModel
 */

import type { INotebookContent } from '@jupyterlab/nbformat';
import { notebookStore } from '@datalayer/jupyter-react';

type ModelHolder = { model?: { toJSON?: () => unknown } | null };

/** The live model of the notebook drawn as `notebookId`; null when none is. */
export function liveNotebookModel(notebookId: string): INotebookContent | null {
  const notebook = notebookStore.getState().selectNotebook(notebookId);
  const adapter = notebook?.adapter as
    { notebook?: ModelHolder; panel?: { content?: ModelHolder } } | undefined;
  const model =
    adapter?.notebook?.model ?? adapter?.panel?.content?.model ?? null;
  const json = model?.toJSON?.() as INotebookContent | undefined;
  return json && Array.isArray(json.cells) ? json : null;
}
