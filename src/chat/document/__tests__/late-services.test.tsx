/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A document drawn before its kernel binds to the services that arrive
 * later (the user, 24 November 2026: "I insert a jupyter cell, run it and
 * see 'No runtime connected'"). The page's Python starts in the browser
 * after the editor is on screen; the editor stays (it used to be swapped for
 * a skeleton, and the one drawn after was a new, empty editor), its adapter
 * gets the services, and its kernel reaches the host once ready.
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

const kernels: Array<{ props: Record<string, unknown> }> = [];
const connection = { id: 'pyodide-1', name: 'python' };

vi.mock('@datalayer/jupyter-react', () => {
  class Kernel {
    props: Record<string, unknown>;
    ready = Promise.resolve();
    connection = connection;
    constructor(props: Record<string, unknown>) {
      this.props = props;
      kernels.push(this);
    }
  }
  class OutputAdapter {
    kernel: unknown;
    outputArea = {
      model: { toJSON: () => [], changed: { connect: () => undefined } },
    };
    constructor(_id: string, kernel: unknown) {
      this.kernel = kernel;
    }
    setOutputs() {}
  }
  return {
    Kernel,
    OutputAdapter,
    newUuid: () => Math.random().toString(36).slice(2),
    disposeServiceManager: () => undefined,
    JupyterReactTheme: ({ children }: { children: React.ReactNode }) =>
      children,
    KernelIndicator: () => null,
    loadJupyterConfig: () => ({}),
    OperationRunner: class {},
  };
});

vi.mock('../../../hooks/useAgentRuntimes', () => ({
  useAgentsRuntimes: () => ({ runtimes: [], refetchRuntimes: async () => {} }),
}));

const { lexicalStore } = await import('@datalayer/jupyter-lexical');
const { EphemeralDocument } = await import('../EphemeralDocument');

describe('a document whose kernel arrives after it is drawn', () => {
  it('keeps its editor and binds to the services', async () => {
    const onKernelChange = vi.fn();
    const { container, rerender } = render(
      <EphemeralDocument
        documentId="late-doc"
        withoutRuntime
        inheritTheme
        autoFocus={false}
        showToolbar={false}
        onKernelChange={onKernelChange}
      />,
    );
    const editor = () =>
      container.querySelector('[aria-label="Ephemeral document editor"]');
    await vi.waitFor(() => expect(editor()).not.toBeNull());
    const first = editor();
    expect(
      lexicalStore.getState().lexicals.get('late-doc')?.adapter?.serviceManager,
    ).toBeUndefined();

    const manager = {
      ready: Promise.resolve(),
      kernels: {
        connectTo: ({ model }: { model: { id: string; name: string } }) => ({
          model,
        }),
      },
      kernelspecs: {},
      sessions: {},
    };
    rerender(
      <EphemeralDocument
        documentId="late-doc"
        withoutRuntime
        inheritTheme
        autoFocus={false}
        showToolbar={false}
        onKernelChange={onKernelChange}
        serviceManager={manager as never}
        kernelId="pyodide-1"
      />,
    );
    // Never swapped out while the kernel connects.
    expect(editor()).toBe(first);
    await act(async () => {
      await Promise.resolve();
    });
    await vi.waitFor(() =>
      expect(
        lexicalStore.getState().lexicals.get('late-doc')?.adapter
          ?.serviceManager,
      ).toBe(manager),
    );
    expect(editor()).toBe(first);
    expect(kernels.at(-1)?.props).toMatchObject({
      kernelModel: { id: 'pyodide-1' },
      kernelManager: manager.kernels,
    });
    await vi.waitFor(() =>
      expect(onKernelChange).toHaveBeenLastCalledWith(connection),
    );
  });
});
