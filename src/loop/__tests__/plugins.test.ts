/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReactorFromPlugins, configurePlugin } from '@datalayer/reactor';
import {
  LoopChatSurface,
  LoopCommand,
  LoopViewType,
  canOpenView,
  createPromptChannel,
} from '../core';
import type { LoopWorkspaceContext } from '../core';
import {
  AGENTS_PLUGIN_NAME,
  AgentsPlugin,
  summarize,
  type AgentsOutput,
} from '../plugins/agents';
import { NotebookPlugin } from '../plugins/notebook';
import { DocumentPlugin } from '../plugins/document';
import { A2uiPlugin } from '../plugins/a2ui';
import { ChatPlugin } from '../plugins/chat';

function workspaceWith(
  state: LoopWorkspaceContext['sandbox'],
): LoopWorkspaceContext {
  return {
    serverUrl: 'http://server',
    agentId: 'default',
    sandbox: state,
    setSandbox: () => {},
    activeViewType: 'chat',
    setActiveViewType: () => {},
    prompts: createPromptChannel(),
    viewControls: {},
    setViewControls: () => {},
  };
}

describe('the sandbox service', () => {
  it('is published as the plugin build output', () => {
    const reactor = buildReactorFromPlugins([
      configurePlugin(AgentsPlugin, { serverUrl: 'http://server' }),
    ]);
    reactor.start();

    const output = reactor.getOutput<AgentsOutput>(AGENTS_PLUGIN_NAME);
    expect(output?.sandbox.serverUrl).toBe('http://server');
    expect(output?.sandbox.snapshot.peek()).toEqual({ state: 'idle' });
  });

  it('tracks status reports', () => {
    const reactor = buildReactorFromPlugins([
      configurePlugin(AgentsPlugin, { serverUrl: 'http://server' }),
    ]);
    reactor.start();
    const service =
      reactor.getOutput<AgentsOutput>(AGENTS_PLUGIN_NAME)!.sandbox;

    service.report({
      variant: 'jupyter-server',
      jupyter_connected: true,
      kernel_id: 'k-1',
      jupyter_url: 'http://kernel',
    });

    expect(service.snapshot.peek()).toEqual({
      state: 'running',
      variant: 'jupyter-server',
      kernelId: 'k-1',
      jupyterUrl: 'http://kernel',
    });
    expect(service.ready.peek()).toBe(true);
  });

  it('mounts its components in slots, not inside a view', () => {
    const reactor = buildReactorFromPlugins([
      configurePlugin(AgentsPlugin, { serverUrl: 'http://server' }),
    ]);
    reactor.start();

    // The sandbox does not stop existing when someone switches tabs, and the
    // control that moves it belongs where its state is shown. Two in the
    // status slot: the one that reports the sandbox, and the one that
    // launches the Datalayer target's agent — both keep the workspace
    // informed and neither draws anything.
    const output = reactor.getOutput<AgentsOutput>(AGENTS_PLUGIN_NAME);
    expect(output?.components?.map(c => c.id)).toEqual([
      'sandbox-status',
      'datalayer-agent',
      'sandbox-selector',
    ]);
  });
});

describe('summarize', () => {
  it('treats a connected Jupyter sandbox as running', () => {
    // Two spellings of the same fact, resolved once rather than in every view.
    expect(
      summarize({ variant: 'jupyter-server', jupyter_connected: true }, 'idle')
        .state,
    ).toBe('running');
    expect(summarize({ sandbox_running: true }, 'idle').state).toBe('running');
  });

  it('keeps a lifecycle state when nothing has been reported', () => {
    expect(summarize(null, 'starting')).toEqual({ state: 'starting' });
  });

  it('does not claim to be running when the report says otherwise', () => {
    expect(
      summarize({ variant: 'docker', sandbox_running: false }, 'running').state,
    ).toBe('idle');
  });
});

