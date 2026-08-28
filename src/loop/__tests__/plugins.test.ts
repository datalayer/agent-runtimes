/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, expect, it } from 'vitest';
import { buildReactorFromExtensions, configExtension } from '@datalayer/reactor';
import { LoopCommand, LoopViewType, canOpenView, createPromptChannel } from '../core';
import type { LoopWorkspaceContext } from '../core';
import {
  CODE_SANDBOX_EXTENSION_NAME,
  CodeSandboxExtension,
  summarize,
  type CodeSandboxOutput,
} from '../plugins/code-sandbox';
import { NotebookExtension } from '../plugins/notebook';
import { DocumentExtension } from '../plugins/document';
import { A2uiExtension } from '../plugins/a2ui';

function workspaceWith(state: LoopWorkspaceContext['sandbox']): LoopWorkspaceContext {
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
    const reactor = buildReactorFromExtensions([
      configExtension(CodeSandboxExtension, { serverUrl: 'http://server' }),
    ]);
    reactor.start();

    const output = reactor.getOutput<CodeSandboxOutput>(CODE_SANDBOX_EXTENSION_NAME);
    expect(output?.sandbox.serverUrl).toBe('http://server');
    expect(output?.sandbox.snapshot.peek()).toEqual({ state: 'idle' });
  });

  it('tracks status reports', () => {
    const reactor = buildReactorFromExtensions([
      configExtension(CodeSandboxExtension, { serverUrl: 'http://server' }),
    ]);
    reactor.start();
    const service = reactor.getOutput<CodeSandboxOutput>(
      CODE_SANDBOX_EXTENSION_NAME,
    )!.sandbox;

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
    const reactor = buildReactorFromExtensions([
      configExtension(CodeSandboxExtension, { serverUrl: 'http://server' }),
    ]);
    reactor.start();

    // The sandbox does not stop existing when someone switches tabs, and the
    // control that moves it belongs where its state is shown.
    const output = reactor.getOutput<CodeSandboxOutput>(CODE_SANDBOX_EXTENSION_NAME);
    expect(output?.components?.map(c => c.slot)).toEqual([
      'loop.status',
      'loop.header',
    ]);
  });
});

describe('summarize', () => {
  it('treats a connected Jupyter sandbox as running', () => {
    // Two spellings of the same fact, resolved once rather than in every view.
    expect(
      summarize({ variant: 'jupyter-server', jupyter_connected: true }, 'idle').state,
    ).toBe('running');
    expect(summarize({ sandbox_running: true }, 'idle').state).toBe('running');
  });

  it('keeps a lifecycle state when nothing has been reported', () => {
    expect(summarize(null, 'starting')).toEqual({ state: 'starting' });
  });

  it('does not claim to be running when the report says otherwise', () => {
    expect(summarize({ variant: 'docker', sandbox_running: false }, 'running').state).toBe(
      'idle',
    );
  });
});

describe('the surface plugins', () => {
  it('pull the sandbox in as a dependency', () => {
    // Mounted without the base plugin: the reactor resolves it anyway.
    const reactor = buildReactorFromExtensions([NotebookExtension, DocumentExtension]);
    reactor.start();

    expect(reactor.hasExtension(CODE_SANDBOX_EXTENSION_NAME)).toBe(true);
  });

  it('offer their views only with a running sandbox', () => {
    const reactor = buildReactorFromExtensions([NotebookExtension, DocumentExtension]);
    reactor.start();

    const views = reactor.getContributions(LoopViewType);
    const notebook = views.find(v => v.id === 'notebook')!.value;
    const document = views.find(v => v.id === 'document')!.value;

    expect(canOpenView(notebook, workspaceWith({ state: 'idle' }))).toBe(false);
    expect(canOpenView(notebook, workspaceWith({ state: 'running' }))).toBe(true);
    expect(canOpenView(document, workspaceWith({ state: 'idle' }))).toBe(false);
    // A greyed tab explains itself.
    expect(notebook.unavailableReason?.(workspaceWith({ state: 'idle' }))).toMatch(
      /sandbox/i,
    );
  });

  it('order the views: notebook, document, surface, then sandbox', () => {
    const reactor = buildReactorFromExtensions([
      NotebookExtension,
      DocumentExtension,
      A2uiExtension,
    ]);
    reactor.start();

    expect(reactor.getContributions(LoopViewType).map(v => v.id)).toEqual([
      'notebook',
      'document',
      'a2ui',
      'sandbox',
    ]);
  });

  it('gates the surface view on a sandbox too', () => {
    const reactor = buildReactorFromExtensions([A2uiExtension]);
    reactor.start();

    const surface = reactor
      .getContributions(LoopViewType)
      .find(v => v.id === 'a2ui')!.value;

    expect(canOpenView(surface, workspaceWith({ state: 'idle' }))).toBe(false);
    expect(canOpenView(surface, workspaceWith({ state: 'running' }))).toBe(true);
  });

  it('each contribute a command that opens their view', async () => {
    const reactor = buildReactorFromExtensions([NotebookExtension, DocumentExtension]);
    reactor.start();

    const opened: string[] = [];
    const workspace = {
      ...workspaceWith({ state: 'running' }),
      setActiveViewType: (v: string) => opened.push(v),
    };

    for (const entry of reactor.getContributions(LoopCommand)) {
      await entry.value.run({ workspace, argv: '' });
    }

    expect(opened.sort()).toEqual(['document', 'notebook', 'sandbox']);
  });

  it('takes its view away when a surface plugin is disabled', () => {
    const reactor = buildReactorFromExtensions([NotebookExtension, DocumentExtension]);
    reactor.start();

    reactor.disable('@datalayer/loop-plugin-document');

    expect(reactor.getContributions(LoopViewType).map(v => v.id)).toEqual([
      'notebook',
      'sandbox',
    ]);
  });
});

