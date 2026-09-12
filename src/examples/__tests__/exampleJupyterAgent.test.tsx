/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An example asks for its agent once.
 *
 * Written because five examples asked forever. Each ended its creation attempt
 * with `.catch(() => setCreateRequested(false))` while the effect making the
 * attempt depended on `createRequested`, so a failure re-armed the effect. With
 * an unreachable sandbox the examples app posted `/api/v1/agents` as fast as
 * the server could return 503, and the page looked like it was reloading
 * without end.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentConfig } from '../../types/config';
import { useCreateAgentOnce } from '../hooks/useCreateAgentOnce';
import { exampleJupyterSandboxUrl } from '../utils/jupyterSandboxUrl';

const CONFIG: AgentConfig = { name: 'test-agent' };

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let latest: ReturnType<typeof useCreateAgentOnce> | undefined;

function Probe(props: {
  enabled: boolean;
  alreadyCreated?: boolean;
  createAgent: (config: AgentConfig) => Promise<{ isReady?: boolean }>;
}) {
  latest = useCreateAgentOnce({
    ...props,
    // Rebuilt every render on purpose: a caller doing this must not provoke a
    // second attempt.
    config: { ...CONFIG },
  });
  return null;
}

/** Render, and re-render the way a live page would. */
async function render(props: Parameters<typeof Probe>[0], passes = 5) {
  for (let pass = 0; pass < passes; pass += 1) {
    await act(async () => {
      root.render(<Probe {...props} />);
    });
  }
}

beforeEach(() => {
  latest = undefined;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('asking for an example agent', () => {
  it('asks once, however often the page re-renders', async () => {
    const createAgent = vi
      .fn()
      .mockResolvedValue({ agentId: 'a1', isReady: true });
    await render({ enabled: true, createAgent });
    expect(createAgent).toHaveBeenCalledTimes(1);
  });

  it('does not ask again when the attempt fails', async () => {
    // The regression. A 503 used to reset the guard and re-arm the effect.
    const createAgent = vi
      .fn()
      .mockRejectedValue(new Error('Jupyter server returned HTTP 404'));
    await render({ enabled: true, createAgent }, 8);

    expect(createAgent).toHaveBeenCalledTimes(1);
    expect(latest?.attempted).toBe(true);
    expect(latest?.error).toBe('Jupyter server returned HTTP 404');
  });

  it('does not ask when there is nothing to ask for', async () => {
    const createAgent = vi.fn();
    await render({ enabled: false, createAgent });

    expect(createAgent).not.toHaveBeenCalled();
    expect(latest?.attempted).toBe(false);
  });

  it('does not ask when this agent already exists', async () => {
    const createAgent = vi.fn();
    await render({ enabled: true, alreadyCreated: true, createAgent });
    expect(createAgent).not.toHaveBeenCalled();
  });

  it('reports the agent it created, not what the shared state says', async () => {
    /*
     * The runtime state is a singleton the shell writes to as well: on the
     * cloud target it registers an agent of its own before an example mounts,
     * and `connectAgent` rebuilds the runtime without any agent id whenever
     * something reconnects. Neither is a sound answer to "does *this*
     * example's agent exist"; the call's own result is.
     */
    const createAgent = vi
      .fn()
      .mockResolvedValue({ agentId: 'mine', isReady: true });
    await render({ enabled: true, createAgent }, 3);

    expect(latest?.created).toEqual({ agentId: 'mine', isReady: true });
  });

  it('has created nothing while the attempt is failing', async () => {
    const createAgent = vi.fn().mockRejectedValue(new Error('nope'));
    await render({ enabled: true, createAgent }, 3);

    expect(latest?.created).toBeUndefined();
    expect(latest?.error).toBe('nope');
  });

  it('waits for its precondition, then asks exactly once', async () => {
    /*
     * The ordering that one-attempt-only has to get right, and did not at
     * first. On the cloud target the runtime is launched by the shell and
     * appears after the example has mounted; the store's `createAgent` needs
     * it to know where to post, and throws "No runtime connected" without one.
     *
     * An attempt spent while the precondition is false is an attempt wasted
     * forever — which showed up as the runtime answering "No agent registered
     * for this ID" to every message. The copies this replaced survived by
     * retrying blindly until one landed.
     */
    const createAgent = vi
      .fn()
      .mockResolvedValue({ agentId: 'a1', isReady: true });

    // Mounted before the runtime is there.
    await render({ enabled: false, createAgent }, 3);
    expect(createAgent).not.toHaveBeenCalled();
    expect(latest?.attempted).toBe(false);

    // The runtime arrives.
    await render({ enabled: true, createAgent }, 4);
    expect(createAgent).toHaveBeenCalledTimes(1);
    expect(latest?.attempted).toBe(true);
  });

  it('still asks only once if the precondition flickers', async () => {
    const createAgent = vi
      .fn()
      .mockResolvedValue({ agentId: 'a1', isReady: true });
    await render({ enabled: true, createAgent }, 2);
    await render({ enabled: false, createAgent }, 2);
    await render({ enabled: true, createAgent }, 2);
    expect(createAgent).toHaveBeenCalledTimes(1);
  });
});

describe('choosing a Jupyter sandbox', () => {
  it('does not offer the page itself', () => {
    // What an in-page (Pyodide) runtime reports as its `baseUrl`: the examples
    // app's own origin. Handing that over is how the agent runtime came to
    // probe the Vite dev server for `/api` and get the SPA's 404 — which is
    // what the failing attempts above were failing on.
    expect(
      exampleJupyterSandboxUrl({
        serverSettings: { baseUrl: window.location.origin, token: '' },
      } as never),
    ).toBeUndefined();
  });

  it('takes a same-origin URL served under a Jupyter path', () => {
    // A proxied server looks same-origin but is a real one.
    const proxied = `${window.location.origin}/api/jupyter-server`;
    expect(
      exampleJupyterSandboxUrl({
        serverSettings: { baseUrl: proxied, token: '' },
      } as never),
    ).toBe(proxied);
  });

  it('takes a server on another origin, with its token', () => {
    expect(
      exampleJupyterSandboxUrl({
        serverSettings: {
          baseUrl: 'http://localhost:8888/api/jupyter-server',
          token: 'se cret',
        },
      } as never),
    ).toBe('http://localhost:8888/api/jupyter-server?token=se%20cret');
  });

  it('has nothing to offer without a service manager', () => {
    expect(exampleJupyterSandboxUrl(undefined)).toBeUndefined();
  });
});
