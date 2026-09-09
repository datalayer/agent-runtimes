/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Wait for an agent the Loop is creating to exist on the server.
 *
 * The examples used to create their agent by hand and gate their sidebars on
 * that request. Now the Loop creates the agent from the capacity plugin's
 * blueprint when it mounts, so a page that wants to follow the agent over a
 * websocket or read its spec asks the server until the agent answers.
 *
 * @module examples/utils/waitForAgent
 */

export interface WaitForAgentOptions {
  /** Stops the wait; the promise then resolves `false`. */
  signal?: AbortSignal;
  /** Give up after this long (default 120 s). */
  timeoutMs?: number;
  /** Time between two asks (default 1.5 s). */
  intervalMs?: number;
  /** Headers for the ask, e.g. an Authorization header. */
  headers?: Record<string, string>;
}

/** Resolves `true` once `GET /api/v1/agents/{id}` answers 200, `false` on timeout or abort. */
export async function waitForAgent(
  serverUrl: string,
  agentId: string,
  options: WaitForAgentOptions = {},
): Promise<boolean> {
  const { signal, timeoutMs = 120_000, intervalMs = 1_500, headers } = options;
  const base = serverUrl.replace(/\/+$/, '');
  const url = `${base}/api/v1/agents/${encodeURIComponent(agentId)}`;
  const started = Date.now();
  while (!signal?.aborted && Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { headers, signal });
      if (response.ok) return true;
    } catch {
      // Not there, or the server is not up yet: ask again.
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return false;
}

export default waitForAgent;