describe('the browser sandbox', () => {
  it('is the same interface with a different thing behind it', async () => {
    const { createBrowserSandboxService } = await import(
      '../plugins/code-sandbox/browserService'
    );
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
    const reactor = buildReactorFromExtensions([
      configExtension(CodeSandboxExtension, {
        serverUrl: 'http://server',
        ...(target ? { target } : {}),
      }),
    ]);
    reactor.start();
    return reactor.getOutput<CodeSandboxOutput>(CODE_SANDBOX_EXTENSION_NAME)!.sandbox;
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
      await sandbox.setTarget('cloud');
      await sandbox.setTarget('local');
    } finally {
      globalThis.fetch = original;
    }

    expect(asked.map(a => (a.body as { variant: string }).variant)).toEqual([
      'datalayer',
      'jupyter-server',
    ]);
    expect(asked[0].url).toContain('/api/v1/agents/sandbox/configure');
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
    const reactor = buildReactorFromExtensions([A2uiExtension]);
    reactor.start();
    const surface = reactor
      .getContributions(LoopViewType)
      .find(v => v.id === 'a2ui')!.value;

    const browser = workspaceWith({ state: 'running', variant: 'pyodide' });
    const server = workspaceWith({ state: 'running', variant: 'jupyter-server' });

    // The converter lives on the server; a browser sandbox has nothing to
    // render with, and the tab says which.
    expect(canOpenView(surface, browser)).toBe(false);
    expect(surface.unavailableReason?.(browser)).toMatch(/browser/i);
    expect(canOpenView(surface, server)).toBe(true);
  });

  it('lets the notebook open on a browser sandbox', () => {
    const reactor = buildReactorFromExtensions([NotebookExtension]);
    reactor.start();
    const notebook = reactor
      .getContributions(LoopViewType)
      .find(v => v.id === 'notebook')!.value;

    // The notebook does not care where the kernel lives.
    expect(
      canOpenView(notebook, workspaceWith({ state: 'running', variant: 'pyodide' })),
    ).toBe(true);
  });
});

describe('toggling the sandbox plugin', () => {
  it('keeps the sandbox it owns', () => {
    const reactor = buildReactorFromExtensions([
      configExtension(CodeSandboxExtension, { serverUrl: 'http://server' }),
    ]);
    reactor.start();
    const before = reactor.getOutput<CodeSandboxOutput>(
      CODE_SANDBOX_EXTENSION_NAME,
    )!.sandbox;

    reactor.disable(CODE_SANDBOX_EXTENSION_NAME);
    reactor.enable(CODE_SANDBOX_EXTENSION_NAME);

    // The same service, so the notebook showing its kernel is not detached by
    // someone ticking a checkbox.
    expect(
      reactor.getOutput<CodeSandboxOutput>(CODE_SANDBOX_EXTENSION_NAME)!.sandbox,
    ).toBe(before);
  });

  it('brings its view and its command back with it', () => {
    const reactor = buildReactorFromExtensions([
      configExtension(CodeSandboxExtension, { serverUrl: 'http://server' }),
    ]);
    reactor.start();

    reactor.disable(CODE_SANDBOX_EXTENSION_NAME);
    expect(reactor.getContributions(LoopViewType)).toHaveLength(0);

    reactor.enable(CODE_SANDBOX_EXTENSION_NAME);
    expect(reactor.getContributions(LoopViewType).map(v => v.id)).toEqual(['sandbox']);
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
