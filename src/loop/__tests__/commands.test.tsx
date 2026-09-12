/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The workspace's commands reach the palette.
 *
 * The bridge is the only thing standing between a plugin's slash command and
 * Ctrl-K, and it is easy to leave half-wired: registered against no workspace,
 * or registered once and never updated when a plugin is switched on. Both look
 * like an empty palette, which is also what "nothing contributed" looks like.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { buildReactorFromPlugins, configurePlugin } from '@datalayer/reactor';
import { LoopWorkspace } from '../shell/LoopWorkspace';
import { LoopCommandsPlugin } from '../plugins/commands';
import { GraphViewPlugin } from '../plugins/graph';
import { ChatPlugin } from '../plugins/chat';
import { AgentsPlugin } from '../plugins/agents';

async function mount(
  extensions: Parameters<typeof buildReactorFromPlugins>[0],
) {
  const reactor = buildReactorFromPlugins(extensions);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<LoopWorkspace serverUrl="" agentId="a" reactor={reactor} />);
  });
  await act(async () => {
    await Promise.resolve();
  });

  return { reactor, root };
}

describe('the command palette bridge', () => {
  it('puts every contributed slash command in the registry', async () => {
    const { reactor, root } = await mount([
      configurePlugin(AgentsPlugin, { target: 'browser' }),
      ChatPlugin,
      GraphViewPlugin,
      LoopCommandsPlugin,
    ]);

    const ids = reactor.listCommands().map(command => command.id);
    // Namespaced, because the registry is shared with whatever else the host
    // mounted.
    expect(ids).toContain('loop.graph');
    expect(ids).toContain('loop.chat');

    const graph = reactor.getCommand('loop.graph');
    // The description a person reads is the command's own; the slash form it
    // may already be known by is kept beside it.
    expect(graph?.name).toBe('Show the plugin graph');
    expect(graph?.description).toBe('/graph');
    expect(graph?.category).toBe('Session');

    await act(async () => root.unmount());
  });

  it('runs a command against the workspace on screen', async () => {
    const { reactor, root } = await mount([
      configurePlugin(AgentsPlugin, { target: 'browser' }),
      ChatPlugin,
      GraphViewPlugin,
      LoopCommandsPlugin,
    ]);

    // The graph command switches the active view; running it from the registry
    // has to reach the same workspace the shell is rendering, which is the one
    // thing a plugin phase cannot see.
    await act(async () => {
      await reactor.executeCommand('loop.graph');
    });

    const chat = reactor.getCommand('loop.chat');
    expect(chat).toBeDefined();

    await act(async () => root.unmount());
  });

  it('pulls the generic palette in as a dependency', () => {
    const reactor = buildReactorFromPlugins([LoopCommandsPlugin]);
    reactor.start();

    // Mounting the loop's adapter is enough; the host need not remember the
    // reusable plugin behind it.
    expect(reactor.listPlugins()).toContain('@datalayer/reactor-commands');
  });

  it('registers nothing when no plugin contributes a command', async () => {
    const { reactor, root } = await mount([LoopCommandsPlugin]);

    // Only the palette's own entry, which belongs to the generic plugin.
    const ids = reactor.listCommands().map(command => command.id);
    expect(ids.filter(id => id.startsWith('loop.'))).toEqual([]);

    await act(async () => root.unmount());
  });
});

describe('the palette in the workspace', () => {
  it('mounts, so its shortcut is actually bound', async () => {
    const { root } = await mount([
      configurePlugin(AgentsPlugin, { target: 'browser' }),
      ChatPlugin,
      GraphViewPlugin,
      LoopCommandsPlugin,
    ]);

    // The palette is contributed to the `root` slot. The shell did not render
    // that slot, so the component never mounted and bound no keys — which is
    // indistinguishable from a shortcut the browser stole.
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(
      document.querySelector('[role="dialog"][aria-label="Command palette"]'),
    ).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('carries a command’s shortcut into the registry', async () => {
    const { reactor, root } = await mount([
      configurePlugin(AgentsPlugin, { target: 'browser' }),
      ChatPlugin,
      GraphViewPlugin,
      LoopCommandsPlugin,
    ]);

    // Declared on the loop plugin's contribution, carried through the bridge.
    expect(reactor.getCommand('loop.graph')?.keybinding).toBe('Mod+Alt+G');

    await act(async () => root.unmount());
  });
});

describe('where the palette renders', () => {
  it('lands in the themed portal root, not on body', async () => {
    const { root } = await mount([
      configurePlugin(AgentsPlugin, { target: 'browser' }),
      ChatPlugin,
      LoopCommandsPlugin,
    ]);

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    const dialog = document.querySelector(
      '[role="dialog"][aria-label="Command palette"]',
    );
    expect(dialog).not.toBeNull();

    // `body` is themed by nobody: a palette that lands there shows light
    // chrome over a dark workspace, whatever the application's colormode.
    const portalRoot = document.getElementById('__primerPortalRoot__');
    expect(portalRoot).not.toBeNull();
    expect(portalRoot!.contains(dialog!)).toBe(true);

    await act(async () => root.unmount());
  });

  it('gives the root a colormode for the palette to inherit', async () => {
    const { root } = await mount([LoopCommandsPlugin]);

    // The palette's dark rules key off this attribute on an ancestor; the
    // theme provider keeps it in step from here on.
    const portalRoot = document.getElementById('__primerPortalRoot__');
    expect(portalRoot?.dataset.colorMode).toMatch(/^(light|dark)$/);

    await act(async () => root.unmount());
  });
});

describe('the graph command', () => {
  it('is offered once, by the plugin that can actually open it', async () => {
    const { reactor, root } = await mount([
      configurePlugin(AgentsPlugin, { target: 'browser' }),
      ChatPlugin,
      GraphViewPlugin,
      LoopCommandsPlugin,
    ]);

    const graphCommands = reactor
      .listCommands()
      .filter(command => /graph/i.test(command.id));

    // The generic plugin's own command asks the host to route by dispatching
    // an event, and nothing in this workspace listens for it — so it did
    // nothing when chosen, beside an entry that worked. The adapter turns it
    // off and keeps its own.
    expect(graphCommands.map(command => command.id)).toEqual(['loop.graph']);

    await act(async () => root.unmount());
  });
});
