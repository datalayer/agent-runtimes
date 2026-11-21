/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-plugin-manager` — the plugins of the page, from a
 * button (the user, 21 November 2026: "reactor has a plugin plugin-manager to
 * list, enable, disable the plugins of the reactor app - add that plugin as a
 * footer menu ... when user will click on that icon the overlay will be
 * shown", then "all our apps should render with that plugin").
 *
 * A wrapper of Reactor's plugins manager (`@datalayer/reactor-manager`):
 * that plugin fills a `sidebar` slot, and a chat's footer is not one. This
 * one places a plug button in the chat's footer (`footer`, `loop.status` in
 * a Loop workspace; or its title bar, `header`) and, pressed, opens a dialog
 * holding Reactor's own `PluginsManagerView` — the list is Reactor's. The
 * button and the dialog are exported besides, for a host to draw them
 * itself (Datalayer's sidebar footer does).
 *
 * The platform listed is the one the page runs (Reactor's store): in a Loop
 * workspace, the workspace's. Nothing is drawn where no platform runs — so
 * a `Chat` outside a workspace has no such button. The dialog's code loads
 * on the first press, not with the chat. This button's plugin, the Loop's
 * sidebar panel and Reactor's manager are fixed on in the list.
 *
 * Every application has it unless its spec leaves it out
 * (`interface.plugin_manager_disabled`, `drawnUiOf`). Needs no connection:
 * an anonymous visitor has it.
 *
 * @module apps/plugins/plugin-manager
 */

import type { JSX, RefObject } from 'react';
import { lazy, Suspense, useRef, useState } from 'react';
import { IconButton } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { PlugIcon } from '@primer/octicons-react';
import { useOptionalReactorPlatform } from '@datalayer/reactor/react';
import {
  defineChromePlugin,
  type ChromeComponentProps,
} from '../../toolCards/chrome';
import { PLUGIN_MANAGER_WORDS } from './words';

export {
  PLUGIN_MANAGER_HIDDEN,
  PLUGIN_MANAGER_PLUGIN_NAME,
  PLUGIN_MANAGER_PROTECTED,
  PLUGIN_MANAGER_WORDS,
} from './words';
export type { PluginManagerDialogProps } from './PluginManagerDialog';

/** Loaded on the first press, not with the chat. */
export const LazyPluginManagerDialog = lazy(
  () => import('./PluginManagerDialog'),
);

/**
 * The dialog, its code fetched when first drawn: for a host drawing its own
 * button (Datalayer's sidebar footer).
 */
export function PluginManagerOverlay(props: {
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  protectedPlugins?: readonly string[];
  hiddenPlugins?: readonly string[];
}): JSX.Element {
  return (
    <Suspense fallback={null}>
      <LazyPluginManagerDialog {...props} />
    </Suspense>
  );
}

/**
 * The plug button, and the dialog it opens. Nothing drawn where no platform
 * runs.
 */
export function PluginManagerButton({
  placement,
}: Partial<ChromeComponentProps>): JSX.Element | null {
  const platform = useOptionalReactorPlatform();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  if (!platform) {
    return null;
  }
  const control = (
    <>
      <IconButton
        ref={button}
        icon={PlugIcon}
        aria-label={PLUGIN_MANAGER_WORDS.open}
        aria-haspopup="dialog"
        aria-expanded={open}
        variant="invisible"
        size="small"
        onClick={() => setOpen(true)}
        data-plugin-manager-open=""
      />
      {open ? (
        <PluginManagerOverlay
          returnFocusRef={button}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
  // In the footer, a row of its own: the status line stacks its items.
  return placement === 'footer' ? (
    <Box
      display="flex"
      justifyContent="flex-end"
      alignItems="center"
      px={2}
      py={1}
      data-plugin-manager-footer=""
    >
      {control}
    </Box>
  ) : (
    control
  );
}

/** The plugin for a placement: `footer` (its default) or `header`. */
export const pluginManagerPlugin = defineChromePlugin({
  id: 'plugin-manager',
  displayName: 'Plugins',
  description:
    'A plug button in the chat’s footer that opens the plugins manager in a dialog over the page: every plugin of the application’s platform, filtered by name, each with a switch to turn it off and back on while the application runs.',
  octicon: 'plug',
  emoji: '\u{1F50C}',
  Component: PluginManagerButton,
});

export const PluginManagerPlugin = pluginManagerPlugin('footer');

export default PluginManagerPlugin;
