/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The running-agents list, and when it counts as changed.
 *
 * This is a global store written by a layout that recomputes its list every
 * time the runtimes poll — many times a minute, usually with nothing about
 * the agents different. Storing that unconditionally handed every consumer a
 * new array identity each time, which is a re-render each time for a list
 * that has not moved.
 *
 * It also closes a circle. A consumer that derives from this list and writes
 * back — `LayoutAIAgents` does exactly that, in an effect whose dependencies
 * include what it derives — re-renders, recomputes, writes a fresh array,
 * and goes round again. That is the shape of "Maximum update depth
 * exceeded": no single line is wrong, and the loop lives in the identities.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { useAgentCatalogStore } from '../useAgentsCatalog';

const agent = (
  id: string,
  status = 'running',
  extra: Record<string, any> = {},
) =>
  ({
    id,
    runtime_name: `rt-${id}`,
    name: id,
    given_name: id,
    type: 'agent',
    environment: { name: 'env' },
    status,
    messageCount: 0,
    ...extra,
  }) as any;

const runningAgents = () => useAgentCatalogStore.getState().runningAgents;
const setRunningAgents = (agents: any[]) =>
  useAgentCatalogStore.getState().setRunningAgents(agents);

beforeEach(() => {
  useAgentCatalogStore.setState({ runningAgents: [] });
});

describe('storing the running agents', () => {
  it('keeps the same array when the same agents are still there', () => {
    setRunningAgents([agent('a'), agent('b')]);
    const first = runningAgents();

    // A fresh array of equivalent agents: what every poll produces.
    setRunningAgents([agent('a'), agent('b')]);

    expect(runningAgents()).toBe(first);
  });

  it('stores a new list when an agent arrives', () => {
    setRunningAgents([agent('a')]);
    const first = runningAgents();

    setRunningAgents([agent('a'), agent('b')]);

    expect(runningAgents()).not.toBe(first);
    expect(runningAgents().map(a => a.id)).toEqual(['a', 'b']);
  });

  it('stores a new list when an agent leaves', () => {
    setRunningAgents([agent('a'), agent('b')]);
    const first = runningAgents();

    setRunningAgents([agent('a')]);

    expect(runningAgents()).not.toBe(first);
  });

  it('stores a new list when an agent changes status', () => {
    // The reason this list exists: a menu shows which agents are running.
    setRunningAgents([agent('a', 'starting')]);
    const first = runningAgents();

    setRunningAgents([agent('a', 'running')]);

    expect(runningAgents()).not.toBe(first);
    expect(runningAgents()[0].status).toBe('running');
  });

  it('stores a new list when the agents are reordered', () => {
    setRunningAgents([agent('a'), agent('b')]);
    const first = runningAgents();

    setRunningAgents([agent('b'), agent('a')]);

    expect(runningAgents()).not.toBe(first);
  });

  it('still resolves each agent to its spec', () => {
    // The enrichment this setter exists for has to survive the guard.
    const spec = { id: 'spec-1', name: 'Analyst' } as any;
    useAgentCatalogStore.setState({ agentspecs: [spec], runningAgents: [] });

    setRunningAgents([agent('a', 'running', { agent_spec_id: 'spec-1' })]);

    expect(runningAgents()[0].agentSpec).toBe(spec);
  });

  it('does not churn once a spec has been resolved', () => {
    const spec = { id: 'spec-1', name: 'Analyst' } as any;
    useAgentCatalogStore.setState({ agentspecs: [spec], runningAgents: [] });
    setRunningAgents([agent('a', 'running', { agent_spec_id: 'spec-1' })]);
    const first = runningAgents();

    // The same poll again: the spec resolves to the same object, so nothing
    // has changed and the list must not be replaced.
    setRunningAgents([agent('a', 'running', { agent_spec_id: 'spec-1' })]);

    expect(runningAgents()).toBe(first);
  });
});