describe('the editor plugins', () => {
  it('pull the sandbox in as a dependency', () => {
    // Mounted without the base plugin: the reactor resolves it anyway.
    const reactor = buildReactorFromPlugins([NotebookPlugin, DocumentPlugin]);
    reactor.start();

    expect(reactor.hasPlugin(AGENTS_PLUGIN_NAME)).toBe(true);
  });

  it('are contributed to the chat, not to the workspace', () => {
    // A notebook is what the conversation is about; it belongs beside the
    // reply rather than in a tab of its own.
    const reactor = buildReactorFromPlugins([NotebookPlugin, DocumentPlugin]);
    reactor.start();

    expect(reactor.getContributions(LoopChatSurface).map(v => v.id)).toEqual([
      'notebook',
      'document',
    ]);
    // And nothing of theirs lands in the workspace's own view point.
    expect(reactor.getContributions(LoopViewType).map(v => v.id)).toEqual([
      'sandbox',
    ]);
  });

  it('offer their editors only with a running sandbox', () => {
    const reactor = buildReactorFromPlugins([NotebookPlugin, DocumentPlugin]);
    reactor.start();

    const surfaces = reactor.getContributions(LoopChatSurface);
    const notebook = surfaces.find(v => v.id === 'notebook')!.value;
    const document = surfaces.find(v => v.id === 'document')!.value;

    expect(canOpenView(notebook, workspaceWith({ state: 'idle' }))).toBe(false);
    expect(canOpenView(notebook, workspaceWith({ state: 'running' }))).toBe(
      true,
    );
    expect(canOpenView(document, workspaceWith({ state: 'idle' }))).toBe(false);
    // A greyed control explains itself.
    expect(
      notebook.unavailableReason?.(workspaceWith({ state: 'idle' })),
    ).toMatch(/sandbox/i);
  });

  it('orders the editors: notebook, then document', () => {
    const reactor = buildReactorFromPlugins([NotebookPlugin, DocumentPlugin]);
    reactor.start();

    expect(reactor.getContributions(LoopChatSurface).map(v => v.id)).toEqual([
      'notebook',
      'document',
    ]);
  });

  it('gates the surface view on a sandbox too', () => {
    const reactor = buildReactorFromPlugins([A2uiPlugin]);
    reactor.start();

    const surface = reactor
      .getContributions(LoopViewType)
      .find(v => v.id === 'a2ui')!.value;

    expect(canOpenView(surface, workspaceWith({ state: 'idle' }))).toBe(false);
    expect(canOpenView(surface, workspaceWith({ state: 'running' }))).toBe(
      true,
    );
  });

  it('each contribute a command that brings the chat forward', async () => {
    const reactor = buildReactorFromPlugins([NotebookPlugin, DocumentPlugin]);
    reactor.start();

    const opened: string[] = [];
    const workspace = {
      ...workspaceWith({ state: 'running' }),
      setActiveViewType: (v: string) => opened.push(v),
    };

    for (const entry of reactor.getContributions(LoopCommand)) {
      await entry.value.run({ workspace, argv: '' });
    }

    // The editors live in the chat now, so their commands open the chat; the
    // sandbox still has a view of its own.
    expect(opened.sort()).toEqual(['chat', 'chat', 'sandbox']);
  });

  it('takes its editor away when a plugin is disabled', () => {
    const reactor = buildReactorFromPlugins([NotebookPlugin, DocumentPlugin]);
    reactor.start();

    reactor.disable('@datalayer/loop-plugin-document');

    expect(reactor.getContributions(LoopChatSurface).map(v => v.id)).toEqual([
      'notebook',
    ]);
  });
});

describe('the chat plugin', () => {
  it('opens the point the editors arrive through', () => {
    const reactor = buildReactorFromPlugins([ChatPlugin]);
    reactor.start();

    // Declared rather than merely used: a host can draw the relationship
    // before anything has contributed to it.
    expect(reactor.getManifest(ChatPlugin.name)?.contributionPoints).toContain(
      LoopChatSurface.id,
    );
  });

  it('is the only thing that brings a prompt', () => {
    // The shell renders no prompt of its own, so a workspace without the chat
    // has nothing in its footer slot.
    const withoutChat = buildReactorFromPlugins([NotebookPlugin]);
    withoutChat.start();
    expect(
      withoutChat.getContributions(LoopViewType).map(v => v.id),
    ).not.toContain('chat');
  });
});

