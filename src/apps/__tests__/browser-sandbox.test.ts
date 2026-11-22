/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Where an in-page kernel looks for itself, and what the page keeps.
 *
 * A JupyterLite service manager reads `PageConfig` when it is built, and
 * its kernels take their socket address from it then: built while the page
 * points at a remote Jupyter, the kernel's socket goes to a server that
 * refuses it, and cells run into nothing. So the sandbox points the page at
 * itself while it builds the manager.
 *
 * And only then: `PageConfig` and jupyter-react's configuration are shared
 * by everything on the page. Left pointed at this origin, and with the
 * manager published as the page's, every Jupyter client started after it
 * asked the site itself for `/api/sessions`, `/api/kernelspecs`,
 * `/datalayer/config` and the rest, parsing its HTML as JSON (the Studio's
 * application page, its Preview in the browser kept mounted, 22 November
 * 2026).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageConfig } from '@jupyterlab/coreutils';

const REMOTE = 'https://prod1.example/api/jupyter-server';

const fake = vi.hoisted(() => ({
  config: undefined as { url: string; token: string } | undefined,
  seenWhileBuilding: undefined as
    { baseUrl: string; wsUrl: string; url?: string } | undefined,
  published: [] as unknown[],
}));

vi.mock('@datalayer/jupyter-react', async () => {
  const { PageConfig } = await import('@jupyterlab/coreutils');
  const need = () => {
    if (!fake.config) {
      throw new Error('Jupyter React Config must be loaded first.');
    }
    return fake.config;
  };
  const setUrl = (url: string) => {
    need().url = url;
    PageConfig.setOption('baseUrl', url);
    PageConfig.setOption('wsUrl', url.replace(/^http/, 'ws'));
  };
  return {
    getJupyterServerUrl: () => need().url,
    getJupyterServerToken: () => need().token,
    setJupyterServerUrl: setUrl,
    setJupyterServerToken: (token: string) => {
      need().token = token;
      PageConfig.setOption('token', token);
    },
    resetJupyterConfig: () => {
      fake.config = undefined;
    },
    // As jupyter-react's: `lite` points the page at this origin.
    loadJupyterConfig: ({ lite }: { lite?: boolean } = {}) => {
      fake.config = {
        url: PageConfig.getOption('baseUrl'),
        token: PageConfig.getOption('token'),
      };
      if (lite) {
        setUrl(`${location.protocol}//${location.host}`);
      }
      return {};
    },
    createLiteServiceManager: async () => {
      fake.seenWhileBuilding = {
        baseUrl: PageConfig.getOption('baseUrl'),
        wsUrl: PageConfig.getOption('wsUrl'),
        url: fake.config?.url,
      };
      return {
        sessions: {
          startNew: async () => ({
            kernel: {
              id: 'lite-kernel',
              requestExecute: () => ({
                done: Promise.resolve(),
                onIOPub: null,
              }),
              shutdown: async () => {},
            },
          }),
        },
      };
    },
    jupyterReactStore: {
      getState: () => ({
        setServiceManager: (manager: unknown) => fake.published.push(manager),
      }),
    },
  };
});

import {
  browserSource,
  createBrowserSandboxService,
} from '../plugins/agents/browserService';

describe('the in-page sandbox and the page’s Jupyter configuration', () => {
  beforeEach(() => {
    PageConfig.setOption('baseUrl', REMOTE);
    PageConfig.setOption('wsUrl', 'wss://prod1.example/api/jupyter-server');
    PageConfig.setOption('token', 'page-token');
    fake.config = undefined;
    fake.seenWhileBuilding = undefined;
    fake.published = [];
  });

  afterEach(() => {
    fake.config = undefined;
  });

  it('builds its manager pointed at the page, then gives the page back its server', async () => {
    const manager = await browserSource().acquire();
    const origin = `${location.protocol}//${location.host}`;
    // While built: this origin, where the JupyterLite server answers.
    expect(fake.seenWhileBuilding).toEqual({
      baseUrl: origin,
      wsUrl: origin.replace(/^http/, 'ws'),
      url: origin,
    });
    // After: the configured server, as the page had it, wsUrl included.
    expect(PageConfig.getOption('baseUrl')).toBe(REMOTE);
    expect(PageConfig.getOption('wsUrl')).toBe(
      'wss://prod1.example/api/jupyter-server',
    );
    expect(PageConfig.getOption('token')).toBe('page-token');
    // jupyter-react's own configuration: not loaded before, not loaded after,
    // for the next reader to load from the page.
    expect(fake.config).toBeUndefined();
    // And the manager is the sandbox's own, not the page's.
    expect(manager).toBeTruthy();
    expect(fake.published).toEqual([]);
  });

  it('puts back a jupyter-react configuration that was loaded', async () => {
    fake.config = { url: REMOTE, token: 'page-token' };
    await browserSource().acquire();
    expect(fake.config).toEqual({ url: REMOTE, token: 'page-token' });
    expect(PageConfig.getOption('baseUrl')).toBe(REMOTE);
  });

  it('starts its kernel without leaving the page pointed at itself', async () => {
    const service = createBrowserSandboxService();
    const stop = service.connect();
    await vi.waitFor(() => expect(service.ready.peek()).toBe(true));
    expect(service.getServiceManager()).toBeTruthy();
    expect(PageConfig.getOption('baseUrl')).toBe(REMOTE);
    expect(fake.published).toEqual([]);
    stop();
    expect(PageConfig.getOption('baseUrl')).toBe(REMOTE);
  });
});
