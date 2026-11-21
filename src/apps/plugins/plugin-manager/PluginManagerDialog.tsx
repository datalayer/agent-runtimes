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

export type PluginManagerDialogProps = {
  onClose: () => void;
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
}: PluginManagerDialogProps): JSX.Element {
  const platform = useOptionalReactorPlatform();
  return (
    <Dialog
      title={PLUGIN_MANAGER_WORDS.title}
      subtitle={PLUGIN_MANAGER_WORDS.subtitle}
      onClose={() => onClose()}
      width="large"
      position={{ narrow: 'fullscreen', regular: 'center', wide: 'center' }}
      returnFocusRef={returnFocusRef as RefObject<HTMLElement> | undefined}
    >
      <Box data-plugin-manager-dialog="" minHeight={240}>
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
