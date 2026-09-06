/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Streamed delegations outlive the socket they arrived on.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { agentRuntimeStore } from '../agentRuntimeStore';
import { SUBAGENT_STOPPED } from '../../types/stream';

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

  it('marks every run still going as stopped, and leaves finished ones alone', () => {
    const store = agentRuntimeStore.getState();
    store.appendSubagentEvent({
      subagentName: 'researcher',
      toolCallId: 'run-1',
      phase: 'start',
      transport: 'a2a',
    });
    store.appendSubagentEvent({
      subagentName: 'researcher',
      toolCallId: 'run-1',
      phase: 'text',
      text: 'half',
    });
    store.appendSubagentEvent({
      subagentName: 'writer',
      toolCallId: 'run-2',
      phase: 'start',
    });
    store.appendSubagentEvent({
      subagentName: 'writer',
      toolCallId: 'run-2',
      phase: 'end',
      output: 'Done.',
    });

    agentRuntimeStore.getState().stopSubagentActivity();

    const activity = agentRuntimeStore.getState().subagentActivity;
    const last = activity['run-1'][activity['run-1'].length - 1];
    expect(last).toMatchObject({
      phase: 'error',
      error: SUBAGENT_STOPPED,
      transport: 'a2a',
      toolCallId: 'run-1',
    });
    expect(activity['run-2'].map(event => event.phase)).toEqual([
      'start',
      'end',
    ]);
    // Idempotent: a second stop adds nothing.
    const before = agentRuntimeStore.getState().subagentActivity;
    agentRuntimeStore.getState().stopSubagentActivity();
    expect(agentRuntimeStore.getState().subagentActivity).toBe(before);
  });

  it('takes nothing more for a run once it was stopped', () => {
    const store = agentRuntimeStore.getState();
    store.appendSubagentEvent({
      subagentName: 'researcher',
      toolCallId: 'run-3',
      phase: 'start',
      transport: 'a2a',
    });
    agentRuntimeStore.getState().stopSubagentActivity();
    // The server's late delta and its own stop, arriving after ours.
    agentRuntimeStore.getState().appendSubagentEvent({
      subagentName: 'researcher',
      toolCallId: 'run-3',
      phase: 'text',
      text: 'late',
    });
    agentRuntimeStore.getState().appendSubagentEvent({
      subagentName: 'researcher',
      toolCallId: 'run-3',
      phase: 'error',
      error: SUBAGENT_STOPPED,
    });

    const events = agentRuntimeStore.getState().subagentActivity['run-3'];
    expect(events.map(event => event.phase)).toEqual(['start', 'error']);
  });
});