describe('the browser sandbox', () => {
  it('is the same interface with a different thing behind it', async () => {
    const { createBrowserSandboxService } =
      await import('../plugins/agents/browserService');
    const service = createBrowserSandboxService();

    // Everything a view asks a sandbox for, without a server anywhere.
    expect(service.kind).toBe('browser');
    expect(service.serverUrl).toBe('');
    expect(service.snapshot.peek()).toEqual({
      state: 'idle',
      variant: 'pyodide',
      kernelId: undefined,
    });
    expect(service.ready.peek()).toBe(false);
    expect(typeof service.execute).toBe('function');
    expect(typeof service.connect).toBe('function');
    expect(service.getServiceManager()).toBeNull();
  });
});

describe('moving the sandbox', () => {
  function build(target?: 'browser' | 'local' | 'cloud') {
    const reactor = buildReactorFromPlugins([
      configurePlugin(AgentsPlugin, {
        serverUrl: 'http://server',
        ...(target ? { target } : {}),
      }),
    ]);
    reactor.start();
    return reactor.getOutput<AgentsOutput>(AGENTS_PLUGIN_NAME)!.sandbox;
  }

  it('starts where it was told to', () => {
    expect(build().target.peek()).toBe('local');
    expect(build('browser').target.peek()).toBe('browser');
    expect(build('cloud').target.peek()).toBe('cloud');
  });

  it('reports the right kind for the active target', () => {
    expect(build('browser').kind).toBe('browser');
    expect(build('cloud').kind).toBe('server');
  });

  it('follows the active backing when it moves', async () => {
    const sandbox = build('local');
    // The server backing knows nothing yet; the browser one calls itself pyodide.
    expect(sandbox.snapshot.peek().variant).toBeUndefined();

    await sandbox.setTarget('browser');

    // Every signal a view reads follows across, not just `target`.
    expect(sandbox.target.peek()).toBe('browser');
    expect(sandbox.snapshot.peek().variant).toBe('pyodide');
    expect(sandbox.kind).toBe('browser');
    expect(sandbox.getServiceManager()).toBeNull();
  });

  it('asks the server for the variant a server-backed target means', async () => {
    const asked: Array<{ url: string; body: unknown }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: { body?: string }) => {
      asked.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') });
      return { ok: true, json: async () => ({}) };
    }) as never;

    try {
      const sandbox = build('browser');
      await sandbox.setTarget('datalayer');
      await sandbox.setTarget('local');
      await sandbox.setTarget('jupyter');
    } finally {
      globalThis.fetch = original;
    }

    const configured = asked.filter(a => a.url.endsWith('/sandbox/configure'));
    const restarted = asked.filter(a => a.url.endsWith('/sandbox/restart'));
    /*
     * Datalayer is not among them, and that is the point.
     *
     * It used to tell the *host's* server to put its sandbox on a Datalayer
     * runtime — a Jupyter server in the cloud with the agent still running
     * locally. It now allocates a runtime and creates an agent on it from an
     * agentspec, which `DatalayerAgentBridge` does through the agent hook and
     * no `configure` call can express.
     */
    expect(
      configured.map(a => (a.body as { variant: string }).variant),
    ).toEqual(['jupyter-server', 'jupyter-server']);
    // Local and the anonymous server run the same variant and differ by the
    // URL, which is the only thing that tells them apart on the wire.
    expect(
      (configured[0].body as { jupyter_url?: string }).jupyter_url,
    ).toBeUndefined();
    expect(
      (configured[1].body as { jupyter_url?: string }).jupyter_url,
    ).toContain('prod1.datalayer.run');
    expect(restarted).toHaveLength(2);
  });

  it('launches Local as an agent with its own Jupyter sandbox', async () => {
    const asked: Array<{ url: string; method: string; body?: unknown }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      asked.push({
        url: String(url),
        method,
        body:
          typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      if (method === 'GET') {
        return { ok: false, status: 404, statusText: 'Not Found' };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }) as never;

    try {
      const reactor = buildReactorFromPlugins([
        configurePlugin(AgentsPlugin, {
          serverUrl: 'http://server',
          target: 'browser',
          localAgent: {
            createPayload: {
              agent_library: 'pydantic-ai',
              agent_spec_id: 'example-simple',
            },
          },
        }),
      ]);
      reactor.start();
      const sandbox =
        reactor.getOutput<AgentsOutput>(AGENTS_PLUGIN_NAME)!.sandbox;
      const disconnect = sandbox.connect('loop-workspace');

      await sandbox.setTarget('local');
      disconnect();
    } finally {
      globalThis.fetch = original;
    }

    expect(asked.map(call => `${call.method} ${call.url}`)).toEqual([
      'GET http://server/api/v1/agents/loop-workspace',
      'POST http://server/api/v1/agents',
    ]);
    expect(asked[1].body).toMatchObject({
      name: 'loop-workspace',
      transport: 'ag-ui',
      agent_spec_id: 'example-simple',
      sandbox_variant: 'jupyter-server',
    });
    expect(
      asked.some(call => call.url.endsWith('/agents/sandbox/restart')),
    ).toBe(false);
  });

  it('puts the sandbox back when the server refuses the switch', async () => {
    // A failed switch should cost the person the switch, not the sandbox they
    // already had — and it must not leave the control claiming otherwise.
    const original = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false, status: 500 })) as never;

    try {
      const sandbox = build('browser');
      // A server-backed target, since that is what a server can refuse.
      // Datalayer no longer asks the host's server for anything.
      await expect(sandbox.setTarget('jupyter')).rejects.toThrow(/could not/i);
      expect(sandbox.target.peek()).toBe('browser');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('does nothing when asked to move where it already is', async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return { ok: true, json: async () => ({}) };
    }) as never;

    try {
      await build('local').setTarget('local');
    } finally {
      globalThis.fetch = original;
    }

    expect(calls).toBe(0);
  });

  it('closes the surface view rather than opening it onto nothing', () => {
    const reactor = buildReactorFromPlugins([A2uiPlugin]);
    reactor.start();
    const surface = reactor
      .getContributions(LoopViewType)
      .find(v => v.id === 'a2ui')!.value;

    const browser = workspaceWith({ state: 'running', variant: 'pyodide' });
    const server = workspaceWith({
      state: 'running',
      variant: 'jupyter-server',
    });

    // The converter lives on the server; a browser sandbox has nothing to
    // render with, and the tab says which.
    expect(canOpenView(surface, browser)).toBe(false);
    expect(surface.unavailableReason?.(browser)).toMatch(/browser/i);
    expect(canOpenView(surface, server)).toBe(true);
  });

  it('lets the notebook open on a browser sandbox', () => {
    const reactor = buildReactorFromPlugins([NotebookPlugin]);
    reactor.start();
    const notebook = reactor
      .getContributions(LoopChatSurface)
      .find(v => v.id === 'notebook')!.value;

    // The notebook does not care where the kernel lives.
    expect(
      canOpenView(
        notebook,
        workspaceWith({ state: 'running', variant: 'pyodide' }),
      ),
    ).toBe(true);
  });
});

