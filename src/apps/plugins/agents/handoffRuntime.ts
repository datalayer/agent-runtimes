/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Where a session handed over from the terminal runs, and the Agents
 * plugin's configuration that keeps it there.
 *
 * `/browser` mints a handoff carrying `runtime` (`routes/loop.py`); the LOOP
 * page redeems it and configures this plugin from it, so the switch shows the
 * session's place selected and every other place held.
 *
 * @module apps/plugins/agents/handoffRuntime
 */

import type { AgentsConfig } from './plugin';

/**
 * Where the handed-over session's agent runs, as the terminal said.
 *
 * The page cannot tell for itself: on Datalayer it is served through the
 * terminal's relay at `http://127.0.0.1:<port>`, which looks exactly like a
 * local server. The Jupyter token arrives here, in the exchange's answer, and
 * never in the page's address.
 */
export type SessionRuntime =
  | { where: 'local' }
  | {
      where: 'datalayer';
      name: string;
      jupyterUrl: string;
      jupyterToken: string;
    };

/** The exchange's `runtime`, or an error saying what is missing. */
export function sessionRuntimeOf(runtime: unknown): SessionRuntime {
  const value = (runtime ?? {}) as Record<string, unknown>;
  if (value.where === 'local') {
    return { where: 'local' };
  }
  if (
    value.where === 'datalayer' &&
    typeof value.name === 'string' &&
    typeof value.jupyter_url === 'string' &&
    typeof value.jupyter_token === 'string'
  ) {
    return {
      where: 'datalayer',
      name: value.name,
      jupyterUrl: value.jupyter_url,
      jupyterToken: value.jupyter_token,
    };
  }
  throw new Error(
    'The handed-over session does not say where its agent runs: update agent-runtimes on the server that minted the handoff.',
  );
}

/**
 * The Agents plugin's configuration for a session: where it runs, and only
 * there. A handed-over session is fixed to its place — Datalayer with the
 * runtime's Jupyter for the notebook, or Local — and the switch holds the
 * others; a page opened without a handoff starts on Local, movable.
 */
export function agentsConfigOf(
  serverUrl: string,
  runtime: SessionRuntime | undefined,
): AgentsConfig {
  if (runtime?.where === 'datalayer') {
    return {
      serverUrl,
      target: 'datalayer',
      targetFixed: true,
      // The agent is already on the runtime, reached through the relay —
      // this page's origin — which adds the person's token.
      datalayerKept: {
        url: serverUrl,
        name: runtime.name,
        jupyter: { url: runtime.jupyterUrl, token: runtime.jupyterToken },
      },
    };
  }
  return {
    serverUrl,
    target: 'local',
    targetFixed: runtime !== undefined,
  };
}
