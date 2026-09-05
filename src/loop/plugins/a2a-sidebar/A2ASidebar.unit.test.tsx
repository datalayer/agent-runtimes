/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The A2A sidebar lists the agents the spec reaches over A2A, follows each
 * run from its events, and keeps the live run box while one is under way.
 */

import * as React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { registerReactor } from '@datalayer/reactor/react';
import { agentRuntimeStore } from '../../../stores';
import type { AgentStreamSubagentPayload } from '../../../types/stream';
import type { SubAgentspecConfig } from '../../../types/agentspecs';
import { AgentA2APlugin } from '../agent-a2a';
import { A2ASidebar, describeRemoteAgents, remoteStatusOf } from './A2ASidebar';

const append = (event: AgentStreamSubagentPayload) =>
  act(() => agentRuntimeStore.getState().appendSubagentEvent(event));

const researcher = (
  event: Partial<AgentStreamSubagentPayload> &
    Pick<AgentStreamSubagentPayload, 'phase'>,
): AgentStreamSubagentPayload => ({
  subagentName: 'researcher',
  toolCallId: 'call-1',
  transport: 'a2a',
  ...event,
});

describe('remoteStatusOf', () => {
  it('reads the run from its events', () => {
    expect(remoteStatusOf(undefined)).toBe('idle');
    expect(remoteStatusOf([])).toBe('idle');
    expect(
      remoteStatusOf([researcher({ phase: 'start', launch: 'auto' })]),
    ).toBe('working');
    expect(
      remoteStatusOf([
        researcher({ phase: 'start' }),
        researcher({ phase: 'status', state: 'launching' }),
      ]),
    ).toBe('launching');
    expect(
      remoteStatusOf([
        researcher({ phase: 'status', state: 'launching' }),
        researcher({ phase: 'status', state: 'working' }),
      ]),
    ).toBe('working');
    expect(
      remoteStatusOf([
        researcher({ phase: 'start' }),
        researcher({ phase: 'end' }),
      ]),
    ).toBe('done');
    expect(
      remoteStatusOf([
        researcher({ phase: 'start' }),
        researcher({ phase: 'error', error: 'no' }),
      ]),
    ).toBe('failed');
  });
});

describe('describeRemoteAgents', () => {
  const declared: SubAgentspecConfig[] = [
    {
      name: 'researcher',
      description: 'Facts',
      ref: 'example-a2a-researcher:0.0.1',
      a2a: { launch: 'auto' },
    },
    { name: 'local-writer', description: 'In process', instructions: 'Write' },
  ];

  it('lists the declared A2A agents, idle, and not the in-process ones', () => {
    const agents = describeRemoteAgents(declared, {});
    expect(agents.map(agent => agent.name)).toEqual(['researcher']);
    expect(agents[0]).toMatchObject({
      status: 'idle',
      launch: 'auto',
      ref: 'example-a2a-researcher:0.0.1',
    });
  });

  it('takes where the agent was launched, its card and task from the events', () => {
    const agents = describeRemoteAgents(declared, {
      'call-1': [
        researcher({ phase: 'start', launch: 'auto', task: 'look' }),
        researcher({ phase: 'status', state: 'launching', launch: 'auto' }),
        researcher({
          phase: 'status',
          state: 'ready',
          launch: 'local',
          url: 'http://127.0.0.1:8765/api/v1/a2a/agents/a2a-researcher',
          agentCard: { name: 'Example A2A Researcher', version: '1.0.0' },
        }),
        researcher({ phase: 'status', state: 'working', taskId: 't1' }),
      ],
    });
    expect(agents[0]).toMatchObject({
      status: 'working',
      launch: 'local',
      url: 'http://127.0.0.1:8765/api/v1/a2a/agents/a2a-researcher',
      taskId: 't1',
      card: { name: 'Example A2A Researcher', version: '1.0.0' },
    });
  });

  it('adds an agent the events name that the spec did not, and keeps the latest run', () => {
    const agents = describeRemoteAgents(declared, {
      'call-1': [researcher({ phase: 'start' }), researcher({ phase: 'end' })],
      'call-2': [
        researcher({ phase: 'start', toolCallId: 'call-2' }),
        researcher({ phase: 'error', toolCallId: 'call-2', error: 'down' }),
      ],
      'call-3': [
        {
          subagentName: 'reviewer',
          toolCallId: 'call-3',
          phase: 'start',
          transport: 'a2a',
        },
      ],
    });
    expect(agents.map(agent => [agent.name, agent.status])).toEqual([
      ['researcher', 'failed'],
      ['reviewer', 'working'],
    ]);
  });

  it('ignores in-process runs', () => {
    const agents = describeRemoteAgents(declared, {
      'call-9': [
        { subagentName: 'local-writer', toolCallId: 'call-9', phase: 'start' },
      ],
    });
    expect(agents.map(agent => agent.name)).toEqual(['researcher']);
  });
});

describe('A2ASidebar', () => {
  beforeEach(() => {
    act(() => agentRuntimeStore.getState().clearSubagentActivity());
    const reactor = buildReactorFromPlugins([AgentA2APlugin]);
    reactor.start();
    registerReactor(reactor);
  });

  afterEach(() => {
    // Unmount before the reactor goes, or the mounted sidebar re-renders
    // against none.
    cleanup();
    registerReactor(null);
  });

  it('lists the agents of the blueprint spec, idle, with no run box', () => {
    const { container } = render(<A2ASidebar />);
    const rows = Array.from(container.querySelectorAll('[data-a2a-agent]')).map(
      row => row.getAttribute('data-a2a-agent'),
    );
    expect(rows).toEqual(['researcher', 'writer']);
    expect(container.querySelector('[data-a2a-sidebar-idle]')).not.toBeNull();
    expect(container.querySelector('[data-subagent-panel]')).toBeNull();
  });

  it('shows the run box while an A2A agent works, and lets it go when it ends', () => {
    const { container } = render(<A2ASidebar />);
    append(researcher({ phase: 'start', launch: 'auto', task: 'Look it up' }));
    append(researcher({ phase: 'status', state: 'launching', launch: 'auto' }));

    const panel = container.querySelector('[data-subagent-panel]');
    expect(panel?.getAttribute('data-subagent-panel')).toBe('researcher');
    expect(panel?.getAttribute('data-subagent-transport')).toBe('a2a');
    expect(panel?.textContent).toContain('A2A agent');
    expect(panel?.textContent).toContain('launching…');
    expect(container.querySelector('[data-a2a-sidebar-idle]')).toBeNull();

    append(
      researcher({
        phase: 'status',
        state: 'ready',
        launch: 'local',
        url: 'http://127.0.0.1:8765/api/v1/a2a/agents/a2a-researcher',
      }),
    );
    append(researcher({ phase: 'text', text: 'Notes.' }));
    expect(
      container.querySelector('[data-subagent-panel]')?.textContent,
    ).toContain('working…');
    const row = container.querySelector('[data-a2a-agent="researcher"]');
    expect(row?.textContent).toContain('working');
    expect(row?.textContent).toContain('local');
    expect(
      row?.querySelector('a[href$="/.well-known/agent-card.json"]'),
    ).not.toBeNull();

    append(researcher({ phase: 'end', output: 'Notes.' }));
    expect(container.querySelector('[data-subagent-panel]')).toBeNull();
    expect(container.querySelector('[data-a2a-sidebar-idle]')).not.toBeNull();
    expect(
      container.querySelector('[data-a2a-agent="researcher"]')?.textContent,
    ).toContain('done');
  });
});
