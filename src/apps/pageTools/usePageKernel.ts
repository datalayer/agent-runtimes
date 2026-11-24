/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The kernel a side panel's document or notebook runs its cells on (the user,
 * 24 November 2026: "for the demo app, use the browser runtime instead"):
 * the workspace's own when its sandbox runs (a person's runtime, or the
 * browser target), and otherwise Python in this browser (JupyterLite over
 * Pyodide), one for the page, started the first time a panel needs it. A
 * public demo has no runtime of its own; its notebook and its document's
 * cells run here, and nothing leaves the visitor's browser.
 *
 * @module apps/pageTools/usePageKernel
 */

import type { ServiceManager } from '@jupyterlab/services';
import { signal, type Signal } from '@datalayer/reactor';
import { useSignalValue } from '@datalayer/reactor/react';
import { useOptionalSandboxService } from '../plugins/agents';
import {
  createBrowserSandboxService,
  type BrowserSandboxService,
} from '../plugins/agents/browserService';

export type PageKernel = {
  /** Where the kernel is: the workspace's sandbox, the page's browser one, or none yet. */
  source: 'workspace' | 'browser' | 'starting';
  serviceManager?: ServiceManager.IManager;
  kernelId?: string;
  /** A workspace sandbox on a server, reached by URL. */
  runtimeOverride?: { baseUrl: string; token?: string };
};

let pageBrowser: BrowserSandboxService | undefined;

/** The page's browser sandbox, one for the page, connected once. */
export function pageBrowserSandbox(): BrowserSandboxService {
  if (!pageBrowser) {
    pageBrowser = createBrowserSandboxService();
    pageBrowser.connect();
  }
  return pageBrowser;
}

const IDLE: Signal<{ state: string; kernelId?: string }> = signal({
  state: 'idle',
});

export function usePageKernel(): PageKernel {
  const workspace = useOptionalSandboxService();
  const own = useSignalValue(
    (workspace?.snapshot ?? IDLE) as Signal<{
      state: string;
      kernelId?: string;
      jupyterUrl?: string;
      jupyterToken?: string;
    }>,
  );
  const workspaceRuns = own.state === 'running';
  const browser = workspaceRuns ? undefined : pageBrowserSandbox();
  const page = useSignalValue(
    (browser?.snapshot ?? IDLE) as Signal<{ state: string; kernelId?: string }>,
  );
  if (workspaceRuns && workspace) {
    const manager =
      (workspace.getServiceManager() as ServiceManager.IManager | null) ??
      undefined;
    return {
      source: 'workspace',
      serviceManager: manager,
      kernelId: manager ? own.kernelId : undefined,
      runtimeOverride:
        !manager && own.jupyterUrl
          ? { baseUrl: own.jupyterUrl, token: own.jupyterToken }
          : undefined,
    };
  }
  const manager =
    (browser?.getServiceManager() as ServiceManager.IManager | null) ??
    undefined;
  if (page.state === 'running' && manager) {
    return {
      source: 'browser',
      serviceManager: manager,
      kernelId: page.kernelId,
    };
  }
  return { source: 'starting' };
}
