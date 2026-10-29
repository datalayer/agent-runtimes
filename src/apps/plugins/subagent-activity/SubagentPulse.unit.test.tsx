/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The pulse shows while a delegated run is under way, and goes when it ends.
 */

import * as React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { agentRuntimeStore } from '../../../stores';
import type { AgentStreamSubagentPayload } from '../../../types/stream';
import { SubagentPulse } from './SubagentPulse';

const append = (event: AgentStreamSubagentPayload) =>
  act(() => agentRuntimeStore.getState().appendSubagentEvent(event));

describe('SubagentPulse', () => {
  beforeEach(() => {
    act(() => agentRuntimeStore.getState().clearSubagentActivity());
  });

  it('is nothing until a subagent is working', () => {
    const { container } = render(<SubagentPulse />);
    expect(container.querySelector('[data-subagent-pulse]')).toBeNull();
  });

  it('pulses with the working subagent named, and stops when the run ends', () => {
    const { container } = render(<SubagentPulse />);
    append({
      subagentName: 'researcher',
      toolCallId: 'call-1',
      phase: 'start',
      task: 'Look it up',
    });
    const pulse = container.querySelector('[data-subagent-pulse]');
    expect(pulse?.getAttribute('data-subagent-pulse')).toBe('researcher');
    expect(pulse?.getAttribute('aria-label')).toBe('researcher is working…');
    append({
      subagentName: 'researcher',
      toolCallId: 'call-1',
      phase: 'end',
      output: 'Done.',
    });
    expect(container.querySelector('[data-subagent-pulse]')).toBeNull();
  });
});
