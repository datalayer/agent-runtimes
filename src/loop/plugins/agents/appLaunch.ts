/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an application's runtime is launched with (STUDIO R-19).
 *
 * Pure, so it is read without the agent hook's runtime stack.
 *
 * @module loop/plugins/agents/appLaunch
 */

import type { AppLaunch } from '../../../hooks/useAgentRuntimes';

/**
 * The launch of the application an agent is created with, or none.
 *
 * `app_spec` and `app_instance` are what `appDatalayerCreatePayload` writes;
 * the launch sends them as `RuntimesClient.create` does in Python.
 */
export function appLaunchOf(
  createPayload: Record<string, unknown> | undefined,
): AppLaunch | undefined {
  const appSpec = createPayload?.app_spec;
  if (!appSpec || typeof appSpec !== 'object') {
    return undefined;
  }
  const instance = (createPayload?.app_instance ?? {}) as Record<
    string,
    unknown
  >;
  const appUid =
    typeof instance.app_uid === 'string' && instance.app_uid
      ? instance.app_uid
      : undefined;
  const deploymentUid =
    typeof instance.deployment_uid === 'string' && instance.deployment_uid
      ? instance.deployment_uid
      : undefined;
  return {
    appSpec: appSpec as Record<string, unknown>,
    ...(appUid ? { appUid } : {}),
    ...(deploymentUid ? { deploymentUid } : {}),
  };
}
