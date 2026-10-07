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
 * A page the workspace does not draw itself — a decision's, whose page is
 * its host's (the Studio's run page, its hosted address, its embed) — is
 * contributed by the host through `defineAppHostPagePlugin`, as the
 * workspace's one view (`LoopViewType`), in a workspace without a
 * conversation (LOOP R-02).
 *
 * @module loop/plugins/app-page
 */

import type { ComponentType, JSX } from 'react';
import { BrowserIcon } from '@primer/octicons-react';
import {
  contribution,
  definePlugin,
  type ReactorPlugin,
} from '@datalayer/reactor';
import type { AppSpec } from '../../../types/agentspecs';
import {
  LoopEditorView,
  LoopViewType,
  type ChatSurfaceProps,
  type LoopWorkspaceContext,
} from '../../core';
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

/** The view an application's page is, when its host draws it. */
export const APP_HOST_PAGE_VIEW = 'app-page';

/** What a host's page is given: the application, and the workspace it is the view of. */
export type AppHostPageProps = {
  app: AppSpec;
  workspace: LoopWorkspaceContext;
};

/**
 * The plugin that makes a host's page the workspace's view (LOOP R-02): the
 * page a host draws for an application whose kind the workspace has no page
 * for — a decision's. The workspace opens on it; it is ordered before every
 * other view.
 */
export function defineAppHostPagePlugin(
  app: AppSpec,
  Page: ComponentType<AppHostPageProps>,
): ReactorPlugin<Record<string, never>, unknown, unknown> {
  // One component per plugin: the view host keeps it, and the application with it.
  function View({
    workspace,
  }: {
    viewType: string;
    workspace: LoopWorkspaceContext;
  }): JSX.Element {
    return <Page app={app} workspace={workspace} />;
  }
  const plugin = definePlugin({
    name: `${APP_PAGE_PLUGIN_NAME}-${app.id}`,
    displayName: `${app.name}: its page`,
    description: `The page of ${app.name}, drawn by its host.`,
    octicon: 'browser',
    emoji: app.emoji || undefined,
    contributes: [
      contribution(
        LoopViewType,
        {
          viewType: APP_HOST_PAGE_VIEW,
          title: app.name,
          icon: BrowserIcon,
          order: -10,
          load: async () => ({ default: View }),
        },
        { id: APP_HOST_PAGE_VIEW, order: -10 },
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
export * from './pageRun';
export default defineAppPagePlugin;