describe('toggling the sandbox plugin', () => {
  it('keeps the sandbox it owns', () => {
    const reactor = buildReactorFromPlugins([
      configurePlugin(AgentsPlugin, { serverUrl: 'http://server' }),
    ]);
    reactor.start();
    const before = reactor.getOutput<AgentsOutput>(AGENTS_PLUGIN_NAME)!.sandbox;

    reactor.disable(AGENTS_PLUGIN_NAME);
    reactor.enable(AGENTS_PLUGIN_NAME);

    // The same service, so the notebook showing its kernel is not detached by
    // someone ticking a checkbox.
    expect(reactor.getOutput<AgentsOutput>(AGENTS_PLUGIN_NAME)!.sandbox).toBe(
      before,
    );
  });

  it('brings its view and its command back with it', () => {
    const reactor = buildReactorFromPlugins([
      configurePlugin(AgentsPlugin, { serverUrl: 'http://server' }),
    ]);
    reactor.start();

    reactor.disable(AGENTS_PLUGIN_NAME);
    expect(reactor.getContributions(LoopViewType)).toHaveLength(0);

    reactor.enable(AGENTS_PLUGIN_NAME);
    expect(reactor.getContributions(LoopViewType).map(v => v.id)).toEqual([
      'sandbox',
    ]);
  });
});

