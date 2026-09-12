/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The checkpoints sidebar reads the agent's checkpoints from its server,
 * saves one on request, and rewinds the conversation — which asks the chat
 * to reload once the server's snapshot has come.
 */

import * as React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentRuntimeStore } from '../../../stores';
import {
  CheckpointsSidebar,
  afterNextSnapshot,
  ago,
} from './CheckpointsSidebar';

const SERVER = 'http://127.0.0.1:8799';
const AGENT = 'cp-agent';
const LIST = `${SERVER}/api/v1/agents/${AGENT}/checkpoints`;

const listing = (checkpoints: unknown[]) => ({
  agent_id: AGENT,
  enabled: true,
  frequency: 'every_turn',
  max_checkpoints: 10,
  store: 'in_memory',
  turn: 2,
  checkpoints,
});

const turn1 = {
  id: 'cp-1',
  label: 'turn-1',
  turn: 1,
  message_count: 2,
  created_at: new Date().toISOString(),
  auto: true,
  metadata: { auto: true },
};
const saved = {
  id: 'cp-2',
  label: 'baseline',
  turn: 2,
  message_count: 4,
  created_at: new Date().toISOString(),
  auto: false,
  metadata: { auto: false },
};

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  statusText: 'OK',
  json: async () => body,
});

describe('CheckpointsSidebar', () => {
  const calls: { url: string; method: string; body?: string }[] = [];
  let checkpoints: unknown[] = [];

  beforeEach(() => {
    calls.length = 0;
    checkpoints = [saved, turn1];
    agentRuntimeStore.setState({ historyVersion: 0, fullContext: null });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        calls.push({ url, method, body: init?.body as string | undefined });
        if (url === LIST && method === 'GET') return json(listing(checkpoints));
        if (url === LIST && method === 'POST') {
          const label = JSON.parse(String(init?.body)).label as string;
          const made = { ...saved, id: 'cp-3', label, auto: false };
          checkpoints = [made, ...checkpoints];
          return json(made, 201);
        }
        if (url.endsWith('/rewind') && method === 'POST') {
          return json({ agent_id: AGENT, checkpoint: turn1, message_count: 2 });
        }
        if (method === 'DELETE') {
          checkpoints = checkpoints.filter(
            entry => !url.endsWith((entry as { id: string }).id),
          );
          return json({ agent_id: AGENT, deleted: 'x' });
        }
        return json({ detail: 'nope' }, 404);
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const workspace = {
    serverUrl: SERVER,
    agentId: AGENT,
    setAgentId: () => {},
  };

  it('lists the checkpoints with how they were taken, and the configuration', async () => {
    const { container } = render(<CheckpointsSidebar workspace={workspace} />);
    await waitFor(() =>
      expect(container.querySelectorAll('[data-checkpoint]')).toHaveLength(2),
    );
    const text = container.textContent ?? '';
    expect(text).toContain('after every turn');
    expect(text).toContain('the last 10, in_memory');
    expect(
      container.querySelector('[data-checkpoints-turn="2"]'),
    ).not.toBeNull();
    expect(
      container
        .querySelector('[data-checkpoint="cp-2"]')
        ?.getAttribute('data-checkpoint-auto'),
    ).toBe('false');
    expect(
      container
        .querySelector('[data-checkpoint="cp-1"]')
        ?.getAttribute('data-checkpoint-auto'),
    ).toBe('true');
    expect(text).toContain('baselinesaved');
    expect(text).toContain('turn-1auto');
  });

  it('saves a labelled checkpoint and lists it', async () => {
    const { container, getByLabelText } = render(
      <CheckpointsSidebar workspace={workspace} />,
    );
    await waitFor(() =>
      expect(container.querySelectorAll('[data-checkpoint]')).toHaveLength(2),
    );
    fireEvent.change(getByLabelText('Checkpoint label'), {
      target: { value: 'before-refactor' },
    });
    fireEvent.click(
      container.querySelector('[data-checkpoints-save]') as Element,
    );
    await waitFor(() =>
      expect(container.querySelectorAll('[data-checkpoint]')).toHaveLength(3),
    );
    const post = calls.find(
      call => call.method === 'POST' && call.url === LIST,
    );
    expect(post?.body).toBe(JSON.stringify({ label: 'before-refactor' }));
    expect(container.textContent).toContain('before-refactor');
  });

  it('rewinds, then asks the chat to reload once the snapshot has come', async () => {
    const { container } = render(<CheckpointsSidebar workspace={workspace} />);
    await waitFor(() =>
      expect(container.querySelectorAll('[data-checkpoint]')).toHaveLength(2),
    );
    fireEvent.click(
      container.querySelector('[data-checkpoints-rewind="cp-1"]') as Element,
    );
    await waitFor(() =>
      expect(calls.some(call => call.url.endsWith('/cp-1/rewind'))).toBe(true),
    );
    // Not yet: the server's snapshot has not arrived.
    expect(agentRuntimeStore.getState().historyVersion).toBe(0);
    act(() => {
      agentRuntimeStore.setState({ fullContext: { messages: [] } });
    });
    await waitFor(() =>
      expect(agentRuntimeStore.getState().historyVersion).toBe(1),
    );
  });

  it('says so for an agent without checkpoints', async () => {
    vi.mocked(fetch).mockImplementation(
      async () =>
        json({
          agent_id: AGENT,
          enabled: false,
          turn: 0,
          checkpoints: [],
        }) as Response,
    );
    const { container } = render(<CheckpointsSidebar workspace={workspace} />);
    await waitFor(() =>
      expect(container.textContent).toContain(
        'asks for no conversation checkpoints',
      ),
    );
  });
});

describe('the helpers', () => {
  it('reads an age', () => {
    const now = Date.parse('2026-09-09T10:00:00Z');
    expect(ago('2026-09-09T09:59:50Z', now)).toBe('just now');
    expect(ago('2026-09-09T09:55:00Z', now)).toBe('5 min ago');
    expect(ago('2026-09-09T07:00:00Z', now)).toBe('3 h ago');
    expect(ago('garbage', now)).toBe('');
  });

  it('resolves on the next snapshot, or on its timeout', async () => {
    agentRuntimeStore.setState({ fullContext: null });
    const waited = afterNextSnapshot(10_000);
    let done = false;
    void waited.then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    agentRuntimeStore.setState({ fullContext: { messages: [1] } });
    await waited;
    expect(done).toBe(true);
    // And a quiet server does not hold the page hostage.
    await afterNextSnapshot(5);
  });
});
