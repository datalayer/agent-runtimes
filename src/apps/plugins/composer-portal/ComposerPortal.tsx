/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Composer's full-screen dialog (`apps/plugins/composer-portal`): Primer's
 * `Dialog` — its title naming the application, its subtitle saying what is
 * shown, Escape and its close button closing it, the focus held inside and
 * given back to the button — drawn over the whole page, in a portal under
 * `<body>`, so that no card the chat sits in holds it.
 *
 * What fills it is its host's (`LoopSlots.composerView`, given the Appspec)
 * when the host has contributed one, else the view its host handed through
 * `ComposerViewProvider`, otherwise `ComposerSource`.
 *
 * @module apps/plugins/composer-portal/ComposerPortal
 */

import type { JSX, RefObject } from 'react';
import { useContext, useMemo } from 'react';
import { Dialog } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { useOptionalSlotComponents } from '@datalayer/reactor/react';
import { getAgentspecs } from '../../../specs/agents';
import type { AppSpec } from '../../../types/agentspecs';
import { agentAppspec } from '../../Application';
import { LoopSlots } from '../../core';
import { COMPOSER_PORTAL_WORDS } from './words';
import { ComposerViewContext } from './context';
import { ComposerSource } from './ComposerSource';

/** The application shown: the workspace's, else the chat's agent as an application. */
export function composedApplication(
  application: AppSpec | undefined,
  agentSpecId: string | undefined,
): AppSpec | undefined {
  if (application) {
    return application;
  }
  const spec = agentSpecId ? getAgentspecs(agentSpecId) : undefined;
  return spec ? agentAppspec(spec) : undefined;
}

/** The whole viewport, whatever the width: Primer's `fullscreen` is a phone's only. */
const FULL_SCREEN = {
  '&&': {
    width: '100vw',
    height: '100dvh',
    maxWidth: '100vw',
    maxHeight: '100dvh',
    borderRadius: 0,
  },
} as const;

export function ComposerPortal({
  application,
  agentSpecId,
  returnFocusRef,
  onClose,
}: {
  application?: AppSpec;
  agentSpecId?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
}): JSX.Element | null {
  const app = useMemo(
    () => composedApplication(application, agentSpecId),
    [application, agentSpecId],
  );
  // The host's own Composer, when it contributed one (a Loop workspace's).
  const views = useOptionalSlotComponents(LoopSlots.composerView);
  // Else the one its host handed through the context (a `Chat` outside a workspace).
  const HostView = useContext(ComposerViewContext);
  if (!app) {
    return null;
  }
  return (
    <Dialog
      title={COMPOSER_PORTAL_WORDS.title(app.name || app.id)}
      subtitle={COMPOSER_PORTAL_WORDS.subtitle}
      onClose={() => onClose()}
      position={{ narrow: 'fullscreen', regular: 'center', wide: 'center' }}
      returnFocusRef={returnFocusRef as RefObject<HTMLElement> | undefined}
      sx={FULL_SCREEN}
    >
      <Box data-composer-portal={app.id} minHeight="60vh">
        {views.length > 0 ? (
          views.map(entry => {
            const View = entry.Component as (props: {
              app: AppSpec;
            }) => JSX.Element | null;
            return <View key={`${entry.slot}:${entry.id}`} app={app} />;
          })
        ) : HostView ? (
          <HostView app={app} />
        ) : (
          <ComposerSource app={app} />
        )}
      </Box>
    </Dialog>
  );
}

export default ComposerPortal;
