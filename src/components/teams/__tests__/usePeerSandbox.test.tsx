/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A peer's *Code Sandbox Details…*: the codemode sandbox of the runtime it
 * answers from, or that runtime offered as not running.
 */

// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runtimeBaseOfA2AUrl, usePeerSandbox } from '../usePeerSandbox';

const A2A = 'http://localhost:8767/api/v1/a2a/agents/accounting/';

afterEach(() => vi.unstubAllGlobals());

describe('usePeerSandbox', () => {
  it('finds the runtime an A2A address is served from', () => {
    expect(runtimeBaseOfA2AUrl(A2A)).toBe('http://localhost:8767');
    expect(
      runtimeBaseOfA2AUrl(
        'https://r1.datalayer.run/agent-runtimes/pool/abc/api/v1/a2a/agents/accounting',
      ),
    ).toBe('https://r1.datalayer.run/agent-runtimes/pool/abc');
  });

  it('reads the sandbox the runtime reports', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sandbox: { variant: 'eval', sandbox_running: true },
      }),
    });
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => usePeerSandbox(A2A));
    await waitFor(() => expect(result.current.status).toBe('running'));
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8767/api/v1/configure/codemode/status',
    );
    expect(result.current).toMatchObject({
      kind: 'runtime',
      variant: 'eval',
      serverUrl: 'http://localhost:8767',
    });
  });

  it('offers it as not running until it has one, unreachable when the runtime is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ sandbox: null }) }),
    );
    const idle = renderHook(() => usePeerSandbox(A2A));
    expect(idle.result.current.status).toBe('not running');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')));
    const down = renderHook(() => usePeerSandbox(A2A));
    await waitFor(() => expect(down.result.current.status).toBe('unreachable'));
  });
});
