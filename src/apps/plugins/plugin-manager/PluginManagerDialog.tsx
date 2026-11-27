/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The plugins manager's dialog (`apps/plugins/plugin-manager`): Primer's
 * `Dialog` — titled, Escape and its close button closing it, the focus held
 * inside and given back to the button — over the page, holding Reactor's own
 * `PluginsManagerView` (`@datalayer/reactor-manager`): the filter, a row per
 * plugin, a switch each calling `reactor.enable` / `reactor.disable`. The
 * list is Reactor's, not written again here.
 *
 * The platform is the one the page registered (Reactor's store, global by
 * design: a dialog in a portal reads it like any slot). With none, the
 * dialog says so rather than throwing.
 *
 * @module apps/plugins/plugin-manager/PluginManagerDialog
 */

import type { JSX, RefObject } from 'react';
import { Dialog, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { useOptionalReactorPlatform } from '@datalayer/reactor/react';
import { PluginsManagerView } from '@datalayer/reactor-manager';
import {
  PLUGIN_MANAGER_HIDDEN,
  PLUGIN_MANAGER_PROTECTED,
  PLUGIN_MANAGER_WORDS,
} from './words';

/** Primer's named dialog widths: 296, 320, 480 and 640px... up to 960px. */
export type PluginManagerNamedWidth = 'small' | 'medium' | 'large' | 'xlarge';

/**
 * How wide the dialog is: one of Primer's named widths, or a CSS length
 * (`'80vw'`, `'1100px'`, or a number of pixels), never wider than the window
 * less 32px.
 */
export type PluginManagerWidth = PluginManagerNamedWidth | string | number;

/** The dialog's width when none is said: Primer's widest, 960px. */
export const PLUGIN_MANAGER_DEFAULT_WIDTH: PluginManagerNamedWidth = 'xlarge';

const NAMED_WIDTHS: readonly string[] = ['small', 'medium', 'large', 'xlarge'];

/** Primer's `width` and the `sx` that gives a CSS length, for a width. */
export function pluginManagerDialogWidth(width: PluginManagerWidth): {
  width: PluginManagerNamedWidth;
  sx?: Record<string, string>;
} {
  if (typeof width === 'string' && NAMED_WIDTHS.includes(width)) {
    return { width: width as PluginManagerNamedWidth };
  }
  const length = typeof width === 'number' ? `${width}px` : width;
  return {
    width: PLUGIN_MANAGER_DEFAULT_WIDTH,
    sx: { width: length, maxWidth: 'calc(100vw - 32px)' },
  };
}

export type PluginManagerDialogProps = {
  onClose: () => void;
  /**
   * How wide: Primer's `'small' | 'medium' | 'large' | 'xlarge'` or a CSS
   * length (`'80vw'`, `1100`). `'xlarge'` (960px) unless said.
   */
  width?: PluginManagerWidth;
  /** Where the focus goes back to: the button that opened it. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Switches fixed on, beside the defaults (`PLUGIN_MANAGER_PROTECTED`). */
  protectedPlugins?: readonly string[];
  /** Plugins left out, beside the defaults (`PLUGIN_MANAGER_HIDDEN`). */
  hiddenPlugins?: readonly string[];
};

export function PluginManagerDialog({
  onClose,
  returnFocusRef,
  protectedPlugins = [],
  hiddenPlugins = [],
  width = PLUGIN_MANAGER_DEFAULT_WIDTH,
}: PluginManagerDialogProps): JSX.Element {
  const platform = useOptionalReactorPlatform();
  const sized = pluginManagerDialogWidth(width);
  return (
    <Dialog
      title={PLUGIN_MANAGER_WORDS.title}
      subtitle={PLUGIN_MANAGER_WORDS.subtitle}
      onClose={() => onClose()}
      width={sized.width}
      sx={sized.sx}
      position={{ narrow: 'fullscreen', regular: 'center', wide: 'center' }}
      returnFocusRef={returnFocusRef as RefObject<HTMLElement> | undefined}
    >
      {/* The dialog's body scrolls; this box does not, or the list has two scrollbars. */}
      <Box data-plugin-manager-dialog="" minHeight={360}>
        {platform ? (
          <PluginsManagerView
            protectedPlugins={[
              ...PLUGIN_MANAGER_PROTECTED,
              ...protectedPlugins,
            ]}
            hiddenPlugins={[...PLUGIN_MANAGER_HIDDEN, ...hiddenPlugins]}
          />
        ) : (
          <Text as="p" sx={{ color: 'fg.muted' }}>
            {PLUGIN_MANAGER_WORDS.none}
          </Text>
        )}
      </Box>
    </Dialog>
  );
}

export default PluginManagerDialog;
