/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's two Reactor plugins, named once (LOOP F-15).
 *
 * Whichever editor wrote it — a spec, the Canvas, an `app.py` — an
 * application is a pair of plugins of one name, `loop-app-<id>`: the page's
 * (`defineAppPlugin`) and the runtime's (`manifest_of` in
 * `agent_runtimes.loop.apps.plugins`, which says the same name). Each
 * declares the other: the page's `requiredBackendPlugins`, the runtime's
 * `frontend_dependencies`; and both are delivered as one extension of that
 * name, which is how Reactor's manager and graph show them as one
 * application.
 *
 * The page follows what its runtime holds with Reactor's
 * `useBackendPluginStream`, on `appPluginsBase` (`AppRuntimePlugins`).
 *
 * @module apps/apps/pluginPair
 */

import type { SandboxSnapshot } from '../core';
import type { SandboxTarget } from '../plugins/agents/switchable';

/** The one name of an application's two plugins, the page's and the runtime's. */
export const appPluginName = (appId: string): string => `loop-app-${appId}`;

/** What each tier of an application's pair says. */
export type AppPluginPair = {
  /** The page's plugin, and the runtime plugin it cannot work without. */
  page: { name: string; requiredBackendPlugins: string[] };
  /** The runtime's plugin, and the page plugin it cannot be used without. */
  server: { name: string; frontendDependencies: string[] };
  /** The extension that delivers both: the application. */
  extension: string;
};

/** The pair an application of this id is, on both tiers. */
export function appPluginPair(appId: string): AppPluginPair {
  const name = appPluginName(appId);
  return {
    page: { name, requiredBackendPlugins: [name] },
    server: { name, frontendDependencies: [name] },
    extension: name,
  };
}

/**
 * Where Reactor's `useBackendPluginStream` reads an application's plugins on
 * its runtime: `<base>/plugins/state`, `<base>/events/stream` — about that
 * application only, so that a runtime several share says nothing of the
 * others.
 */
export const appPluginsBase = (runtimeUrl: string, appId: string): string =>
  `${runtimeUrl.replace(/\/+$/, '')}/api/v1/apps/${encodeURIComponent(appId)}`;

/**
 * The runtime an application's page follows, or `undefined` when it runs on
 * none yet.
 *
 * - **In the browser alone**: none — the page is its own runtime.
 * - **On Datalayer**: the runtime its agent was made on, once reported
 *   (`agent_base_url`) — at its address, embedded, on the visitors' runtime.
 * - **Here** (`local`, `jupyter`): the workspace's server, once it runs —
 *   after the agent was made there with the application, never before.
 */
export function appRuntimeOf({
  target,
  snapshot,
  serverUrl,
}: {
  target: SandboxTarget | undefined;
  snapshot: Pick<SandboxSnapshot, 'state' | 'agentBaseUrl'>;
  serverUrl: string | undefined;
}): string | undefined {
  if (!target || target === 'browser') {
    return undefined;
  }
  if (snapshot.agentBaseUrl) {
    return snapshot.agentBaseUrl;
  }
  if (target === 'datalayer') {
    return undefined;
  }
  return snapshot.state === 'running' && serverUrl ? serverUrl : undefined;
}
