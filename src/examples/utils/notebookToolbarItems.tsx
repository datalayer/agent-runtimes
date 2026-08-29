/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The toolbar every notebook example shows: the kernel indicator, in the
 * colours of the theme the reader picked.
 *
 * A notebook toolbar knows how to save, run and interrupt; it does not know
 * what it is running *on*, and someone reading an example wants to see that —
 * whether a kernel is attached, whether it is busy, what it is. `NotebookToolbar`
 * takes `extraItems` for exactly this, and its own docstring names the kernel
 * indicator as the case.
 *
 * The examples app lets a reader change theme, and until now the notebook was
 * the one part of the page that ignored them: a themed shell around a toolbar
 * on Primer's stock canvas. Its background takes the theme's brand colour now,
 * which is also what makes the picker legible — you can see what a theme
 * *does*. The controls themselves stay stock.
 *
 * One toolbar, built once here, so every notebook example shows the same thing
 * in the same place rather than each growing its own.
 *
 * @module examples/utils/notebookToolbarItems
 */

import { useEffect, useMemo } from 'react';
import type { ToolbarItem } from '@datalayer/primer-addons';
import {
  KernelIndicator,
  NOTEBOOK_TOOLBAR_ITEM_ORDERS,
  NotebookToolbar,
  useNotebookStore,
  type INotebookToolbarProps,
} from '@datalayer/jupyter-react';
import { useThemeBrandColor } from './themedProvider';

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
 * A colour at an opacity, whatever notation it was written in.
 *
 * Theme brand colours are hex, and mixing hex by hand is three lines of
 * parsing; `color-mix` does it for any notation and is the fallback for
 * anything that is not a plain `#rrggbb`.
 */
function tint(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!hex) {
    return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
  }
  const digits =
    hex[1].length === 3
      ? hex[1]
          .split('')
          .map(digit => digit + digit)
          .join('')
      : hex[1];
  const value = parseInt(digits, 16);
  // eslint-disable-next-line no-bitwise
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/** The one stylesheet holding the toolbar's themed background. */
const TOOLBAR_THEME_STYLE_ID = 'dla-example-notebook-toolbar-theme';

/**
 * Paint the notebook toolbars in the theme's colour.
 *
 * Through a stylesheet rather than a wrapper element, and that is not a
 * stylistic preference — a wrapper is a bug here. `Notebook` renders the
 * toolbar as a direct child of `#dla-Jupyter-Notebook`, a box of *fixed*
 * height, and the toolbar keeps itself to one line by measuring the room it
 * has with a `ResizeObserver` on itself **and on its parent**. Wrap it and the
 * parent becomes a box whose height follows its content: the toolbar
 * re-lays-out, the wrapper resizes, the observer fires, the toolbar
 * re-lays-out — a render loop with no end. Styling it in place leaves the
 * parent exactly as the notebook built it.
 *
 * Only the background is themed. The controls keep Primer's own colours: they
 * are the things a person presses, and a toolbar whose buttons change hue with
 * a theme picker reads as decoration rather than as controls.
 */
function useThemedToolbarBackground(brandColor: string): void {
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    let style = document.getElementById(
      TOOLBAR_THEME_STYLE_ID,
    ) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = TOOLBAR_THEME_STYLE_ID;
      document.head.appendChild(style);
    }
    // Scoped to the notebook's own container, so nothing else in the examples
    // app picks the colour up by accident.
    style.textContent = `
      #dla-Jupyter-Notebook > [role='toolbar'] {
        background: ${tint(brandColor, 0.09)};
        border-bottom: 1px solid ${tint(brandColor, 0.24)};
      }
    `;
  }, [brandColor]);
}

/**
 * The toolbar every notebook example uses.
 *
 * `NotebookToolbar` with the kernel indicator added — passed as the
 * `Toolbar` prop of `Notebook`, which hands it the notebook's id.
 *
 * Examples pass this rather than assembling the items themselves, so the
 * indicator appears in the same place with the same behaviour in all of them,
 * over a background in the colour of the theme the reader chose.
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

  useThemedToolbarBackground(useThemeBrandColor());

  return (
    <NotebookToolbar notebookId={notebookId} extraItems={items} {...rest} />
  );
}

export default useKernelIndicatorToolbarItems;
