/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-composer-portal` — how the application is built,
 * from its chat (the user, 21 November 2026: "a reactor plugin to show in a
 * full screen portal the composer (canvas, spec, python) … the plugin will
 * add a new button to the agent toolbar").
 *
 * One button in the chat's toolbar (its `toolbar` placement: beside the
 * prompt in a Loop workspace, the input toolbar in `Chat`; or its title bar,
 * `header`). Pressed, a full-screen dialog opens over the page — its title
 * names the application, Escape and its close button close it, the focus is
 * held inside it and goes back to the button after — and shows what the
 * Studio's *Composer* tab shows of the application: its Canvas, its spec and
 * its Python, read only. Nobody edits from here: a visitor owns nothing, and
 * the Studio is where an application is changed.
 *
 * The application is the workspace's (`LoopApplication`, the Appspec its
 * renderer draws) or, in a `Chat` outside a workspace, its agent's, as the
 * Personal page draws it (`agentAppspec`). What fills the dialog is its
 * host's when the host has one (`LoopSlots.composerView`: Datalayer's pages
 * contribute the Studio's own Canvas, spec and Python), otherwise this
 * plugin's own spec and Python (`ComposerSource`). The dialog's code loads
 * on the first press, not with the chat.
 *
 * Nothing in it needs a connection of the person's: an anonymous visitor
 * has it.
 *
 * @module apps/plugins/composer-portal
 */

import type { JSX } from 'react';
import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { IconButton } from '@primer/react';
import { StackIcon } from '@primer/octicons-react';
import { useOptionalReactorPlatform } from '@datalayer/reactor/react';
import type { AppSpec } from '../../../types/agentspecs';
import { LoopApplication } from '../../core';
import {
  defineChromePlugin,
  type ChromeComponentProps,
} from '../../toolCards/chrome';
import { COMPOSER_PORTAL_WORDS } from './words';

export { COMPOSER_PORTAL_WORDS } from './words';

export const COMPOSER_PORTAL_PLUGIN_NAME =
  '@datalayer/loop-plugin-composer-portal';

const NO_SUBSCRIPTION = () => () => undefined;

/**
 * The Appspec the workspace draws (`LoopApplication`), or none: outside a
 * workspace — a `Chat` — there is no platform, and nothing is read.
 */
export function useWorkspaceApplication(): AppSpec | undefined {
  const platform = useOptionalReactorPlatform();
  const revision = useSyncExternalStore(
    platform ? platform.subscribe : NO_SUBSCRIPTION,
    () => (platform ? platform.getRevision() : -1),
  );
  return useMemo(
    () => platform?.getContributions(LoopApplication)[0]?.value.app,
    // `revision` is the snapshot: the contributions are rebuilt on each call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [platform, revision],
  );
}

/** Loaded on the first press, not with the chat. */
const ComposerPortal = lazy(() => import('./ComposerPortal'));

/**
 * The toolbar's button, and the dialog it opens. Nothing drawn where there
 * is no application to show: no workspace's, no agent's.
 */
export function ComposerPortalButton({
  agentSpecId,
}: Partial<ChromeComponentProps>): JSX.Element | null {
  const application = useWorkspaceApplication();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  if (!application && !agentSpecId) {
    return null;
  }
  return (
    <>
      <IconButton
        ref={button}
        icon={StackIcon}
        aria-label={COMPOSER_PORTAL_WORDS.open}
        aria-haspopup="dialog"
        aria-expanded={open}
        variant="invisible"
        size="small"
        onClick={() => setOpen(true)}
        data-composer-portal-open=""
      />
      {open ? (
        <Suspense fallback={null}>
          <ComposerPortal
            application={application}
            agentSpecId={agentSpecId}
            returnFocusRef={button}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      ) : null}
    </>
  );
}

/** The plugin for a placement: `toolbar` (its default) or `header`. */
export const composerPortalPlugin = defineChromePlugin({
  id: 'composer-portal',
  displayName: 'Composer',
  description:
    'A button in the chat’s toolbar that opens the application’s Composer full screen: its Canvas, its spec and its Python, read only.',
  octicon: 'stack',
  emoji: '\u{1F9F1}',
  Component: ComposerPortalButton,
});

export const ComposerPortalPlugin = composerPortalPlugin('toolbar');

export default ComposerPortalPlugin;
