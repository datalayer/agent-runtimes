/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The page told which of an application's plugins its runtime holds (LOOP
 * F-15).
 *
 * The application's page plugin requires the runtime's plugin of the same
 * name (`requiredBackendPlugins`). Reactor stands such a plugin down while
 * the plugin it requires is not running, and brings it back when it is — but
 * only a host that says what runs can make that true. Every place an
 * application appears draws it with `AppRenderer`, so this is said once, for
 * all of them — the Studio's Preview, its address, an embed, the browser
 * alone:
 *
 * - on a runtime, Reactor's `useBackendPluginStream` follows the runtime's
 *   `/api/v1/apps/<id>/plugins/state` (and its stream): the page's plugin
 *   stands down when the runtime no longer holds the application, and comes
 *   back when it does;
 * - with no runtime — the browser alone, or one still starting — the page is
 *   its own runtime, and the pair is whole: nothing stands down, nothing is
 *   blank.
 *
 * A plugin of its own, with no backend requirement, so that it keeps
 * listening while the application's plugin is stood down. It renders nothing.
 *
 * @module loop/apps/AppRuntimePlugins
 */

import { useCallback, useEffect } from 'react';
import { definePlugin, type ReactorPlugin } from '@datalayer/reactor';
import {
  registerReactor,
  useBackendPluginStream,
  useReactorPlatform,
  useSignalValue,
  type BackendPluginState,
} from '@datalayer/reactor/react';
import {
  IDLE_SANDBOX_SNAPSHOT_SIGNAL,
  IDLE_SANDBOX_TARGET_SIGNAL,
  LoopSlots,
} from '../core';
import { useOptionalSandboxService } from '../plugins/agents/useSandboxService';
import { appPluginName, appPluginsBase, appRuntimeOf } from './pluginPair';

export const APP_RUNTIME_PLUGIN_NAME = '@datalayer/loop-plugin-app-runtime';

/** A host's answer to "is this runtime plugin running?", from a list. */
const runningOf =
  (names: readonly string[]) =>
  (name: string): boolean =>
    names.includes(name);

/** Follows the application's runtime, and tells the page what it holds. */
export function AppRuntimePlugins({ appId }: { appId: string }): null {
  const reactor = useReactorPlatform();
  const service = useOptionalSandboxService();
  const target = useSignalValue(service?.target ?? IDLE_SANDBOX_TARGET_SIGNAL);
  const snapshot = useSignalValue(
    service?.snapshot ?? IDLE_SANDBOX_SNAPSHOT_SIGNAL,
  );
  const runtime = appRuntimeOf({
    target,
    snapshot,
    serverUrl: service?.serverUrl,
  });
  const name = appPluginName(appId);

  // No runtime: the page is its own, and the pair is whole.
  useEffect(() => {
    if (runtime) {
      return;
    }
    registerReactor(reactor, runningOf([name]));
    void reactor.setBackendPlugins([name]);
  }, [reactor, runtime, name]);

  // On one: what it says, for the slots gated on it too.
  const onState = useCallback(
    (state: BackendPluginState) =>
      registerReactor(
        reactor,
        runningOf(
          state.plugins
            .filter(plugin => plugin.enabled)
            .map(plugin => plugin.name),
        ),
      ),
    [reactor],
  );
  useBackendPluginStream(runtime ? appPluginsBase(runtime, appId) : undefined, {
    onState,
  });
  return null;
}

/** The plugin that follows an application's runtime for its page. */
export function defineAppRuntimePlugin(
  appId: string,
): ReactorPlugin<Record<string, never>, unknown, unknown> {
  const Follow = () => <AppRuntimePlugins appId={appId} />;
  return definePlugin({
    name: APP_RUNTIME_PLUGIN_NAME,
    displayName: 'Its runtime',
    description:
      'Tells the application’s page which of its plugins its runtime holds.',
    octicon: 'server',
    build: () => ({
      components: [
        {
          slot: LoopSlots.status,
          id: 'app-runtime-plugins',
          Component: Follow as never,
        },
      ],
    }),
  }) as unknown as ReactorPlugin<Record<string, never>, unknown, unknown>;
}
