/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * One sandbox, four places it can run.
 *
 * `browser` is Pyodide in the page. The other three are server-backed and
 * differ in what the server is asked to run: a Jupyter server beside you, an
 * anonymous one anybody can reach, or a Datalayer runtime. A workspace should
 * not care which; the notebook binds to whatever kernel is there, and the
 * switch is one control.
 *
 * Local and `datalayer` bring an agent with them. Browser and anonymous
 * Jupyter are sandbox-only, which is why `hasAgent` is part of the target's
 * description rather than something each caller works out.
 *
 * The composite owns both implementations and delegates to the active one, so
 * switching is a real swap rather than a flag: the old backing is disconnected
 * before the new one starts, and every signal a view reads follows across.
 *
 * @module loop/plugins/code-sandbox/switchable
 */

import {
  computed,
  signal,
  type ReadonlySignal,
  type Signal,
} from '@datalayer/reactor';
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
export type SandboxTarget = 'browser' | 'local' | 'jupyter' | 'datalayer';

/**
 * The anonymous Jupyter server the `jupyter` target uses.
 *
 * The same one the jupyter-react examples point at: a real server, reachable
 * without an account, so a workspace can execute code with nothing installed
 * and nobody signed in.
 */
export const ANONYMOUS_JUPYTER_URL =
  'https://prod1.datalayer.run/api/jupyter-server';
export const ANONYMOUS_JUPYTER_TOKEN =
  '60c1661cc408f978c309d04157af55c9588ff9557c9380e4fb50785750703da6';

/** What a target is, and what it can do. */
export type SandboxTargetSpec = {
  label: string;
  hint: string;
  /** Whether an agent runs alongside the sandbox. */
  hasAgent: boolean;
  /** Why there is nothing to chat with. Empty when there is. */
  noAgentReason: string;
  /** What the server is asked to run. Absent for the in-page target. */
  configure?: { variant: string; jupyter_url?: string; jupyter_token?: string };
};

/** The four, in the order the control shows them: nearest first. */
export const SANDBOX_TARGETS: readonly SandboxTarget[] = [
  'browser',
  'local',
  'jupyter',
  'datalayer',
];

export const TARGET_SPECS: Record<SandboxTarget, SandboxTargetSpec> = {
  browser: {
    label: 'Browser',
    hint: 'Python in this page (Pyodide). Nothing leaves your machine.',
    hasAgent: false,
    noAgentReason: 'No agent in the browser',
  },
  local: {
    label: 'Local',
    hint: 'A local agent with a Jupyter server beside it.',
    hasAgent: true,
    noAgentReason: '',
    configure: { variant: 'jupyter-server' },
  },
  jupyter: {
    label: 'Jupyter',
    hint: 'An anonymous Jupyter server on prod1.datalayer.run.',
    hasAgent: false,
    noAgentReason: 'No agent on an anonymous Jupyter server',
    configure: {
      variant: 'jupyter-server',
      jupyter_url: ANONYMOUS_JUPYTER_URL,
      jupyter_token: ANONYMOUS_JUPYTER_TOKEN,
    },
  },
  datalayer: {
    label: 'Datalayer',
    hint: 'A Datalayer runtime, with the agent that comes with it.',
    hasAgent: true,
    noAgentReason: '',
    configure: { variant: 'datalayer' },
  },
};

/** Whether an agent runs on this target — the question the chat asks. */
export function targetHasAgent(target: SandboxTarget): boolean {
  return TARGET_SPECS[target]?.hasAgent ?? false;
}

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
  const status = computed<SandboxStatusPayload | null>(
    () => active.value.status.value,
  );
  const ready = computed(() => active.value.ready.value);
  const lastExecution = computed<SandboxExecution | null>(
    () => active.value.lastExecution.value,
  );

  /**
   * Ask the server to run what this target means, and wait for it to say yes.
   *
   * Awaited and checked rather than fired and forgotten: a switch that quietly
   * failed left the control showing the new target while the old sandbox kept
   * running, which is the worst of both — the header lies and nothing moved.
   * The error travels back to the caller so the control can stay where it was.
   */
  async function applyVariant(next: SandboxTarget): Promise<void> {
    const configure = TARGET_SPECS[next]?.configure;
    if (!configure) {
      return;
    }
    const response = await fetch(
      `${serverUrl}/api/v1/agents/sandbox/configure`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(configure),
      },
    );
    if (!response.ok) {
      throw new Error(
        `The server could not switch to ${TARGET_SPECS[next].label} (${response.status}).`,
      );
    }

    // Configure only changes what will be created on the next use. Starting it
    // here makes the segmented control an operation rather than a preference:
    // when the promise resolves, the selected sandbox has actually launched.
    const restart = await fetch(`${serverUrl}/api/v1/agents/sandbox/restart`, {
      method: 'POST',
    });
    if (!restart.ok) {
      throw new Error(
        `The server could not start ${TARGET_SPECS[next].label} (${restart.status}).`,
      );
    }
  }

  function connectActive(): void {
    disconnect?.();
    disconnect = active.peek().connect(agentId);
  }

  return {
    get kind() {
      return target.peek() === 'browser'
        ? ('browser' as const)
        : ('server' as const);
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
      const previous = target.peek();
      if (next === previous) {
        return;
      }
      // Disconnect first: two live sandboxes would race to report status, and
      // the reader would watch the header flicker between them.
      disconnect?.();
      disconnect = null;

      try {
        await applyVariant(next);
      } catch (error) {
        // Put the old one back rather than leaving the workspace with nothing:
        // a failed switch should cost the person the switch, not the sandbox
        // they already had.
        connectActive();
        throw error;
      }
      target.value = next;
      // Connect the new backing, so choosing a target *starts* it rather than
      // arming it for whenever something happens to ask.
      connectActive();
    },
  };
}
