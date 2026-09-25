/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * "card" on an A2A run opens the agent's details over the chat: what the run
 * said, the card fetched from the agent, and the way out to its URL.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentRuntimeStore } from '../../../stores';
import {
  SUBAGENT_STOPPED,
  type AgentStreamSubagentPayload,
} from '../../../types/stream';
import { SubagentChatPanel } from '../../messages/ChatMessageList';
import {
  A2AAgentDialog,
  a2aAgentDetails,
  agentCardUrl,
} from '../A2AAgentDialog';

const URL = 'http://127.0.0.1:8765/api/v1/a2a/agents/a2a-researcher';

const CARD = {
  name: 'a2a-researcher',
  description: 'A separate research agent, reached over A2A.',
  version: '1.0.0',
  protocolVersion: '1.0',
  url: URL,
  supportedInterfaces: [
    { protocolBinding: 'JSONRPC', url: URL, protocolVersion: '1.0' },
  ],
  capabilities: {
    streaming: true,
    pushNotifications: false,
    extensions: [
      {
        uri: 'urn:example:trace',
        required: false,
        description: 'Emits a trace',
      },
    ],
  },
  skills: [
    {
      id: 'research',
      name: 'Research',
      description: 'Facts with sources',
      tags: ['facts'],
    },
  ],
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
  // Keys the renderer does not lay out by hand still have to show up.
  preferredTransport: 'JSONRPC',
  securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
};

const events: AgentStreamSubagentPayload[] = [
  {
    subagentName: 'researcher',
    toolCallId: 'call-1',
    phase: 'start',
    transport: 'a2a',
    launch: 'auto',
    task: 'Look it up',
  },
  {
    subagentName: 'researcher',
    toolCallId: 'call-1',
    phase: 'status',
    transport: 'a2a',
    launch: 'auto',
    state: 'launching',
  },
  {
    subagentName: 'researcher',
    toolCallId: 'call-1',
    phase: 'status',
    transport: 'a2a',
    state: 'ready',
    launch: 'local',
    url: URL,
    agentCard: { name: 'a2a-researcher', version: '1.0.0' },
  },
  {
    subagentName: 'researcher',
    toolCallId: 'call-1',
    phase: 'status',
    transport: 'a2a',
    url: URL,
    taskId: 't-1',
    state: 'working',
  },
  {
    subagentName: 'researcher',
    toolCallId: 'call-1',
    phase: 'text',
    transport: 'a2a',
    url: URL,
    text: 'Notes.',
  },
];

// Primer's Dialog measures itself; jsdom has no ResizeObserver to measure with.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??=
  ResizeObserverStub;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => CARD,
  }));
  vi.stubGlobal('fetch', fetchMock);
  act(() => agentRuntimeStore.getState().clearSubagentActivity());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a2aAgentDetails', () => {
  it('reads the agent out of the run, later events winning', () => {
    expect(a2aAgentDetails(events)).toEqual({
      name: 'researcher',
      url: URL,
      launch: 'local',
      state: 'working',
      taskId: 't-1',
      card: { name: 'a2a-researcher', version: '1.0.0' },
    });
    expect(agentCardUrl(`${URL}/`)).toBe(`${URL}/.well-known/agent-card.json`);
  });

  it('is nothing for an in-process run', () => {
    expect(
      a2aAgentDetails([
        { subagentName: 'writer', toolCallId: 'c', phase: 'start' },
      ]),
    ).toBeNull();
  });
});

