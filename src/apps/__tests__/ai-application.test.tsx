/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `AIApplication`, the React component of the host's own page (the user,
 * 16 November 2026): in visitor mode it reads a name as the element does —
 * `demo-marketer` at its address — and draws it on the visitors' runtime in
 * the anonymous preview, the Marketer's connections locked in its title
 * bar; in runtime mode it speaks to the agent already on the person's
 * runtime and makes nothing there; and `<datalayer-app>` draws through it.
 *
 * `AgentEmbed` is stood in for: what is tested is what the renderer hands it.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iamStore } from '@datalayer/core/lib/state/substates/IAMState';
import { getApp } from '../../specs/apps';
import { getAgentspecs } from '../../specs/agents';
import { dumpAppspec } from '../apps/appspec';
import { LOCKED_UI_PLUGIN_NAME } from '../plugins/locked-ui';

const seen = vi.hoisted(() => ({
  agent: [] as Array<Record<string, any>>,
  application: [] as Array<Record<string, any>>,
}));

vi.mock('../embed/AgentEmbed', () => ({
  AgentEmbed: (props: Record<string, any>) => {
    seen.agent.push(props);
    return <div data-testid="agent" />;
  },
}));

vi.mock('../AIApplication', async importOriginal => {
  const actual = await importOriginal<typeof import('../AIApplication')>();
  return {
    ...actual,
    AIApplication: (props: Record<string, any>) => {
      seen.application.push(props);
      return <actual.AIApplication {...(props as any)} />;
    },
  };
});

import {
  AIApplication,
  agentAppspec,
  resolveAIApplication,
} from '../AIApplication';
import { defineDatalayerAppElement } from '../embed/element';

const settle = async () => {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

async function render(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  await settle();
  return { container, root };
}

/** Every plugin's name, inside the extensions that group them too. */
const namesOf = (plugins: unknown[]): string[] =>
  plugins.flatMap((plugin: any) =>
    Array.isArray(plugin?.plugins)
      ? [plugin.name, ...namesOf(plugin.plugins)]
      : [plugin?.name],
  );

/** A plugin by name, inside the extensions too — never the extension, which an application's shares. */
const pluginNamed = (plugins: unknown[], name: string): any =>
  plugins
    .flatMap((plugin: any) =>
      Array.isArray(plugin?.plugins) ? plugin.plugins : [plugin],
    )
    .find((plugin: any) => plugin?.name === name);

/** ai-agents' answer for `demo-marketer` at its address, as a visitor reads it. */
const atDemoMarketer = () =>
  vi.fn(async (url: string) => {
    expect(url).toBe(
      'https://r1.example/api/ai-agents/v1/apps/deployments/at/demo-marketer',
    );
    return new Response(
      JSON.stringify({
        success: true,
        spec: dumpAppspec(getApp('demo-marketer')!),
        deployment: { app_name: 'Marketer' },
        session: { opens: true },
        runs_code: false,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });

beforeEach(() => {
  seen.agent.length = 0;
  seen.application.length = 0;
});

afterEach(() => {
  iamStore.setState({ token: undefined } as never);
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('AIApplication in visitor mode', () => {
  it('reads demo-marketer at its address, a skeleton meanwhile, and runs it on the visitors’ runtime in the anonymous preview, its connections locked', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const fetcher = atDemoMarketer();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        await gate;
        return fetcher(url);
      }),
    );
    const onSignIn = vi.fn();
    const { container, root } = await render(
      <AIApplication
        app="demo-marketer"
        runsOn={{
          kind: 'visitor',
          api: 'https://r1.example/',
          maxTurns: 10,
          onSignIn,
        }}
      />,
    );
    // Read first: its skeleton in its place, nothing run.
    expect(
      container.querySelector('[data-application-skeleton]'),
    ).not.toBeNull();
    expect(seen.agent).toHaveLength(0);
    await act(async () => release());
    await settle();
    expect(container.querySelector('[data-application-skeleton]')).toBeNull();
    const agentProps = seen.agent.at(-1)!;
    expect(agentProps).toMatchObject({
      agentId: 'at-demo-marketer',
      runAsAnonymous: true,
      maxTurns: 10,
      datalayerVisitors: {
        url: 'https://r1.example/api/runtime-visitors',
        app: 'at:demo-marketer',
        inferenceUrl: 'https://r1.example',
      },
    });
    expect(agentProps.onSignIn).toBeTypeOf('function');
    // What the Marketer would bring that needs the visitor's own
    // connection, locked in the title bar.
    expect(namesOf(agentProps.plugins)).toContain(LOCKED_UI_PLUGIN_NAME);
    // In the host's theme: none of its own named, nor a mode.
    expect(agentProps.themeVariant).toBeUndefined();
    expect(agentProps.colorMode).toBeUndefined();
    await act(async () => root.unmount());
  });

  it('hands the host’s call to action to the preview, for a viewer who is signed in', async () => {
    vi.stubGlobal('fetch', atDemoMarketer());
    const onAction = vi.fn();
    const { root } = await render(
      <AIApplication
        app="demo-marketer"
        runsOn={{
          kind: 'visitor',
          api: 'https://r1.example/',
          maxTurns: 10,
          callToAction: {
            says: 'Make it yours: open your own Marketer.',
            label: 'Open your own Marketer',
            onAction,
          },
        }}
      />,
    );
    const agentProps = seen.agent.at(-1)!;
    // Still the visitors' runtime and its turns: only the words and the action change.
    expect(agentProps).toMatchObject({
      runAsAnonymous: true,
      maxTurns: 10,
      callToAction: {
        says: 'Make it yours: open your own Marketer.',
        label: 'Open your own Marketer',
      },
    });
    agentProps.callToAction.onAction();
    expect(onAction).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it('says, in place and in plain words, that no application is at an address a visitor may not reach', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ detail: 'No application is at this address.' }),
            {
              status: 404,
            },
          ),
      ),
    );
    const { container, root } = await render(
      <AIApplication
        app="private-desk"
        runsOn={{ kind: 'visitor', api: 'https://r1.example' }}
      />,
    );
    const said = container.querySelector<HTMLElement>(
      '[data-application-missing]',
    )!;
    expect(said.getAttribute('role')).toBe('status');
    // One sentence, no internal name, no prefix: the detail goes to the console.
    expect(said.textContent).toBe('No application is at this address.');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'datalayer-app: No application is at this address.',
      ),
    );
    expect(seen.agent).toHaveLength(0);
    warn.mockRestore();
    await act(async () => root.unmount());
  });

  it('frames a decision named by its id', async () => {
    const resolved = await resolveAIApplication({
      app: '01M4DF584YAF36ACJRTYG341E5',
      runsOn: { kind: 'visitor', origin: 'https://datalayer.ai' },
    });
    expect(resolved).toEqual({
      kind: 'frame',
      src: 'https://datalayer.ai/public/apps/01M4DF584YAF36ACJRTYG341E5/run?embed=1',
    });
  });
});

