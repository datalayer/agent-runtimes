/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Generate a short random alphanumeric slug (e.g. "a3f7b2").
 * Used to make agent IDs unique per session so that each fresh
 * example run starts with clean OTEL / telemetry data.
 */
function randomSlug(length = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let slug = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    slug += chars[array[i] % chars.length];
  }
  return slug;
}

/**
 * Build a unique agent ID by appending a random slug to a base name.
 *
 * The resulting id is cached in ``sessionStorage`` under a key derived from
 * ``baseName``, so a browser refresh within the same tab reuses the same
 * agent id.  This is required for server-side per-agent state (enabled
 * tools, approved tools, approved skills, codemode status…) to survive a
 * page reload — those maps are keyed by ``agent_id`` in
 * ``agent_runtimes.streams.loop``.
 *
 * A fresh tab (or a ``sessionStorage.clear()``) produces a new id, which
 * preserves the original "clean telemetry per run" guarantee.
 *
 * @example
 *   uniqueAgentId('simple')           // → "simple-a3f7b2" (cached)
 *   uniqueAgentId('codemode-demo')    // → "codemode-demo-k9x2m1" (cached)
 */
export function uniqueAgentId(baseName: string): string {
  const storageKey = `agent-runtimes:agentId:${baseName}`;
  try {
    if (typeof sessionStorage !== 'undefined') {
      const cached = sessionStorage.getItem(storageKey);
      if (cached && cached.startsWith(`${baseName}-`)) {
        return cached;
      }
      const fresh = `${baseName}-${randomSlug()}`;
      sessionStorage.setItem(storageKey, fresh);
      return fresh;
    }
  } catch {
    // sessionStorage unavailable (e.g. SSR, privacy mode); fall through.
  }
  return `${baseName}-${randomSlug()}`;
}
