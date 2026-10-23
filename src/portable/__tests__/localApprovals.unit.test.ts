/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A local session's approvals over the runtime's websocket (VSCODE VS-07,
 * DESKTOP DK-13, DK-25): where they are read, what a snapshot lists, what
 * a decision is sent as, and what it came to once the next snapshot no
 * longer lists it.
 *
 * @module portable/__tests__/localApprovals
 */

import { describe, expect, it } from 'vitest';
import { ATTENTION_WORDS } from '../attention';
import {
  approvalsOfSnapshot,
  decisionMessage,
  decisionSettled,
  isSnapshot,
  LOCAL_AGENT_ID,
  LOCAL_APPROVAL_WORDS,
  localApprovalsSocketUrl,
} from '../localApprovals';

const SNAPSHOT = {
  version: '1.0',
  type: 'agent.snapshot',
  agentId: 'default',
  payload: {
    agentId: 'default',
    approvals: [
      {
        id: 'a1',
        agent_id: 'default',
        tool_name: 'Run git push',
        tool_args: { command: 'git push', _class: 'execute' },
        status: 'pending',
        created_at: '2026-10-21T10:00:00Z',
      },
      {
        id: 'a2',
        agent_id: 'default',
        tool_name: 'Write file',
        tool_args: {},
        status: 'approved',
      },
      { id: 'a3', agent_id: 'other', tool_name: 'Send', status: 'pending' },
      { id: '', tool_name: 'Nameless', status: 'pending' },
      { id: 'a5', status: 'pending' },
    ],
    pendingApprovalCount: 1,
  },
};

describe("the local runtime's approvals socket", () => {
  it("is the runtime's tool-approvals websocket, for the default agent", () => {
    expect(localApprovalsSocketUrl('http://127.0.0.1:8765')).toBe(
      'ws://127.0.0.1:8765/api/v1/tool-approvals/ws?agent_id=default',
    );
    expect(localApprovalsSocketUrl('http://127.0.0.1:8765/', 'desk')).toBe(
      'ws://127.0.0.1:8765/api/v1/tool-approvals/ws?agent_id=desk',
    );
    expect(LOCAL_AGENT_ID).toBe('default');
  });

  it('reads the pending approvals of the agent from a snapshot, strictly', () => {
    expect(isSnapshot(SNAPSHOT)).toBe(true);
    expect(isSnapshot({ type: 'tool_approval_requested' })).toBe(false);
    expect(isSnapshot(null)).toBe(false);
    expect(approvalsOfSnapshot(SNAPSHOT)).toEqual([
      {
        id: 'a1',
        toolName: 'Run git push',
        args: { command: 'git push', _class: 'execute' },
        agentId: 'default',
        requestedAt: '2026-10-21T10:00:00Z',
      },
    ]);
    expect(approvalsOfSnapshot({ type: 'other', payload: {} })).toEqual([]);
    expect(approvalsOfSnapshot({ type: 'agent.snapshot' })).toEqual([]);
  });

  it('sends the decision as the socket takes it', () => {
    expect(JSON.parse(decisionMessage('a1', true))).toEqual({
      type: 'tool_approval_decision',
      approvalId: 'a1',
      approved: true,
    });
    expect(JSON.parse(decisionMessage('a1', false, 'not now'))).toEqual({
      type: 'tool_approval_decision',
      approvalId: 'a1',
      approved: false,
      note: 'not now',
    });
  });

  it('says what a decision came to from the snapshots', () => {
    // Still listed: nothing yet.
    expect(
      decisionSettled(true, [{ id: 'a1' }], 'a1', true, 'Run git push'),
    ).toBeNull();
    // No longer listed: done.
    expect(decisionSettled(true, [], 'a1', true, 'Run git push')).toBe(
      ATTENTION_WORDS.approved('Run git push'),
    );
    expect(
      decisionSettled(true, [{ id: 'a2' }], 'a1', false, 'Run git push'),
    ).toBe(ATTENTION_WORDS.declined('Run git push'));
    // Not pending when asked: answered elsewhere.
    expect(decisionSettled(false, [], 'a1', true, 'Run git push')).toBe(
      ATTENTION_WORDS.answeredElsewhere,
    );
    expect(LOCAL_APPROVAL_WORDS.socketGone('project')).toBe(
      'The local runtime of project went away before answering.',
    );
  });
});
