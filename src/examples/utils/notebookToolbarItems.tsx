/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The kernel indicator, as a notebook toolbar item.
 *
 * A notebook toolbar knows how to save, run and interrupt; it does not know
 * what it is running *on*, and someone reading an example wants to see that —
 * whether a kernel is attached, whether it is busy, what it is. `NotebookToolbar`
 * takes `extraItems` for exactly this, and its own docstring names the kernel
 * indicator as the case.
 *
 * One item, built once here, so every notebook example shows the same thing in
 * the same place rather than each growing its own.
 *
 * @module examples/utils/notebookToolbarItems
 */

import { useMemo } from 'react';
import type { ToolbarItem } from '@datalayer/primer-addons';
import {
  KernelIndicator,
  NOTEBOOK_TOOLBAR_ITEM_ORDERS,
  NotebookToolbar,
  useNotebookStore,
  type INotebookToolbarProps,
} from '@datalayer/jupyter-react';

/** Trailing edge of the toolbar: past the last item the notebook contributes. */
const KERNEL_INDICATOR_ORDER = NOTEBOOK_TOOLBAR_ITEM_ORDERS.cellType + 100;

/**
 * The kernel indicator for one notebook.
 *
 * A component rather than a value captured in the toolbar item, because a
 * notebook gets its kernel *after* its toolbar first renders — the adapter is
 * registered, then the kernel is attached, then it connects. Reading the store
 * from inside the render means each of those steps reaches the indicator; a
 * kernel captured when the item was built would stay `null` and the indicator
 * would sit at an unknown state forever.
 */
function NotebookKernelIndicator({
  notebookId,
}: {
  notebookId: string;
}): JSX.Element {
  const notebookStore = useNotebookStore();
  // Subscribing to the store means every adapter/kernel/status change
  // re-renders this, which is what keeps the light honest.
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
 * A toolbar item showing the notebook's kernel.
 *
 * Pushed to the trailing edge by a spacer, because it reports rather than
 * acts: the buttons are what a person reaches for, and a status light sitting
 * among them reads like one more thing to press.
 *
 * @param notebookId Notebook whose kernel to show.
 */
export function useKernelIndicatorToolbarItems(
  notebookId: string,
): ToolbarItem[] {
  return useMemo(
    (): ToolbarItem[] => [
      {
        key: 'notebook-kernel-indicator-spacer',
        type: 'spacer',
        order: KERNEL_INDICATOR_ORDER - 1,
      },
      {
        key: 'notebook-kernel-indicator',
        type: 'custom',
        order: KERNEL_INDICATOR_ORDER,
        group: 'kernel',
        render: () => <NotebookKernelIndicator notebookId={notebookId} />,
      },
    ],
    [notebookId],
  );
}

/**
 * The toolbar every notebook example uses.
 *
 * `NotebookToolbar` with the kernel indicator added — passed as the
 * `Toolbar` prop of `Notebook`, which hands it the notebook's id.
 *
 * Examples pass this rather than assembling the items themselves, so the
 * indicator appears in the same place with the same behaviour in all of them.
 */
export function ExampleNotebookToolbar({
  notebookId,
  extraItems,
  ...rest
}: INotebookToolbarProps): JSX.Element {
  const kernelItems = useKernelIndicatorToolbarItems(notebookId);
  const items = useMemo(
    () => [...kernelItems, ...(extraItems ?? [])],
    [kernelItems, extraItems],
  );
  return (
    <NotebookToolbar notebookId={notebookId} extraItems={items} {...rest} />
  );
}

export default useKernelIndicatorToolbarItems;
