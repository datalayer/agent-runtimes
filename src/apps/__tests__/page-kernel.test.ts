/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The kernel a side panel's notebook or document runs on (the user,
 * 24 November 2026: "for the demo app, use the browser runtime instead"):
 * the workspace's when its sandbox runs, else Python in this browser.
 */

import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { signal } from '@datalayer/reactor';

const workspace = { current: undefined as unknown };
const browserManager = { kind: 'browser-manager' };
const browserSnapshot = signal({ state: 'running', kernelId: 'pyodide-1' });
const connect = vi.fn(() => () => undefined);

vi.mock('../plugins/agents', () => ({
  useOptionalSandboxService: () => workspace.current,
}));
vi.mock('../plugins/agents/browserService', () => ({
  createBrowserSandboxService: () => ({
    snapshot: browserSnapshot,
    connect,
    getServiceManager: () => browserManager,
  }),
}));

const { usePageKernel } = await import('../pageTools/usePageKernel');

describe('usePageKernel', () => {
  it('runs on the workspace’s kernel when its sandbox runs', () => {
    const manager = { kind: 'workspace-manager' };
    workspace.current = {
      snapshot: signal({ state: 'running', kernelId: 'k-9' }),
      getServiceManager: () => manager,
    };
    const { result } = renderHook(() => usePageKernel());
    expect(result.current).toEqual({
      source: 'workspace',
      serviceManager: manager,
      kernelId: 'k-9',
      runtimeOverride: undefined,
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it('reaches a workspace sandbox on a server by its URL', () => {
    workspace.current = {
      snapshot: signal({
        state: 'running',
        kernelId: 'k-9',
        jupyterUrl: 'https://r1/jupyter',
        jupyterToken: 't',
      }),
      getServiceManager: () => null,
    };
    const { result } = renderHook(() => usePageKernel());
    expect(result.current).toMatchObject({
      source: 'workspace',
      runtimeOverride: { baseUrl: 'https://r1/jupyter', token: 't' },
    });
  });

  it('starts Python in this browser when the workspace runs no kernel (a public demo), once for the page', () => {
    workspace.current = undefined;
    const first = renderHook(() => usePageKernel());
    expect(first.result.current).toEqual({
      source: 'browser',
      serviceManager: browserManager,
      kernelId: 'pyodide-1',
    });
    renderHook(() => usePageKernel());
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
