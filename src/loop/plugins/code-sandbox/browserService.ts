/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The sandbox, in the browser.
 *
 * Pyodide is not a `code_sandboxes` variant and never will be — that catalogue
 * is server-side by construction (`docker`, `e2b`, `jupyter-server`, `modal`).
 * This is a *second implementation of the same interface*, which is what the
 * interface was for. If `SandboxService` could not be re-implemented against a
 * browser kernel, it would not be an interface; it would be one implementation
 * with a type annotation.
 *
 * Everything heavy — JupyterLite, the Pyodide kernel, Lumino — is behind a
 * dynamic `import()` inside `connect()`, so a workspace that never starts a
 * browser sandbox never downloads one.
 *
 * @module loop/plugins/code-sandbox/browserService
 */

import { computed, signal, type Signal } from '@datalayer/reactor';
import type { ServiceManager } from '@jupyterlab/services';
import type { SandboxSnapshot, SandboxState } from '../../core';
import type { SandboxExecution, SandboxService, SandboxStatusPayload } from './service';

/** What a browser sandbox additionally exposes. */
export type BrowserSandboxService = SandboxService & {
  /** `'browser'`, so callers can tell what they are holding. */
  readonly kind: 'browser';
  /**
   * The in-browser Jupyter services, once the kernel is up.
   *
   * The notebook and document views bind to *this* manager rather than opening
   * one of their own, so the code a person runs in a cell and the code the
   * agent runs through the sandbox land in the same kernel — which is the whole
   * point of a shared sandbox.
   */
  getServiceManager: () => ServiceManager.IManager | null;
};

type KernelConnection = {
  id: string;
  requestExecute: (content: { code: string }) => {
    onIOPub: (message: any) => void;
    done: Promise<unknown>;
  };
  shutdown?: () => Promise<void>;
};

/** Collects one execution's outputs from the kernel's IOPub stream. */
function collect(message: any, into: { outputs: any[]; stdout: string[]; error: string }) {
  const type = message?.header?.msg_type;
  const content = message?.content ?? {};

  if (type === 'stream') {
    into.stdout.push(String(content.text ?? ''));
    into.outputs.push({ output_type: 'stream', text: content.text });
  } else if (type === 'execute_result' || type === 'display_data') {
    into.outputs.push({ output_type: type, data: content.data });
  } else if (type === 'error') {
    into.error = `${content.ename ?? 'Error'}: ${content.evalue ?? ''}`;
    into.outputs.push({
      output_type: 'error',
      ename: content.ename,
      evalue: content.evalue,
      traceback: content.traceback,
    });
  }
}

/**
 * How a kernel-backed sandbox gets its services.
 *
 * The browser builds a JupyterLite manager; JupyterLab hands over the one the
 * application already has. Everything after that — starting a session,
 * executing, collecting outputs — is identical, which is why it is one
 * implementation with this as its only variable.
 */
export type ServiceManagerSource = {
  /** Where the kernel runs, for the snapshot and for callers that must ask. */
  variant: string;
  /** Produce the services. Called once, on first connect. */
  acquire: () => Promise<ServiceManager.IManager>;
  /** Whether this sandbox owns the manager and should dispose it on stop. */
  owned: boolean;
};

/** A sandbox on a JupyterLite kernel in this page. */
export function browserSource(): ServiceManagerSource {
  return {
    variant: 'pyodide',
    // Dynamic: JupyterLite and the Pyodide kernel are megabytes, and a
    // workspace that never opens a browser sandbox should never pay for them.
    acquire: async () => {
      const { createLiteServiceManager } = await import('@datalayer/jupyter-react');
      return createLiteServiceManager();
    },
    owned: true,
  };
}

/**
 * A sandbox on services someone else owns — JupyterLab's, typically.
 *
 * `owned: false` matters: disconnecting must not dispose a manager the host is
 * still using for every other notebook it has open.
 */
export function suppliedSource(
  manager: ServiceManager.IManager,
  variant = 'jupyter-server',
): ServiceManagerSource {
  return { variant, acquire: async () => manager, owned: false };
}

export function createBrowserSandboxService(
  source: ServiceManagerSource = browserSource(),
): BrowserSandboxService {
  const status: Signal<SandboxStatusPayload | null> = signal(null);
  const lifecycle: Signal<SandboxState> = signal<SandboxState>('idle');
  const lastExecution: Signal<SandboxExecution | null> = signal(null);

  const snapshot = computed<SandboxSnapshot>(() => ({
    state: lifecycle.value,
    variant: source.variant,
    kernelId: status.value?.kernel_id,
  }));
  const ready = computed(() => lifecycle.value === 'running');

  let serviceManager: ServiceManager.IManager | null = null;
  let kernel: KernelConnection | null = null;
  let starting: Promise<void> | null = null;

  async function start(): Promise<void> {
    if (kernel) {
      return;
    }
    lifecycle.value = 'starting';

    serviceManager = await source.acquire();
    const connection = await serviceManager.sessions.startNew({
      name: 'loop',
      path: 'loop.ipynb',
      type: 'notebook',
      kernel: { name: 'python' },
    });
    kernel = connection.kernel as unknown as KernelConnection;

    status.value = {
      variant: source.variant,
      sandbox_running: true,
      kernel_id: kernel?.id,
      kernel_name: 'python',
    };
    lifecycle.value = 'running';
  }

  return {
    kind: 'browser',
    snapshot,
    status,
    ready,
    lastExecution,
    // No server backs this sandbox. Callers that need one — the A2UI converter
    // lives on the server — should ask `kind` rather than discover it here.
    serverUrl: '',
    getServiceManager: () => serviceManager,
    report(next) {
      status.value = next;
    },
    setState(state) {
      lifecycle.value = state;
    },
    connect() {
      // Starting a Pyodide kernel takes seconds and megabytes; do it once, and
      // let a second caller await the same start rather than racing it.
      starting = starting ?? start().catch(error => {
        lifecycle.value = 'error';
        status.value = null;
        starting = null;
        throw error;
      });
      void starting;

      return () => {
        // Shut down the kernel this sandbox started, but never the manager
        // when the host owns it — JupyterLab is still using it for every other
        // notebook that is open.
        void kernel?.shutdown?.();
        kernel = null;
        serviceManager = source.owned ? null : serviceManager;
        starting = null;
        lifecycle.value = 'idle';
        status.value = null;
      };
    },
    async execute(code: string): Promise<SandboxExecution> {
      const startedAt = Date.now();
      try {
        await (starting ?? start());
        if (!kernel) {
          throw new Error('The browser kernel did not start');
        }

        const gathered = { outputs: [] as any[], stdout: [] as string[], error: '' };
        const future = kernel.requestExecute({ code });
        future.onIOPub = message => collect(message, gathered);
        await future.done;

        const execution: SandboxExecution = {
          code,
          success: !gathered.error,
          stdout: gathered.stdout.join(''),
          error: gathered.error || undefined,
          outputs: gathered.outputs,
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