describe('the notebook toolbar affordances', () => {
  it('hand work to the specialists through the prompt, not a private call', async () => {
    // A button calling an agent directly would be a second way to invoke one,
    // free to drift from the way people type. These submit the same prompt
    // through the same channel.
    const { createPromptChannel } = await import('../core');
    const channel = createPromptChannel();
    const submitted: string[] = [];
    channel.subscribe(message => submitted.push(message));

    channel.submit(
      '@NotebookCompactor compact this notebook without changing what it computes.',
    );
    channel.submit(
      '@NotebookReproducer run this notebook top to bottom on a fresh sandbox and report what does not reproduce.',
    );

    expect(submitted).toHaveLength(2);
    expect(submitted[0]).toContain('@NotebookCompactor');
    expect(submitted[1]).toContain('@NotebookReproducer');
  });
});

describe('a server sandbox summary', () => {
  it('carries the Jupyter token beside the URL', () => {
    // The two are useless apart. Dropping the token here was invisible until a
    // cell ran into silence — the notebook reached a tokened server
    // unauthenticated, got refused at the first request, and produced no
    // output and no error anybody could act on.
    expect(
      summarize(
        {
          variant: 'jupyter-server',
          jupyter_connected: true,
          jupyter_url: 'http://localhost:8888',
          jupyter_token: 'secret',
          kernel_id: 'k1',
        },
        'idle',
      ),
    ).toEqual({
      state: 'running',
      variant: 'jupyter-server',
      kernelId: 'k1',
      jupyterUrl: 'http://localhost:8888',
      jupyterToken: 'secret',
    });
  });

  it('leaves it undefined when the server wants none', () => {
    const snapshot = summarize(
      { variant: 'jupyter-server', jupyter_connected: true, jupyter_url: 'u' },
      'idle',
    );
    expect(snapshot.jupyterToken).toBeUndefined();
  });
});

describe('the agent picker', () => {
  const source = readFileSync(
    join(__dirname, '..', 'plugins', 'agentspecs', 'AgentspecPicker.tsx'),
    'utf8',
  );

  it('re-reads the agent list when the sandbox moves', () => {
    // Choosing Local *creates* an agent — the one whose own Jupyter sandbox
    // backs that target. A list fetched once on mount cannot contain it, so
    // the indicator went on naming the previous agent and the switch looked
    // like it had done nothing.
    const deps = source.slice(source.indexOf('void fetch('));
    expect(deps).toContain('sandboxTarget');
    expect(deps).toContain('sandboxState');
  });

  it('follows the workspace when it is pointed at another agent', () => {
    expect(source).toContain('setActive(workspace.agentId)');
  });
});

describe('the Loop workspace example', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', 'examples', 'LoopWorkspaceExample.tsx'),
    'utf8',
  );

  it('tells the examples page where the workspace is running', () => {
    // The shell draws its "Active Agent" panel from a summary store, and the
    // workspace's segmented control drives a different signal — so switching
    // Browser to Local moved the sandbox and left the header saying `browser`
    // with no agent id.
    expect(source).toContain('agentSummaryStore.getState().setActive');
  });

  it('does not drive the page-level runtime target', () => {
    // The page mounts each example under `key={example:runtimeTarget}`, so
    // writing that store tears the workspace down and rebuilds it at its
    // initial target — the segmented control snapped back to Browser the
    // instant it was clicked.
    expect(source).not.toContain('setTarget(');
  });

  it('names an agent only for the targets that bring one', () => {
    expect(source).toContain(
      'targetHasAgent(sandboxTarget) ? agentId : undefined',
    );
  });
});

describe('the editor beside the chat', () => {
  const source = readFileSync(
    join(__dirname, '..', 'plugins', 'chat', 'ChatView.tsx'),
    'utf8',
  );

  it('opens the configured surface rather than starting empty', () => {
    expect(source).toContain('defaultSurface');
    expect(source).toContain('setSurfaceId(defaultSurface)');
  });

  it('waits until the surface can actually be opened', () => {
    // Surfaces arrive as their plugins activate, and these two need a running
    // sandbox — so the moment to open one is not the first render.
    expect(source).toContain('canOpenView(wanted.value, workspace)');
  });

  it('never reopens a surface the reader closed', () => {
    // Without this the default re-applies every time a new surface lands.
    expect(source).toContain('surfaceChosen.current = true');
    expect(source).toContain('onChange={chooseSurface}');
  });

  it('defaults to the notebook', () => {
    const plugin = readFileSync(
      join(__dirname, '..', 'plugins', 'chat', 'index.tsx'),
      'utf8',
    );
    expect(plugin).toContain("defaultSurface: 'notebook'");
  });
});