describe('AIApplication in runtime mode', () => {
  it('keeps a notebook placed in a side-panel tab out of the middle editor column', () => {
    const spec = getAgentspecs('worker-data-analyst');
    expect(spec?.version).toBe('0.0.2');
    expect(spec?.systemPrompt).toMatch(
      /They are available in a\s+public demo too\./,
    );
    expect(spec?.systemPrompt).toContain(
      'populate the already-mounted blank tab',
    );
    expect(spec?.systemPrompt).toContain('documentReadAllBlocks');
    expect(spec?.systemPrompt).not.toContain('documentReadBlocks');
    expect(spec?.ui?.map(choice => choice.plugin)).toContain('page-notebook');
    expect(spec?.frontendTools?.map(tool => tool.id)).toContain(
      'jupyter-notebook',
    );
    const app = agentAppspec(spec!);

    expect(app.interface.layout).toBe('chat');
    expect(app.ui).toContainEqual(
      expect.objectContaining({
        plugin: 'page-notebook',
        placement: 'right',
        tab: 'Notebook',
      }),
    );

    const demo = getApp('demo-data-analyst');
    expect(demo?.version).toBe('0.0.8');
    expect(demo?.agent).toBe('worker-data-analyst:0.0.2');
    expect(demo?.instructions).toContain(
      'They require no account and no filesystem.',
    );
    expect(demo?.instructions).toContain('documentReadAllBlocks');
    expect(demo?.instructions).not.toContain('documentReadBlocks');
  });

  it('does not infer a work surface from a frontend tool declaration alone', () => {
    const spec = getAgentspecs('worker-data-analyst')!;
    const toolOnly = {
      id: 'worker-tool-only',
      name: 'Tool only',
      description: 'Has notebook tools but no injected surface UI.',
      frontendTools: spec.frontendTools,
    };
    const app = agentAppspec(toolOnly);

    expect(app.interface.layout).toBe('chat');
  });

  it('talks to the agent already on the person’s runtime, by its name there, and goes on with its session', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    const spec = {
      id: 'worker-marketer',
      name: 'Marketer',
      description: 'Plans and drafts social posts.',
      emoji: '📣',
      welcomeMessage: 'What are we posting?',
      suggestions: [{ text: 'Plan a launch week', summary: 'Plan a launch' }],
    };
    const app = agentAppspec(spec);
    expect(app).toMatchObject({
      id: 'worker-marketer',
      agent: 'worker-marketer',
      kind: 'chat',
      interface: {
        layout: 'chat',
        welcome: 'What are we posting?',
        starters: [{ label: 'Plan a launch', message: 'Plan a launch week' }],
      },
    });
    const thread = { id: 'session-1', messages: [], fromRuntime: true };
    const { container, root } = await render(
      <AIApplication
        app={app}
        runsOn={{
          kind: 'runtime',
          url: 'https://r1.example/agent-runtimes/pool/rt-1/',
          agentId: 'default',
          name: 'rt-1',
          thread,
        }}
      />,
    );
    // An Appspec is drawn at once.
    expect(container.querySelector('[data-application-skeleton]')).toBeNull();
    const agentProps = seen.agent.at(-1)!;
    expect(agentProps).toMatchObject({
      agentId: 'default',
      target: 'datalayer',
      datalayerKept: {
        url: 'https://r1.example/agent-runtimes/pool/rt-1',
        name: 'rt-1',
      },
      thread,
    });
    expect(agentProps.datalayerVisitors).toBeUndefined();
    expect(agentProps.runAsAnonymous).toBeUndefined();
    // Its page plugin requires nothing of a runtime that holds no plugin of
    // the application, and nothing follows it there.
    const appPlugin = pluginNamed(
      agentProps.plugins,
      'agent-app-worker-marketer',
    );
    expect(appPlugin).toBeDefined();
    expect(appPlugin.requiredBackendPlugins).toBeUndefined();
    expect(namesOf(agentProps.plugins)).not.toContain(
      '@datalayer/agent-plugin-app-runtime',
    );
    expect(namesOf(agentProps.plugins)).not.toContain(LOCKED_UI_PLUGIN_NAME);
    await act(async () => root.unmount());
  });
});

