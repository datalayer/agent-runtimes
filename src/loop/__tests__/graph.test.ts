/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The graph reaches the workspace as a view, and pulls its own dependency in.
 */

import { describe, expect, it } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { LoopCommand, LoopViewType } from '../core';
import { GRAPH_VIEW_TYPE, GraphViewPlugin } from '../plugins/graph';

describe('the graph plugin', () => {
  it('pulls the reusable graph in as a dependency', () => {
    // Mounting the adapter is enough; the host does not have to remember the
    // generic plugin it adapts.
    const reactor = buildReactorFromPlugins([GraphViewPlugin]);
    reactor.start();

    expect(reactor.hasPlugin('@datalayer/reactor-graph')).toBe(true);
  });

  it('offers the graph as a view, ordered last', () => {
    const reactor = buildReactorFromPlugins([GraphViewPlugin]);
    reactor.start();

    const view = reactor
      .getContributions(LoopViewType)
      .find(entry => entry.value.viewType === GRAPH_VIEW_TYPE);

    expect(view).toBeDefined();
    // It is about the workspace rather than part of the work.
    expect(view!.value.order).toBeGreaterThan(100);
  });

  it('answers a command that opens it', async () => {
    const reactor = buildReactorFromPlugins([GraphViewPlugin]);
    reactor.start();

    const opened: string[] = [];
    const command = reactor
      .getContributions(LoopCommand)
      .find(entry => entry.value.name === 'graph')!;

    await command.value.run({
      workspace: {
        setActiveViewType: (v: string) => opened.push(v),
      } as never,
      argv: '',
    });

    expect(opened).toEqual([GRAPH_VIEW_TYPE]);
  });

  it('takes the view away when it is disabled', () => {
    const reactor = buildReactorFromPlugins([GraphViewPlugin]);
    reactor.start();
    reactor.disable(GraphViewPlugin.name);

    expect(
      reactor
        .getContributions(LoopViewType)
        .some(entry => entry.value.viewType === GRAPH_VIEW_TYPE),
    ).toBe(false);
  });
});
