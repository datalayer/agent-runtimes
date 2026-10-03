/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's line of status (LOOP T-08): idle, thinking, working or
 * waiting for you, from the turn and the newest tool call.
 */

import { describe, expect, it } from 'vitest';
import { PRESENCE_LINES, presenceState } from '../plugins/chat/presenceStatus';

describe('the presence of an application', () => {
  it('is ready between turns', () => {
    expect(presenceState(false)).toBe('idle');
    expect(PRESENCE_LINES.idle).toBe('Ready');
  });

  it('thinks during a turn, and works while a tool has not returned', () => {
    expect(presenceState(true)).toBe('thinking');
    expect(presenceState(true, { open: false, pendingApproval: false })).toBe(
      'thinking',
    );
    expect(presenceState(true, { open: true, pendingApproval: false })).toBe(
      'working',
    );
  });

  it('waits for the person while an approval is asked, streaming or not', () => {
    expect(presenceState(true, { open: true, pendingApproval: true })).toBe(
      'waiting',
    );
    expect(presenceState(false, { open: true, pendingApproval: true })).toBe(
      'waiting',
    );
    expect(PRESENCE_LINES.waiting).toBe('Waiting for you');
  });

  it('is not working on a tool a stopped turn left open', () => {
    expect(presenceState(false, { open: true, pendingApproval: false })).toBe(
      'idle',
    );
  });
});
