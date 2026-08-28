/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * One sandbox, three places it can run.
 *
 * `browser` is Pyodide in the page. `local` and `cloud` are both server-backed
 * and differ in the variant the server runs — a Jupyter server beside you, or a
 * Datalayer runtime. A workspace should not care which; the notebook binds to
 * whatever kernel is there, and the switch is one control in the header.
 *
 * The composite owns both implementations and delegates to the active one, so
 * switching is a real swap rather than a flag: the old backing is disconnected
 * before the new one starts, and every signal a view reads follows across.
 *
 * @module loop/plugins/code-sandbox/switchable
 */

import { computed, signal, type ReadonlySignal, type Signal } from '@datalayer/reactor';
import type { SandboxSnapshot } from '../../core';
import {
  browserSource,
  createBrowserSandboxService,
  type ServiceManagerSource,
} from './browserService';
import {
  createServerSandboxService,
  type SandboxExecution,
  type SandboxService,
  type SandboxStatusPayload,
} from './service';

/** Where the sandbox runs. */
export type SandboxTarget = 'browser' | 'local' | 'cloud';

/** The `code_sandboxes` variant each server-backed target asks for. */
export const TARGET_VARIANTS: Record<'local' | 'cloud', string> = {
  local: 'jupyter-server',
  cloud: 'datalayer',
};

export type SwitchableSandboxService = SandboxService & {
  /** Where the sandbox currently runs. */
  readonly target: ReadonlySignal<SandboxTarget>;
  /** Move it. Disconnects the old backing before starting the new one. */
  setTarget: (target: SandboxTarget) => Promise<void>;
  /** The in-browser services, when the browser is the active target. */
  getServiceManager: () => unknown | null;
};

export type SwitchableConfig = {
  serverUrl: string;
  initialTarget?: SandboxTarget;
  /**
   * Where the in-page kernel comes from.
   *
   * Defaults to JupyterLite. A JupyterLab host supplies the application's own
   * services instead, so the agent runs in the kernel the user is already
   * looking at rather than a second one beside it.
   */
  kernelSource?: ServiceManagerSource;
};

export function createSwitchableSandboxService({
  serverUrl,
  initialTarget = 'local',
  kernelSource,
}: SwitchableConfig): SwitchableSandboxService {
  const target: Signal<SandboxTarget> = signal(initialTarget);

  // Both implementations exist from the start, but neither connects until it is
  // the active one — a Pyodide kernel that nobody asked for is megabytes of
  // download, and a WebSocket to a server nobody chose is noise in the logs.
  const server = createServerSandboxService(serverUrl);
  const browser = createBrowserSandboxService(kernelSource ?? browserSource());

  const active = computed<SandboxService>(() =>
    target.value === 'browser' ? browser : (server as SandboxService),
  );

  let disconnect: (() => void) | null = null;
  let agentId: string | undefined;

  const snapshot = computed<SandboxSnapshot>(() => active.value.snapshot.value);
  const status = computed<SandboxStatusPayload | null>(() => active.value.status.value);
  const ready = computed(() => active.value.ready.value);
  const lastExecution = computed<SandboxExecution | null>(
    () => active.value.lastExecution.value,
  );

  /** Ask the server to run the variant this target means. */
  async function applyVariant(next: Exclude<SandboxTarget, 'browser'>): Promise<void> {
    try {
      await fetch(`${serverUrl}/api/v1/agents/sandbox/configure`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ variant: TARGET_VARIANTS[next] }),
      });
    } catch {
      // The status WebSocket reports what the sandbox actually is, so a failed
      // switch shows up there rather than as an optimistic lie in the header.
    }
  }

  function connectActive(): void {
    disconnect?.();
    disconnect = active.peek().connect(agentId);
  }

  return {
    get kind() {
      return target.peek() === 'browser' ? ('browser' as const) : ('server' as const);
    },
    target,
    snapshot,
    status,
    ready,
    lastExecution,
    serverUrl,
    getServiceManager: () =>
      target.peek() === 'browser' ? browser.getServiceManager() : null,
    report(next) {
      active.peek().report(next);
    },
    setState(state) {
      active.peek().setState(state);
    },
    execute(code) {
      return active.peek().execute(code);
    },
    connect(id?: string) {
      agentId = id;
      connectActive();
      return () => {
        disconnect?.();
        disconnect = null;
      };
    },
    async setTarget(next: SandboxTarget) {
      if (next === target.peek()) {
        return;
      }
      // Disconnect first: two live sandboxes would race to report status, and
      // the reader would watch the header flicker between them.
      disconnect?.();
      disconnect = null;

      if (next !== 'browser') {
        await applyVariant(next);
      }
      target.value = next;
      connectActive();
    },
  };
}
