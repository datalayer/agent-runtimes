/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The places a code sandbox can run, and which of them this page can use.
 *
 * A sandbox is not one kind of thing: it is a runtime of the platform, a
 * kernel of a Jupyter Server, a kernel of the browser — and, on the Python
 * side, a Kaggle session or a Modal container as well. Each of those is a
 * PROVIDER, each ships the environments it offers (the platform ships
 * `ai-agents-env`, Kaggle a CPU and a GPU session), and each is usable only
 * where what it needs is at hand.
 *
 * That last rule was written three times over — in the picker, in the
 * launcher, in the table of the sandboxes — and drifted every time it was
 * touched: withholding the platform inside JupyterLab took `ai-agents-env`
 * off the list and left no way to launch a remote sandbox there at all. It is
 * stated once here, and the three read it.
 *
 * The same concept lives in `code_sandboxes.providers` on the Python side,
 * where availability is decided by secrets rather than by services. Both
 * answer the same question — which providers can be used from here — so the
 * CLI, the web application and JupyterLab offer the same thing.
 *
 * @module components/code-sandboxes/codeSandboxProviders
 */

import { loadJupyterConfig } from '@datalayer/jupyter-react';
import type { IMultiServiceManager } from '../../api';
import type { IRuntimeLocation } from '../../models';

/** A place sandboxes run, as this page knows it. */
export type ICodeSandboxProvider = {
  /** Identifier of the provider, which is where its sandboxes run. */
  name: IRuntimeLocation;
  /** What it is called, for a person. */
  title: string;
  /** Whether this page can reach it at all. */
  available: boolean;
  /** Why not, when it cannot. */
  unavailableReason?: string;
};

/**
 * Every provider this page knows, and whether it can be used.
 *
 * @param multiServiceManager The services of the page, which say what is
 *   reachable: the platform when the account has it, the Jupyter Server when
 *   the page is one, the browser when kernels run in it
 */
export function codeSandboxProviders(
  multiServiceManager: IMultiServiceManager | undefined,
): ICodeSandboxProvider[] {
  /*
   * The Jupyter Server is the provider bound to WHERE the page runs.
   *
   * Its kernels belong to the server the page is talking to. Outside
   * JupyterLab there is no such server — what a manager reports as "local" is
   * somebody else's — so offering them promises what cannot be reached.
   */
  const insideJupyterLab = loadJupyterConfig().insideJupyterLab;
  return [
    {
      name: 'remote',
      title: 'Datalayer',
      available: Boolean(multiServiceManager?.remote),
      unavailableReason: multiServiceManager?.remote
        ? undefined
        : 'Sign in to Datalayer to launch a sandbox on the platform.',
    },
    {
      name: 'local',
      title: 'Jupyter Server',
      available: insideJupyterLab && Boolean(multiServiceManager?.local),
      unavailableReason: insideJupyterLab
        ? undefined
        : 'The kernels of a Jupyter Server are offered inside JupyterLab.',
    },
    {
      name: 'browser',
      title: 'Browser',
      available: Boolean(multiServiceManager?.browser),
      unavailableReason: multiServiceManager?.browser
        ? undefined
        : 'No kernel runs in this browser.',
    },
  ];
}

/**
 * Whether one provider can be used from this page.
 *
 * @param location Where the sandboxes of that provider run
 * @param multiServiceManager The services of the page
 */
export function isCodeSandboxProviderAvailable(
  location: IRuntimeLocation,
  multiServiceManager: IMultiServiceManager | undefined,
): boolean {
  return Boolean(
    codeSandboxProviders(multiServiceManager).find(
      provider => provider.name === location,
    )?.available,
  );
}

export default codeSandboxProviders;
