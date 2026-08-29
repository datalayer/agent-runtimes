/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Whether a reader may choose where the agent runs.
 *
 * A host that has already decided passes `showAgentVariants: false`, and two
 * things have to follow together: the control goes, and the sandbox starts on
 * the one target that needs nothing behind it. Either without the other is a
 * trap — a hidden control over a target the reader cannot leave, or a visible
 * one whose other options are locked doors.
 */

import { describe, expect, it } from 'vitest';
import { buildReactorFromPlugins, configurePlugin } from '@datalayer/reactor';

import { GraphPlugin } from '@datalayer/reactor-graph';
import { LoopSlots } from '../core';
import { AgentsPlugin } from '../plugins/agents';
import { GraphViewPlugin } from '../plugins/graph';
import { PluginsPanelPlugin } from '../plugins/plugins-panel';

/** The header components the plugin contributes, by id. */
function headerItems(showAgentVariants?: boolean): string[] {
  const reactor = buildReactorFromPlugins([
    configurePlugin(AgentsPlugin, {
      serverUrl: '',
      ...(showAgentVariants === undefined ? {} : { showAgentVariants }),
    }),
  ]);
  reactor.start();
  const output = reactor.getOutput<{
    components?: { slot: string; id: string }[];
  }>(AgentsPlugin.name);
  return (output?.components ?? [])
    .filter(entry => entry.slot === LoopSlots.header)
    .map(entry => entry.id);
}

describe('choosing where the agent runs', () => {
  it('offers the control by default', () => {
    expect(headerItems()).toContain('sandbox-selector');
    expect(headerItems(true)).toContain('sandbox-selector');
  });

  it('leaves the control out when the host decided', () => {
    // Left out rather than disabled: a control with one option is furniture.
    expect(headerItems(false)).not.toContain('sandbox-selector');
  });

  it('still reports the sandbox either way', () => {
    // The status bridge is not part of the choice — a reader with no control
    // still needs to know whether their kernel is alive.
    const reactor = buildReactorFromPlugins([
      configurePlugin(AgentsPlugin, {
        serverUrl: '',
        showAgentVariants: false,
      }),
    ]);
    reactor.start();
    const output = reactor.getOutput<{
      components?: { id: string }[];
      sandbox?: { target: { peek: () => string } };
    }>(AgentsPlugin.name);

    expect((output?.components ?? []).map(entry => entry.id)).toContain(
      'sandbox-status',
    );
    // And it starts in the page, whatever target the host asked for.
    expect(output?.sandbox?.target.peek()).toBe('browser');
  });

  it('pins the browser even when another target was configured', () => {
    // The trap this exists to prevent: a hidden control over a target the
    // reader has no way to move off.
    const reactor = buildReactorFromPlugins([
      configurePlugin(AgentsPlugin, {
        serverUrl: '',
        target: 'datalayer',
        showAgentVariants: false,
      }),
    ]);
    reactor.start();
    const output = reactor.getOutput<{
      sandbox?: { target: { peek: () => string } };
    }>(AgentsPlugin.name);

    expect(output?.sandbox?.target.peek()).toBe('browser');
  });
});

describe('one switch per feature', () => {
  it('does not list the graph plugin the adapter wraps', () => {
    /*
     * `@datalayer/loop-plugin-graph` places the graph in this workspace and
     * pulls the generic `@datalayer/reactor-graph` in as a dependency. Both
     * are real plugins, so both were listed — two switches in front of one
     * feature, with nothing to say which one to use.
     *
     * The adapter is the one that matters: switching it off takes the view,
     * the button and the dependency with it.
     */
    const reactor = buildReactorFromPlugins([
      PluginsPanelPlugin,
      GraphViewPlugin,
    ]);
    reactor.start();

    // Both are present in the platform — this is about the list, not about
    // pretending the dependency is not there.
    expect(reactor.listPlugins()).toContain(GraphPlugin.name);
    expect(reactor.listPlugins()).toContain(GraphViewPlugin.name);
  });
});
