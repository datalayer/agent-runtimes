/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The converged sandbox lifecycle, in TypeScript.
 *
 * The Python side states this vocabulary in `code_sandboxes.lifecycle` and the
 * Runtimes client is written to it. This is the same statement for callers that
 * reach the API from a browser: one place that knows how a runtime URL is
 * spelled, so a hook, a mixin and a page cannot drift from each other the way
 * they did when each built its own string.
 *
 * Transport stays with the caller — `requestDatalayerAPI`, `requestDatalayer`
 * and a bare `fetch` all have their reasons. Only the URLs and the verbs are
 * shared, because those are what has to agree.
 */

/**
 * A verb a caller may use, and the REST spelling it corresponds to.
 *
 * Mirrors `LIFECYCLE_OPERATIONS` in `code_sandboxes.lifecycle` — if one of them
 * changes, so does the other, and the tests on both sides say so.
 */
export const LIFECYCLE_OPERATIONS = {
  create: 'POST /runtimes',
  start: 'POST /runtimes (implied) — begin a created sandbox',
  stop: 'DELETE /runtimes/{runtime_name}',
  pause: 'POST /runtimes/{runtime_name}/pause',
  resume: 'POST /runtimes/{runtime_name}/resume',
  list: 'GET /runtimes',
  get: 'GET /runtimes/{runtime_name}',
  update: 'PUT /runtimes/{runtime_name}',
  snapshot: 'POST /sandbox-snapshots',
  execute: 'run code in the sandbox',
} as const;

/**
 * The name of a lifecycle verb.
 */
export type LifecycleOperation = keyof typeof LIFECYCLE_OPERATIONS;

/**
 * The Runtimes API prefix, below whichever host serves it.
 */
export const RUNTIMES_API_PREFIX = 'api/runtimes/v1';

/**
 * Join a base URL to a path without doubling or dropping the slash between.
 *
 * `URLExt.join` would do this, but the callers of this module include ones with
 * no JupyterLab dependency, and a runtime URL is not worth one.
 */
function join(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * Every runtime — the collection.
 *
 * `create` posts here and `list` gets here.
 */
export function runtimesUrl(baseUrl: string): string {
  return join(baseUrl, `${RUNTIMES_API_PREFIX}/runtimes`);
}

/**
 * One runtime, by pod name.
 *
 * `get` reads it, `update` puts to it, and `stop` deletes it — whether the
 * runtime is running or paused, which is why there is no second path for the
 * paused case.
 */
export function runtimeUrl(baseUrl: string, runtimeName: string): string {
  return `${runtimesUrl(baseUrl)}/${runtimeName}`;
}

/**
 * Suspend one runtime, keeping its state.
 */
export function runtimePauseUrl(baseUrl: string, runtimeName: string): string {
  return `${runtimeUrl(baseUrl, runtimeName)}/pause`;
}

/**
 * Bring one paused runtime back.
 */
export function runtimeResumeUrl(baseUrl: string, runtimeName: string): string {
  return `${runtimeUrl(baseUrl, runtimeName)}/resume`;
}

/**
 * The snapshots collection.
 *
 * A snapshot outlives the runtime it came from, which is why it is its own
 * resource rather than a sub-path of the pod.
 */
export function sandboxSnapshotsUrl(baseUrl: string): string {
  return join(baseUrl, `${RUNTIMES_API_PREFIX}/sandbox-snapshots`);
}

/**
 * One snapshot, by UID.
 */
export function sandboxSnapshotUrl(baseUrl: string, id: string): string {
  return `${sandboxSnapshotsUrl(baseUrl)}/${id}`;
}

/**
 * The checkpoint records behind pause and resume.
 */
export function runtimeCheckpointsUrl(baseUrl: string): string {
  return join(baseUrl, `${RUNTIMES_API_PREFIX}/runtime-checkpoints`);
}
