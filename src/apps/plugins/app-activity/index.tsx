/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-app-activity` — what an application did, as a
 * plugin (LOOP R-01b, R-15): its activity feed in the workspace's sidebar
 * (`LoopSlots.sidebar`), read from its record.
 *
 * @module apps/plugins/app-activity
 */

import type { JSX } from 'react';
import { definePlugin, type ReactorPlugin } from '@datalayer/reactor';
import { PulseIcon } from '@primer/octicons-react';
import type { AppSpec } from '../../../types/agentspecs';
import { LoopSlots } from '../../core';
import { AppActivity } from './AppActivity';

export const APP_ACTIVITY_PLUGIN_NAME = '@datalayer/loop-plugin-app-activity';

/**
 * The plugin that lists what an application did: its record is kept under
 * its `app` item (`appUid`); without one — an application not saved on
 * Datalayer — the feed says it is recorded once it is.
 */
export function defineAppActivityPlugin(
  app: AppSpec,
  appUid?: string,
): ReactorPlugin<Record<string, never>, unknown, unknown> {
  // One component per plugin: the slot keeps it, and the application with it.
  function Feed(): JSX.Element {
    return <AppActivity appUid={appUid} />;
  }
  const plugin = definePlugin({
    name: `${APP_ACTIVITY_PLUGIN_NAME}-${app.id}`,
    displayName: `${app.name}: activity`,
    description: `What ${app.name} did, session by session, from its record.`,
    octicon: 'pulse',
    build: () => ({
      components: [
        {
          id: 'app-activity',
          slot: LoopSlots.sidebar,
          order: 20,
          Component: Feed,
          // Its line icon on the workspace's rail (T-07).
          rail: { label: 'Activity', icon: PulseIcon },
        },
      ],
    }),
  });
  return plugin as unknown as ReactorPlugin<
    Record<string, never>,
    unknown,
    unknown
  >;
}

export { AppActivity, APP_ACTIVITY_WORDS } from './AppActivity';
export default defineAppActivityPlugin;
