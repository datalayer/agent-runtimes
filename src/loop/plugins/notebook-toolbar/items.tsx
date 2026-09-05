/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the notebook's own toolbar shows: what it is running on.
 *
 * A notebook toolbar knows how to save, run and interrupt; it does not know
 * whether a kernel is attached, whether it is busy, or which one it is — and
 * that is the first thing someone looks for when a cell does not run.
 *
 * Kept out of the plugin's entry point because this module reaches
 * `@datalayer/jupyter-react` for the indicator, and the entry point is loaded
 * with the shell.
 *
 * @module loop/plugins/notebook-toolbar/items
 */

import type { JSX } from 'react';
import type { ToolbarItem } from '@datalayer/primer-addons';
import {
  KernelIndicator,
  NOTEBOOK_TOOLBAR_ITEM_ORDERS,
  useNotebookStore,
} from '@datalayer/jupyter-react';

/** Trailing edge of the toolbar: past the last item the notebook contributes. */
const KERNEL_INDICATOR_ORDER = NOTEBOOK_TOOLBAR_ITEM_ORDERS.cellType + 100;

/**
 * The kernel indicator for one notebook.
 *
 * A component rather than a value captured when the item was built, because a
 * notebook gets its kernel *after* its toolbar first renders — the adapter is
 * registered, then the kernel is attached, then it connects. Reading the store
 * from inside the render means each of those steps reaches the indicator; a
 * kernel captured at build time would stay `null` and the light would sit at
 * an unknown state forever.
 */
function NotebookKernelIndicator({
  notebookId,
}: {
  notebookId: string;
}): JSX.Element {
  const notebookStore = useNotebookStore();
  const kernel =
    notebookStore.selectNotebookAdapter(notebookId)?.kernel ?? null;

  return (
    <KernelIndicator
      kernel={kernel}
      // Borderless: the toolbar already draws the frame around it.
      bordered={false}
    />
  );
}

/**
 * The standard notebook toolbar items.
 *
 * Pushed to the trailing edge by a spacer, because the indicator reports
 * rather than acts: the buttons are what a person reaches for, and a status
 * light sitting among them reads like one more thing to press.
 */
export function notebookToolbarItems(notebookId: string): ToolbarItem[] {
  return [
    {
      key: 'loop-kernel-indicator-spacer',
      type: 'spacer',
      order: KERNEL_INDICATOR_ORDER - 1,
    },
    {
      key: 'loop-kernel-indicator',
      type: 'custom',
      order: KERNEL_INDICATOR_ORDER,
      group: 'kernel',
      render: () => <NotebookKernelIndicator notebookId={notebookId} />,
    },
  ];
}

export default notebookToolbarItems;
