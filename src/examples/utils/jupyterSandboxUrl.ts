/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which URL to hand an agent as its Jupyter sandbox.
 *
 * Its own module, and free of every runtime import, because the answer is
 * about a URL and nothing else — and because getting it wrong is what sent the
 * examples' agents at the Vite dev server.
 *
 * @module examples/utils/jupyterSandboxUrl
 */

import type { ServiceManager } from '@jupyterlab/services';

/**
 * Whether this URL could be a Jupyter server.
 *
 * It cannot be the page's own origin: the examples app is served by Vite, and
 * Vite answers `/api` with the single-page app rather than a Jupyter API. That
 * is precisely the URL an in-page (Pyodide) runtime reports as its `baseUrl`,
 * so without this check the browser target hands the agent runtime a sandbox
 * that can only 404 — which is exactly what it did.
 */
export function couldBeJupyterServer(url: string): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.origin !== window.location.origin) {
      return true;
    }
    // Same origin is fine when it is served under a Jupyter path — that is how
    // a proxied server looks — but not when it is the bare app root.
    return /\/(api\/)?jupyter/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * The Jupyter server to hand the agent, if there is one.
 *
 * `VITE_JUPYTER_SANDBOX_URL` wins when set: an operator naming the sandbox
 * outright knows better than anything inferred here.
 */
export function exampleJupyterSandboxUrl(
  serviceManager?: ServiceManager.IManager,
): string | undefined {
  const envUrl = import.meta.env.VITE_JUPYTER_SANDBOX_URL?.trim();
  if (envUrl) {
    return envUrl;
  }

  const baseUrl = serviceManager?.serverSettings?.baseUrl?.replace(/\/$/, '');
  if (!baseUrl || !couldBeJupyterServer(baseUrl)) {
    return undefined;
  }

  if (baseUrl.includes('token=')) {
    return baseUrl;
  }

  const token = serviceManager?.serverSettings?.token;
  if (!token) {
    return baseUrl;
  }

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
}
