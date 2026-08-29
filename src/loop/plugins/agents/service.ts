/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The sandbox, owned in one place.
 *
 * Nothing else in LOOP talks to a sandbox directly. The notebook and the
 * document ask this service whether there is a kernel to bind to; the A2UI
 * plugin asks it what executed. That is the point of a base plugin: one owner
 * for a fact that several views need, rather than four components each opening
 * their own connection and each disposing it differently.
 *
 * State lives in reactor signals rather than React state, because the owner is
 * an extension and not a component — a view can unmount without the sandbox
 * forgetting what it is doing.
 *
 * @module loop/plugins/agents/service
 */

import {
  computed,
  signal,
  type ReadonlySignal,
  type Signal,
} from '@datalayer/reactor';
import type { SandboxSnapshot, SandboxState } from '../../core';

/** Status as the server reports it over the configure WebSocket. */
export type SandboxStatusPayload = {
  variant?: string;
  sandbox_running?: boolean;
  jupyter_connected?: boolean;
  jupyter_url?: string;
  kernel_id?: string;
  kernel_name?: string;
  execution_state?: string;
  is_executing?: boolean;
  jupyter_token?: string;
};

export type SandboxService = {
  /**
   * What backs this sandbox.
   *
   * `'server'` has an agent-runtimes server behind it and can therefore reach
   * server-side facilities — the A2UI converter, snapshots. `'browser'` runs in
   * the page and cannot. A caller that needs one should ask, rather than
   * discover it from a failed request.
   */
  readonly kind: 'server' | 'browser';
  /** The sandbox as last reported. */
  readonly snapshot: ReadonlySignal<SandboxSnapshot>;
  /** Raw status, for views that need more than the summary. */
  readonly status: ReadonlySignal<SandboxStatusPayload | null>;
  /** Whether code can be executed right now. */
  readonly ready: ReadonlySignal<boolean>;
  /** Feed in a status update (the WebSocket bridge calls this). */
  report: (status: SandboxStatusPayload | null) => void;
  /** Note that a lifecycle operation is under way. */
  setState: (state: SandboxState) => void;
  /** Execute code in the sandbox and return what it produced. */
  execute: (code: string) => Promise<SandboxExecution>;
  /** The most recent execution, for whoever wants to render it. */
  readonly lastExecution: ReadonlySignal<SandboxExecution | null>;
  /** Where this service talks to. */
  readonly serverUrl: string;
  /**
   * Start listening to the server's sandbox status.
   *
   * Returns a stop function. Plain TypeScript rather than a React hook on
   * purpose: the owner of a sandbox is an extension, not a component, and
   * pulling `useSandbox` in here would drag Jupyter and Lumino — which touch
   * the DOM at import time — into every module that imports this plugin.
   */
  connect: (agentId?: string) => () => void;
};

/** One execution, in the shape the server returns it. */
export type SandboxExecution = {
  code: string;
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
  /** Raw Jupyter outputs, when the variant produces them. */
  outputs?: unknown[];
  startedAt: number;
  finishedAt: number;
};

/**
 * Derive the summary from a raw status.
 *
 * A Jupyter sandbox reports readiness as `jupyter_connected` rather than
 * `sandbox_running`; both mean the same thing to a caller deciding whether it
 * can execute, so the difference is resolved here rather than in every view.
 */
export function summarize(
  status: SandboxStatusPayload | null,
  fallback: SandboxState,
): SandboxSnapshot {
  if (!status) {
    return { state: fallback };
  }
  const running =
    Boolean(status.sandbox_running) ||
    (status.variant === 'jupyter-server' && Boolean(status.jupyter_connected));
  return {
    state: running ? 'running' : fallback === 'running' ? 'idle' : fallback,
    variant: status.variant,
    kernelId: status.kernel_id,
    jupyterUrl: status.jupyter_url,
    jupyterToken: status.jupyter_token,
  };
}

/** Reconnect backoff, so a server that is down is not hammered. */
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export function createServerSandboxService(serverUrl: string): SandboxService {
  const status: Signal<SandboxStatusPayload | null> = signal(null);
  const lifecycle: Signal<SandboxState> = signal<SandboxState>('idle');
  const lastExecution: Signal<SandboxExecution | null> = signal(null);

  const snapshot = computed(() => summarize(status.value, lifecycle.value));
  const ready = computed(() => snapshot.value.state === 'running');

  return {
    kind: 'server',
    connect(agentId?: string) {
      if (typeof WebSocket === 'undefined') {
        return () => {};
      }

      let socket: WebSocket | null = null;
      let retry: ReturnType<typeof setTimeout> | null = null;
      let attempts = 0;
      let stopped = false;

      const open = () => {
        if (stopped) {
          return;
        }
        const base = serverUrl.replace(/^http/, 'ws');
        const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
        socket = new WebSocket(`${base}/api/v1/configure/sandbox/ws${query}`);

        socket.onopen = () => {
          attempts = 0;
        };
        socket.onmessage = event => {
          try {
            status.value = JSON.parse(String(event.data));
          } catch {
            // A message we cannot read is not a reason to drop the connection.
          }
        };
        socket.onclose = () => {
          if (stopped) {
            return;
          }
          status.value = null;
          attempts += 1;
          const delay = Math.min(
            RECONNECT_BASE_MS * 2 ** (attempts - 1),
            RECONNECT_MAX_MS,
          );
          retry = setTimeout(open, delay);
        };
      };

      open();

      return () => {
        stopped = true;
        if (retry) {
          clearTimeout(retry);
        }
        socket?.close();
        socket = null;
      };
    },
    snapshot,
    status,
    ready,
    lastExecution,
    serverUrl,
    report(next) {
      status.value = next;
    },
    setState(state) {
      lifecycle.value = state;
    },
    async execute(code: string): Promise<SandboxExecution> {
      const startedAt = Date.now();
      try {
        const response = await fetch(`${serverUrl}/api/v1/sandbox/execute`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const payload = response.ok ? await response.json() : null;
        const execution: SandboxExecution = {
          code,
          success: response.ok && !payload?.error,
          stdout: payload?.stdout,
          stderr: payload?.stderr,
          error: response.ok
            ? payload?.error
            : `Execution failed: ${response.status}`,
          outputs: payload?.outputs,
          startedAt,
          finishedAt: Date.now(),
        };
        lastExecution.value = execution;
        return execution;
      } catch (error) {
        const execution: SandboxExecution = {
          code,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          startedAt,
          finishedAt: Date.now(),
        };
        lastExecution.value = execution;
        return execution;
      }
    },
  };
}
