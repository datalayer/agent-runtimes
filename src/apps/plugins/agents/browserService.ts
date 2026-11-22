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
 * @module apps/plugins/agents/browserService
 */

import { computed, signal, type Signal } from '@datalayer/reactor';
import { PageConfig } from '@jupyterlab/coreutils';
import type { Kernel, ServiceManager } from '@jupyterlab/services';
import type * as JupyterReact from '@datalayer/jupyter-react';
import type { SandboxSnapshot, SandboxState } from '../../core';
import type {
  SandboxExecution,
  SandboxService,
  SandboxStatusPayload,
} from './service';

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
  /**
   * The kernel's connection, once it is up: what a view that follows the
   * kernel itself listens to — its variables (jupyter-react's
   * `KernelVariables`), refreshed after each execution.
   */
  getKernelConnection: () => Kernel.IKernelConnection | null;
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
function collect(
  message: any,
  into: { outputs: any[]; stdout: string[]; error: string },
) {
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
  /**
   * Undo whatever `acquire` did to state outside itself, on disconnect.
   * Optional, because most sources take nothing; the in-page one gives the
   * page's Jupyter configuration back as soon as its manager is built.
   */
  release?: () => void;
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
      const jupyterReact = await import('@datalayer/jupyter-react');
      /*
       * Point Jupyter at this page while the kernel that lives in it is built,
       * and only then.
       *
       * A JupyterLite service manager takes its `serverSettings` from
       * `PageConfig` when it is created, and JupyterLite's kernels take their
       * socket address from it when their module loads, which is during that
       * creation. On a host configured for a remote Jupyter, which any
       * signed-in Datalayer page is, a kernel built without this opened its
       * WebSocket to that remote host, was refused, and every cell ran into
       * silence. `loadJupyterConfig({ lite: true })` is jupyter-react's own
       * way of saying "the page is the server".
       *
       * Once built, the manager holds its own settings, and the page's are put
       * back. `PageConfig` and jupyter-react's configuration are singletons
       * the whole page shares, and a sandbox is a component on somebody's
       * page: left pointed at this origin, every Jupyter client started after
       * it (the site's headless JupyterLab and its extensions) asked the site
       * itself for `/api/sessions`, `/api/kernelspecs`, `/datalayer/config`
       * and the rest, and parsed its HTML as JSON (the Studio's application
       * page, its Preview in the browser kept mounted, 22 November 2026).
       */
      const restore = borrowPageJupyterConfig(jupyterReact);
      try {
        jupyterReact.loadJupyterConfig({ lite: true });
        // Kept to this sandbox, never published as the page's manager
        // (jupyter-react's store): whatever else on the page uses Jupyter
        // adopts a published manager, and would have run on this in-page
        // kernel, its settings and its sessions, instead of the configured
        // server. The notebook and document views take it from
        // `getServiceManager()`.
        return await jupyterReact.createLiteServiceManager();
      } finally {
        restore();
      }
    },
    owned: true,
  };
}

/** What `borrowPageJupyterConfig` needs of jupyter-react. */
type JupyterConfigAccess = Pick<
  typeof JupyterReact,
  | 'getJupyterServerToken'
  | 'getJupyterServerUrl'
  | 'resetJupyterConfig'
  | 'setJupyterServerToken'
  | 'setJupyterServerUrl'
>;

/**
 * Note the page's Jupyter configuration — `PageConfig`'s `baseUrl`, `wsUrl`
 * and `token`, and jupyter-react's own, loaded or not — and return what puts
 * it back as it was.
 */
export function borrowPageJupyterConfig(
  jupyterReact: JupyterConfigAccess,
): () => void {
  const page = {
    baseUrl: PageConfig.getOption('baseUrl'),
    wsUrl: PageConfig.getOption('wsUrl'),
    token: PageConfig.getOption('token'),
  };
  let loaded: { url: string; token: string } | undefined;
  try {
    loaded = {
      url: jupyterReact.getJupyterServerUrl(),
      token: jupyterReact.getJupyterServerToken(),
    };
  } catch {
    // Not loaded yet: put back as not loaded, for the next reader to load.
    loaded = undefined;
  }
  return () => {
    if (loaded) {
      jupyterReact.setJupyterServerUrl(loaded.url);
      jupyterReact.setJupyterServerToken(loaded.token);
    } else {
      jupyterReact.resetJupyterConfig();
    }
    // Last: the setters above derive `wsUrl` from the URL, the page may not.
    PageConfig.setOption('baseUrl', page.baseUrl);
    PageConfig.setOption('wsUrl', page.wsUrl);
    PageConfig.setOption('token', page.token);
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
  let kernelConnection: Kernel.IKernelConnection | null = null;
  let starting: Promise<void> | null = null;

  async function start(): Promise<void> {
    if (kernel) {
      return;
    }
    lifecycle.value = 'starting';

    serviceManager = await source.acquire();
    const connection = await serviceManager.sessions.startNew({
      name: 'agent',
      path: 'agent.ipynb',
      type: 'notebook',
      kernel: { name: 'python' },
    });
    kernelConnection = connection.kernel;
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
    getKernelConnection: () => kernelConnection,
    report(next) {
      status.value = next;
    },
    setState(state) {
      lifecycle.value = state;
    },
    connect() {
      // Starting a Pyodide kernel takes seconds and megabytes; do it once, and
      // let a second caller await the same start rather than racing it.
      starting =
        starting ??
        start().catch(error => {
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
        kernelConnection = null;
        serviceManager = source.owned ? null : serviceManager;
        // And hand back whatever the source borrowed from the page.
        source.release?.();
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

        const gathered = {
          outputs: [] as any[],
          stdout: [] as string[],
          error: '',
        };
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
