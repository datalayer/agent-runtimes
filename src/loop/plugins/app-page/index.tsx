/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-app-page` — an application's page, as a plugin
 * (LOOP R-01, R-01b).
 *
 * A chat, a widget or a worker runs as its conversation; its page — its
 * A2UI surface, or the default page of its kind when none is composed — is
 * contributed as the editor beside the chat (`LoopEditorView`), the place a
 * notebook or a document takes in other workspaces. `AppRenderer` mounts it
 * for an application that has one (`hasAppPage`) and opens the chat on it.
 *
 * What the page shows and takes, by kind, is `APP_KIND_PATHS`.
 *
 * @module loop/plugins/app-page
 */

import type { JSX } from 'react';
import { BrowserIcon } from '@primer/octicons-react';
import {
  contribution,
  definePlugin,
  type ReactorPlugin,
} from '@datalayer/reactor';
import type { AppSpec } from '../../../types/agentspecs';
import { LoopEditorView, type ChatSurfaceProps } from '../../core';
import { AppPage } from './AppPage';
import { APP_PAGE_SURFACE } from './appPageModel';

export const APP_PAGE_PLUGIN_NAME = '@datalayer/loop-plugin-app-page';

/** The plugin that draws an application's page beside its conversation. */
export function defineAppPagePlugin(
  app: AppSpec,
): ReactorPlugin<Record<string, never>, unknown, unknown> {
  // One component per plugin: the editor keeps it, and the application with it.
  function Page({ workspace }: ChatSurfaceProps): JSX.Element {
    return <AppPage app={app} workspace={workspace} />;
  }
  const plugin = definePlugin({
    name: `${APP_PAGE_PLUGIN_NAME}-${app.id}`,
    displayName: `${app.name}: its page`,
    description: `The page of ${app.name}, drawn beside its conversation.`,
    octicon: 'browser',
    emoji: app.emoji || undefined,
    contributes: [
      contribution(
        LoopEditorView,
        {
          surfaceId: APP_PAGE_SURFACE,
          title: app.name,
          icon: BrowserIcon,
          order: -10,
          load: async () => ({ default: Page }),
        },
        { id: APP_PAGE_SURFACE, order: -10 },
      ),
    ],
  });
  return plugin as unknown as ReactorPlugin<
    Record<string, never>,
    unknown,
    unknown
  >;
}

export { AppPage, type AppPageProps } from './AppPage';
export * from './appPageModel';
export default defineAppPagePlugin;
