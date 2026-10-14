/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The runtime routes a page calls besides an application's own, and when it
 * does not (PAP_DATALAYER's release gates, decided 14 October 2026).
 *
 * A runtime that serves a deployment — kept always on, or launched by its
 * hosted page — and the visitors' runtime answer only the application's own
 * routes (`OwnRoutesOnly`, the same `ownRoutesOnly` its chat is told). The
 * page then asks nothing else of it: not the agent's status, not deleting
 * its agent, not the runtime's model catalogue. Each is `undefined` there,
 * and the caller asks nothing.
 *
 * Pure, so it is read without the agent hook's runtime stack.
 *
 * @module hooks/ownRoutes
 */

import type { AppLaunch } from './useAgentRuntimes';

/**
 * Whether the runtime launched for an application answers only its own
 * routes: it is launched for a deployment. A Preview runs on its Maker's.
 */
export function launchesOwnRoutesOnly(appLaunch?: AppLaunch): boolean {
  return Boolean(appLaunch?.deploymentUid);
}

const base = (url: string): string => url.trim().replace(/\/$/, '');

/** `GET /api/v1/runtime/status` for an agent, or none on such a runtime. */
export function runtimeStatusUrl(
  agentBaseUrl: string,
  agentId: string,
  ownRoutesOnly: boolean,
): string | undefined {
  if (ownRoutesOnly) {
    return undefined;
  }
  return `${base(agentBaseUrl)}/api/v1/runtime/status?agent_id=${encodeURIComponent(agentId)}`;
}

/** `DELETE /api/v1/agents/{id}`, or none on such a runtime: its agent is the deployment's. */
export function agentDeletionUrl(
  agentBaseUrl: string,
  agentId: string,
  ownRoutesOnly: boolean,
): string | undefined {
  if (ownRoutesOnly) {
    return undefined;
  }
  return `${base(agentBaseUrl)}/api/v1/agents/${encodeURIComponent(agentId)}`;
}

/** `GET /api/v1/configure/models` for an agent, or none on such a runtime. */
export function runtimeModelsUrl(
  agentServerUrl: string,
  agentId: string,
  ownRoutesOnly: boolean,
): string | undefined {
  if (ownRoutesOnly) {
    return undefined;
  }
  return `${base(agentServerUrl)}/api/v1/configure/models?agent_id=${encodeURIComponent(agentId)}`;
}
