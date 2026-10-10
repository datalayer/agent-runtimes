/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's two plugins, named once (LOOP F-15, F-16): the page's
 * plugin is `loop-app-<id>`, as its runtime's is, and requires it; the page's
 * plugins are delivered as one extension of that name; the page follows what
 * its runtime holds, and a run in the browser alone is never blank. Written
 * as a spec or round-tripped through the Canvas, an application is the same
 * pair (the runtime's half, and the `app.py` that eject writes, in
 * `agent_runtimes/tests/test_app_plugin_pair.py`).
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildReactorFromPlugins,
  definePlugin,
  describePluginGraph,
  extensionNodeId,
  pluginNodeId,
  backendNodeId,
  signal,
} from '@datalayer/reactor';
import { registerReactor } from '@datalayer/reactor/react';
import { appExtension, appPreset, defineAppPlugin } from '../apps/AppRenderer';
import {
  APP_RUNTIME_PLUGIN_NAME,
  AppRuntimePlugins,
} from '../apps/AppRuntimePlugins';
import {
  appPluginName,
  appPluginPair,
  appPluginsBase,
  appRuntimeOf,
} from '../apps/pluginPair';
import { readAppspecYaml, writeAppspecYaml } from '../apps/yaml';
import { LoopAgentBlueprint, LoopChatSuggestion } from '../core';
import { AGENTS_PLUGIN_NAME } from '../plugins/agents/plugin';
import { APP_CATALOGUE } from '../../specs/apps';
import type { AppSpec } from '../../types/agentspecs';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const research = APP_CATALOGUE['web-research'];
const NAME = 'loop-app-web-research';

/** The pair the page's plugin of an application says. */
const pagePairOf = (app: AppSpec) => {
  const plugin = defineAppPlugin(app);
  return {
    name: plugin.name,
    requiredBackendPlugins: plugin.requiredBackendPlugins,
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  registerReactor(null);
  document.body.replaceChildren();
});

describe('the pair, named once (F-15)', () => {
  it('is the application’s name on both tiers, each declaring the other', () => {
    expect(appPluginName('web-research')).toBe(NAME);
    expect(appPluginPair('web-research')).toEqual({
      page: { name: NAME, requiredBackendPlugins: [NAME] },
      server: { name: NAME, frontendDependencies: [NAME] },
      extension: NAME,
    });
    expect(pagePairOf(research)).toEqual(appPluginPair(research.id).page);
  });

  it('delivers the page’s plugins as one extension of that name, the runtime’s too', () => {
    const preset = appPreset(research);
    const reactor = buildReactorFromPlugins([
      appExtension(research, research, preset.plugins),
    ]);
    expect(reactor.listExtensions()).toEqual([NAME]);
    expect(reactor.getExtensionManifest(NAME)).toMatchObject({
      displayName: research.name,
      emoji: research.emoji,
    });
    expect(reactor.getManifest(NAME)?.extension).toBe(NAME);
    expect(reactor.getManifest(APP_RUNTIME_PLUGIN_NAME)?.extension).toBe(NAME);
    // The graph draws one application: its extension groups both tiers, and
    // each plugin of the pair names the other.
    const graph = describePluginGraph(reactor, {
      plugins: [{ name: NAME, extension: NAME, frontend_dependencies: [NAME] }],
    });
    const edge = (source: string, target: string) =>
      graph.edges.find(e => e.source === source && e.target === target)?.kind;
    expect(edge(extensionNodeId(NAME), pluginNodeId(NAME))).toBe('groups');
    expect(edge(extensionNodeId(NAME), backendNodeId(NAME))).toBe('groups');
    expect(edge(pluginNodeId(NAME), backendNodeId(NAME))).toBe(
      'requires-backend',
    );
    expect(edge(backendNodeId(NAME), pluginNodeId(NAME))).toBe(
      'requires-frontend',
    );
  });

  it('stands the page’s plugin down while its runtime does not hold it, and brings it back', async () => {
    const reactor = buildReactorFromPlugins(appPreset(research).plugins);
    reactor.start();
    await reactor.whenReady();
    const blueprints = () => reactor.getContributions(LoopAgentBlueprint);
    expect(blueprints()).toHaveLength(1);
    await reactor.setBackendPlugins([]);
    expect(blueprints()).toHaveLength(0);
    expect(reactor.getContributions(LoopChatSuggestion)).toHaveLength(0);
    // What tells it so is not stood down with it.
    expect(reactor.getManifest(APP_RUNTIME_PLUGIN_NAME)?.activated).toBe(true);
    await reactor.setBackendPlugins([NAME]);
    expect(blueprints()).toHaveLength(1);
  });
});

