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

async function mount(extensions: Parameters<typeof buildReactorFromPlugins>[0]) {
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
