/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Reaching the sandbox service from a component.
 *
 * A plugin that depends on the sandbox asks the reactor for it by name, rather
 * than importing a singleton: that is what makes the dependency visible in the
 * extension graph and what lets a host swap the implementation — a JupyterLab
 * front-end backed by the running server instead of a cloud runtime.
 *
 * @module apps/plugins/agents/useSandboxService
 */

import {
  useOptionalReactorPlatform,
  useReactorPlatform,
} from '@datalayer/reactor/react';
import {
  AGENTS_PLUGIN_NAME,
  type AgentsConfig,
  type AgentsOutput,
} from './plugin';
import { serverTokenOf } from './service';
import type { SwitchableSandboxService } from './switchable';

/** The sandbox service, or `undefined` when the plugin is not mounted. */
export function useOptionalSandboxService():
  SwitchableSandboxService | undefined {
  const reactor = useReactorPlatform();
  return reactor.getOutput<AgentsOutput>(AGENTS_PLUGIN_NAME)?.sandbox;
}

/**
 * The sandbox service, insisting it is there.
 *
 * A view that declares the sandbox plugin as a dependency has it by
 * construction; if it does not, the reactor graph is wrong and saying so
 * plainly beats rendering something half-alive.
 */
export function useSandboxService(): SwitchableSandboxService {
  const service = useOptionalSandboxService();
  if (!service) {
    throw new Error(
      `The code sandbox plugin (${AGENTS_PLUGIN_NAME}) is not mounted. ` +
        'A view that needs a sandbox must declare it as a dependency.',
    );
  }
  return service;
}

/**
 * The token the workspace's server takes (`AgentsConfig.serverToken`), as it
 * stands at this render; none when the host gave none, as for a server on
 * this machine, and none for a view drawn outside a workspace.
 */
export function useServerToken(): string | undefined {
  const reactor = useOptionalReactorPlatform();
  return serverTokenOf(
    reactor?.getConfig<AgentsConfig>(AGENTS_PLUGIN_NAME)?.serverToken,
  );
}