describe('the runtime a page follows (F-15)', () => {
  const running = { state: 'running' as const };

  it('is none in the browser alone, nor while one starts', () => {
    expect(
      appRuntimeOf({
        target: 'browser',
        snapshot: running,
        serverUrl: 'http://x',
      }),
    ).toBeUndefined();
    expect(
      appRuntimeOf({
        target: undefined,
        snapshot: running,
        serverUrl: 'http://x',
      }),
    ).toBeUndefined();
    expect(
      appRuntimeOf({
        target: 'local',
        snapshot: { state: 'starting' },
        serverUrl: 'http://x',
      }),
    ).toBeUndefined();
    expect(
      appRuntimeOf({
        target: 'datalayer',
        snapshot: { state: 'starting' },
        serverUrl: 'http://x',
      }),
    ).toBeUndefined();
  });

  it('is the runtime its agent was made on, else the server once it runs', () => {
    expect(
      appRuntimeOf({
        target: 'datalayer',
        snapshot: { state: 'idle', agentBaseUrl: 'https://r1/agent' },
        serverUrl: '',
      }),
    ).toBe('https://r1/agent');
    expect(
      appRuntimeOf({
        target: 'local',
        snapshot: running,
        serverUrl: 'http://x',
      }),
    ).toBe('http://x');
    expect(appPluginsBase('https://r1/agent/', 'web research')).toBe(
      'https://r1/agent/api/v1/apps/web%20research',
    );
  });
});

describe('a host telling the page what its runtime holds (F-15)', () => {
  /** A workspace with a sandbox where the test says, and the application. */
  async function mounted(target: 'browser' | 'local') {
    const sandbox = {
      target: signal(target),
      snapshot: signal({ state: 'running' as const }),
      serverUrl: 'http://runtime',
    };
    const agents = definePlugin({
      name: AGENTS_PLUGIN_NAME,
      build: () => ({ sandbox }),
    });
    const reactor = buildReactorFromPlugins([
      agents,
      defineAppPlugin(research),
    ]);
    reactor.start();
    await reactor.whenReady();
    registerReactor(reactor);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<AppRuntimePlugins appId={research.id} />);
    });
    return { reactor, root };
  }

  it('leaves a run in the browser alone whole: nothing is asked, nothing stands down', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { reactor, root } = await mounted('browser');
    await act(async () => {
      await reactor.setBackendPlugins([]);
    });
    // Mounted again on no runtime: the page is its own, and says so.
    await act(async () => {
      root.render(<AppRuntimePlugins appId={`${research.id}`} key="again" />);
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(reactor.getManifest(NAME)?.activated).toBe(true);
    root.unmount();
  });

  it('follows the runtime’s plugins of the application', async () => {
    let held: string[] = [];
    const fetcher = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({
        revision: held.length,
        plugins: held.map(name => ({ name, enabled: true, activated: true })),
      }),
      url,
    }));
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('EventSource', undefined);
    const { reactor, root } = await mounted('local');
    await act(async () => undefined);
    expect(fetcher).toHaveBeenCalledWith(
      'http://runtime/api/v1/apps/web-research/plugins/state',
    );
    expect(reactor.getManifest(NAME)?.activated).toBe(false);
    held = [NAME];
    root.unmount();
    const again = await mounted('local');
    await act(async () => undefined);
    expect(again.reactor.getManifest(NAME)?.activated).toBe(true);
    again.root.unmount();
  });
});

describe('the editors give the same pair (F-16)', () => {
  it('a spec, and the spec the Canvas writes back after an edit, are one pair', () => {
    for (const app of Object.values(APP_CATALOGUE)) {
      if (!app.agent) {
        continue;
      }
      const text = writeAppspecYaml(app);
      const spec = readAppspecYaml(text);
      expect(spec.problems, app.id).toEqual([]);
      // The Canvas edits the application and saves it into the same file.
      const edited = {
        ...spec.app,
        interface: { ...spec.app.interface, welcome: 'Edited on the Canvas.' },
      };
      const roundTripped = readAppspecYaml(writeAppspecYaml(edited, text));
      expect(roundTripped.problems, app.id).toEqual([]);
      expect(pagePairOf(spec.app), app.id).toEqual(appPluginPair(app.id).page);
      expect(pagePairOf(roundTripped.app), app.id).toEqual(
        pagePairOf(spec.app),
      );
    }
  });
});