describe('AIApplication at an application’s address (/apps/<slug>)', () => {
  it('hands its renderer the page’s plugins, the UI plugins turned off and its computer, and runs a kept deployment as its own agent', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    const own = { name: 'studio-cards-test', build: () => ({}) } as never;
    const app = getApp('month-end-close')!;
    const { root } = await render(
      <AIApplication
        app={app}
        runsOn={{
          kind: 'runtime',
          url: 'https://r1.example/agent-runtimes/pool/kept-1',
        }}
        instance={{ appUid: '01APP', deploymentUid: 'dep-1', version: 3 }}
        renderer={{
          plugins: [own],
          pluginsOff: ['a2ui'],
          computer: true,
          autoFocusPrompt: true,
        }}
      />,
    );
    const agentProps = seen.agent.at(-1)!;
    expect(agentProps).toMatchObject({
      agentId: 'month-end-close',
      datalayerKept: { url: 'https://r1.example/agent-runtimes/pool/kept-1' },
      autoFocusPrompt: true,
    });
    expect(agentProps.plugins).toContain(own);
    // Its own agent, the application's pair whole: its page plugin requires its runtime's.
    expect(
      pluginNamed(agentProps.plugins, 'agent-app-month-end-close')
        .requiredBackendPlugins,
    ).toEqual(['agent-app-month-end-close']);
    expect(namesOf(agentProps.plugins)).toContain(
      '@datalayer/agent-plugin-app-computer-month-end-close',
    );
    await act(async () => root.unmount());
  });
});

describe('the element', () => {
  defineDatalayerAppElement({
    scriptUrl: 'https://datalayer.app/embed/datalayer-app.js',
  });

  it('draws through AIApplication, in its own theme, in its shadow root', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    const element = document.createElement('datalayer-app');
    element.setAttribute('mode', 'inline');
    element.innerHTML =
      '<script type="application/json">{"id":"support-desk","name":"Support Desk","kind":"chat","agent":"support-agent"}</script>';
    await act(async () => {
      document.body.appendChild(element);
    });
    await settle();
    const drawn = seen.application.at(-1)!;
    expect(drawn.app.id).toBe('support-desk');
    expect(drawn).toMatchObject({
      theme: 'own',
      ownPortal: true,
      runsOn: { kind: 'datalayer' },
    });
    expect(
      element.shadowRoot!.querySelector('.datalayer-app-root'),
    ).not.toBeNull();
    expect(seen.agent.at(-1)!.agentId).toBe('support-desk');
    await act(async () => element.remove());
  });

  it('hands a public name to AIApplication’s visitor mode, the preview on', async () => {
    const element = document.createElement('datalayer-app');
    element.setAttribute('app', 'web-research');
    element.setAttribute('api', 'https://r1.example');
    element.setAttribute('max-turns', '10');
    await act(async () => {
      document.body.appendChild(element);
    });
    await settle();
    expect(seen.application.at(-1)!.runsOn).toMatchObject({
      kind: 'visitor',
      anonymous: true,
      maxTurns: 10,
      visitors: {
        app: 'web-research',
        url: 'https://r1.example/api/runtime-visitors',
      },
    });
    await act(async () => element.remove());
  });
});