describe('A2AAgentDialog', () => {
  it('shows the run, fetches the card, and links out to it', async () => {
    render(
      <A2AAgentDialog details={a2aAgentDetails(events)!} onClose={() => {}} />,
    );
    const dialog = document.body.querySelector(
      '[data-a2a-agent-dialog="researcher"]',
    );
    expect(dialog).not.toBeNull();
    // The run's own facts, before any fetch lands.
    expect(dialog?.textContent).toContain('local');
    expect(dialog?.textContent).toContain('working');
    expect(dialog?.textContent).toContain('t-1');
    // The way out, as a real link.
    const links = Array.from(document.body.querySelectorAll('a[href]')).map(a =>
      a.getAttribute('href'),
    );
    expect(links).toContain(`${URL}/.well-known/agent-card.json`);
    expect(links).toContain(URL);

    await waitFor(() =>
      expect(dialog?.getAttribute('data-a2a-card-status')).toBe('loaded'),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${URL}/.well-known/agent-card.json`,
    );
    const text = dialog?.textContent ?? '';
    for (const expected of [
      'a2a-researcher',
      'v1.0.0',
      'JSONRPC',
      'streaming: yes',
      'pushNotifications: no',
      'urn:example:trace',
      'Research',
      'Facts with sources',
      'application/json',
      // The keys the renderer never heard of, as rows of their own.
      'Preferred transport',
      'Security schemes',
      'bearer',
      'http',
    ]) {
      expect(text).toContain(expected);
    }
    expect(
      document.body.querySelector('[data-a2a-card-json]')?.textContent,
    ).toContain('"protocolVersion": "1.0"');
  });

  it('shows an empty list and a switched-off flag rather than hiding them', async () => {
    // The card an agent-runtimes A2A agent publishes today.
    fetchMock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        name: 'a2a-researcher',
        description: 'A separate research agent, reached over A2A.',
        version: '1.0.0',
        supportedInterfaces: [
          { protocolBinding: 'JSONRPC', url: URL, protocolVersion: '1.0' },
        ],
        skills: [],
        defaultInputModes: ['application/json'],
        defaultOutputModes: ['application/json'],
        capabilities: { streaming: true, pushNotifications: false },
      }),
    }));
    render(
      <A2AAgentDialog
        details={{ name: 'researcher', url: URL, launch: 'local' }}
        onClose={() => {}}
      />,
    );
    const dialog = document.body.querySelector(
      '[data-a2a-agent-dialog="researcher"]',
    );
    await waitFor(() =>
      expect(dialog?.getAttribute('data-a2a-card-status')).toBe('loaded'),
    );
    const text = dialog?.textContent ?? '';
    expect(text).toContain('Skillsnone');
    expect(text).toContain('streaming: yes');
    expect(text).toContain('pushNotifications: no');
    expect(text).toContain('Input modesapplication/json');
    expect(text).toContain('Output modesapplication/json');
    expect(text).toContain('JSONRPC');
  });

  it('says when the card cannot be fetched, and keeps the link', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => ({}),
    }));
    render(
      <A2AAgentDialog
        details={{
          name: 'researcher',
          url: URL,
          launch: 'cloud',
          runtimeUid: 'rt-1',
        }}
        onClose={() => {}}
      />,
    );
    const dialog = document.body.querySelector(
      '[data-a2a-agent-dialog="researcher"]',
    );
    await waitFor(() =>
      expect(dialog?.getAttribute('data-a2a-card-status')).toBe('error'),
    );
    expect(dialog?.textContent).toContain('502 Bad Gateway');
    expect(dialog?.textContent).toContain('rt-1');
    expect(
      document.body.querySelector(
        `a[href="${URL}/.well-known/agent-card.json"]`,
      ),
    ).not.toBeNull();
  });

  it('has no card to fetch before the agent is launched', () => {
    render(
      <A2AAgentDialog
        details={{ name: 'researcher', launch: 'auto' }}
        onClose={() => {}}
      />,
    );
    const dialog = document.body.querySelector(
      '[data-a2a-agent-dialog="researcher"]',
    );
    expect(dialog?.getAttribute('data-a2a-card-status')).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('the box header', () => {
  it('opens the dialog from "card" instead of a tab', async () => {
    for (const event of events) {
      act(() => agentRuntimeStore.getState().appendSubagentEvent(event));
    }
    const { container } = render(<SubagentChatPanel toolCallId="call-1" />);
    const button = container.querySelector(
      '[data-a2a-card-button]',
    ) as HTMLButtonElement | null;
    expect(button?.tagName).toBe('BUTTON');
    expect(container.querySelector('a[href$="agent-card.json"]')).toBeNull();
    act(() => button?.click());
    const dialog = document.body.querySelector(
      '[data-a2a-agent-dialog="researcher"]',
    );
    expect(dialog).not.toBeNull();
    await waitFor(() =>
      expect(dialog?.getAttribute('data-a2a-card-status')).toBe('loaded'),
    );
    expect(dialog?.textContent).toContain('Facts with sources');
  });
});

describe('a stopped run', () => {
  it('reads as stopped in the box, not as a failure', () => {
    for (const event of events) {
      act(() => agentRuntimeStore.getState().appendSubagentEvent(event));
    }
    const { container } = render(<SubagentChatPanel toolCallId="call-1" />);
    expect(
      container.querySelector('[data-subagent-panel]')?.textContent,
    ).toContain('working');
    act(() => agentRuntimeStore.getState().stopSubagentActivity());
    const panel = container.querySelector('[data-subagent-panel]');
    expect(panel?.textContent).toContain('stopped');
    expect(panel?.textContent).not.toContain('failed');
    expect(panel?.textContent).toContain(SUBAGENT_STOPPED);
  });
});
