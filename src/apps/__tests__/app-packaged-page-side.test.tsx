/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's page side packaged as a Reactor extension (LOOP P-29): a
 * component that is a file of the application's folder is reviewed as one,
 * the page side its package carries is read with Reactor's
 * `bootstrapExtensions` and installed into the running platform, and the
 * component is fetched from where that page side says its files are.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bootstrapExtensions,
  buildReactorFromPlugins,
  definePlugin,
  type ReactorExtension,
} from '@datalayer/reactor';
import { registerReactor } from '@datalayer/reactor/react';
import { CustomComponentView } from '../../components/a2ui/custom';
import { parseAppspec } from '../apps/appspec';
import {
  customComponentProblems,
  folderSourceUrl,
  hasFolderModules,
  isFolderSource,
} from '../apps/customComponents';
import { LoopAppFiles } from '../core/appFiles';
import type { AppCustomComponentSpec } from '../../types/agentspecs';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const DIAL: AppCustomComponentSpec = {
  name: 'Dial',
  description: 'A dial.',
  props: { type: 'object', properties: { label: { type: 'string' } } },
  shows: ['value'],
  sends: [],
  source: 'components/dial.js',
  integrity: '',
  height: 120,
} as unknown as AppCustomComponentSpec;

const RUNTIME = 'http://127.0.0.1:8765';
const BASE = `${RUNTIME}/api/v1/apps/dial-desk`;
const FILES = `${BASE}/reactor-extensions/loop-app-dial-desk/`;

/** What `GET <base>/plugins/frontend-extensions` answers for an installed package. */
const RECORD = {
  name: 'loop-app-dial-desk',
  version: '0.0.1',
  displayName: 'Dial desk',
  apiVersion: 'v1',
  kind: 'esm',
  entry: '/reactor-extensions/loop-app-dial-desk/index.js?v=1',
  plugins: [
    {
      name: 'loop-app-dial-desk/page',
      requiredBackendPlugins: ['loop-app-dial-desk'],
      export: '',
    },
  ],
  backendPlugins: ['loop-app-dial-desk'],
};

/**
 * What the generated `index.js` (`page_side_module`) evaluates to, served at
 * `FILES`: a plain object, no import, its base its own directory.
 */
const PAGE_SIDE = (url: string) => ({
  default: {
    name: 'loop-app-dial-desk/page',
    contributes: [
      {
        point: { id: 'loop.app.files' },
        value: { app: 'dial-desk', base: new URL('./', url).href },
        options: { id: 'dial-desk' },
      },
    ],
  },
});

let mounted: { root: Root; container: HTMLElement } | null = null;

afterEach(() => {
  if (mounted) {
    const { root, container } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = null;
  }
  registerReactor(null);
});

describe('a component that is a file of its folder', () => {
  it('is reviewed by its path in the folder', () => {
    expect(isFolderSource('dial.js')).toBe(true);
    expect(isFolderSource('./components/dial.mjs')).toBe(true);
    for (const source of [
      'https://e.example.com/d.js',
      '../dial.js',
      '/srv/dial.js',
      'dial.css',
    ]) {
      expect(isFolderSource(source)).toBe(false);
    }
    expect(customComponentProblems(DIAL)).toEqual([]);
    expect(
      customComponentProblems({ ...DIAL, source: 'a/../../dial.js' }).join(' '),
    ).toContain('named by its path in it');
    expect(folderSourceUrl('./components/dial.js', FILES)).toBe(
      `${FILES}components/dial.js`,
    );
  });

  it('marks its application as having a packaged page side', () => {
    const app = (source: string) =>
      parseAppspec({
        id: 'dial-desk',
        name: 'Dial desk',
        kind: 'chat',
        agent: 'example-simple',
        interface: {
          layout: 'chat',
          custom_components: [
            {
              name: 'Dial',
              description: 'A dial.',
              props: { type: 'object', properties: {} },
              source,
            },
          ],
        },
      }).app;
    expect(hasFolderModules(app('dial.js'))).toBe(true);
    expect(hasFolderModules(app('https://e.example.com/d.js'))).toBe(false);
  });
});

describe('its packaged page side', () => {
  it('is read with bootstrapExtensions and installed, saying where its files are', async () => {
    const reactor = buildReactorFromPlugins([
      definePlugin({ name: 'host', build: () => ({}) }),
    ]);
    reactor.start();
    await reactor.setBackendPlugins(['loop-app-dial-desk']);
    const fetchJson = vi.fn(async () => [RECORD]);
    const loader = vi.fn(async (url: string) => PAGE_SIDE(url));
    const found = await bootstrapExtensions(BASE, { fetchJson, loader });
    expect(fetchJson).toHaveBeenCalledWith(
      `${BASE}/plugins/frontend-extensions`,
    );
    const own = found.filter(
      item => item.name === 'loop-app-dial-desk',
    ) as ReactorExtension[];
    expect(own).toHaveLength(1);
    await reactor.install(own[0]);
    await reactor.whenReady();
    await vi.waitFor(() =>
      expect(
        reactor.getContributions(LoopAppFiles).map(entry => entry.value),
      ).toEqual([{ app: 'dial-desk', base: FILES }]),
    );
    expect(loader.mock.calls[0][0]).toBe(
      `${BASE}/reactor-extensions/loop-app-dial-desk/index.js?v=1`,
    );
  });

  it('draws the component from there, and says so while nothing serves it', async () => {
    const code = 'export default () => ({})';
    const fetcher = vi.fn(async () => new Response(code));
    const reactor = buildReactorFromPlugins([
      definePlugin({ name: 'host', build: () => ({}) }),
    ]);
    reactor.start();
    registerReactor(reactor);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted = { root, container };
    await act(async () => {
      root.render(
        <CustomComponentView
          component={DIAL}
          props={{ label: 'Load', value: 1 }}
          fetcher={fetcher}
          appId="dial-desk"
        />,
      );
    });
    const frame = container.querySelector('iframe')!;
    const told: unknown[] = [];
    vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(
      (message: unknown) => {
        told.push(message);
      },
    );
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { tag: 'loop.component', kind: 'ready' },
          source: frame.contentWindow,
        }),
      );
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    // Nothing serves its folder yet: nothing fetched, and said.
    expect(fetcher).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "is a file of its application's folder: it is drawn once the server running the application serves its package",
    );
    // Its package's page side says where: fetched from there, and drawn.
    await act(async () => {
      await reactor.install(
        definePlugin({
          ...PAGE_SIDE(`${FILES}index.js`).default,
          build: () => ({}),
        }) as never,
      );
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((fetcher.mock.calls[0] as unknown[])[0]).toBe(
      `${FILES}components/dial.js`,
    );
    expect(told).toContainEqual({
      tag: 'loop.component',
      kind: 'module',
      code,
    });
    expect(container.textContent).not.toContain('is a file of its');
  });
});
