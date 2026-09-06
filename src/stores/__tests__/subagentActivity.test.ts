/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Streamed delegations outlive the socket they arrived on.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { agentRuntimeStore } from '../agentRuntimeStore';

describe('subagent activity across resets', () => {
  beforeEach(() => {
    agentRuntimeStore.getState().reset();
  });

  it('survives a websocket reset, since the transcript still shows it', () => {
    const store = agentRuntimeStore.getState();
    store.appendSubagentEvent({
      subagentName: 'researcher',
      toolCallId: 'call-1',
      phase: 'start',
      transport: 'a2a',
      task: 'Look it up',
    });
    store.appendSubagentEvent({
      subagentName: 'researcher',
      toolCallId: 'call-1',
      phase: 'end',
      output: 'Notes.',
    });

    agentRuntimeStore.getState().resetWs();

    const kept = agentRuntimeStore.getState().subagentActivity['call-1'];
    expect(kept?.map(event => event.phase)).toEqual(['start', 'end']);
  });

  it('goes with a full reset, which is a new agent', () => {
    agentRuntimeStore.getState().appendSubagentEvent({
      subagentName: 'researcher',
      toolCallId: 'call-2',
      phase: 'start',
    });

    agentRuntimeStore.getState().reset();

    expect(agentRuntimeStore.getState().subagentActivity).toEqual({});
  });
});
