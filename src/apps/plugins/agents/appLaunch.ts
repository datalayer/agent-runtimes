/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an application's runtime is launched with (R-19).
 *
 * Pure, so it is read without the agent hook's runtime stack.
 *
 * @module apps/plugins/agents/appLaunch
 */

import type { AppLaunch } from '../../../hooks/useAgentRuntimes';
import { RUNTIME_ENGINES, type RuntimeEngine } from '../../../types/agentspecs';

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
  const said = instance.runtime_engine;
  if (
    said !== undefined &&
    said !== '' &&
    !(RUNTIME_ENGINES as readonly unknown[]).includes(said)
  ) {
    throw new Error(
      `The application's instance runs on ${String(said)}: one of ${RUNTIME_ENGINES.join(', ')} (runtime_engine).`,
    );
  }
  if (said === 'agentcore') {
    throw new Error(
      'An application deployed on AWS AgentCore is not launched on a runtime: AgentCore starts its agent runtime itself.',
    );
  }
  const runtimeEngine = said ? (said as RuntimeEngine) : undefined;
  return {
    appSpec: appSpec as Record<string, unknown>,
    ...(appUid ? { appUid } : {}),
    ...(deploymentUid ? { deploymentUid } : {}),
    ...(runtimeEngine ? { runtimeEngine } : {}),
  };
}
