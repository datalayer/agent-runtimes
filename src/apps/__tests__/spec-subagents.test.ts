/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A spec's own subagents reach the in-page loop, so delegation works in the
 * browser as it does on a server.
 */

import { describe, expect, it } from 'vitest';
import { getAgentspecs } from '../../specs/agents';
import { specSubagents } from '../plugins/agents/specSubagents';

describe('specSubagents', () => {
  it('reads the example-subagents spec: researcher, writer, and a generalist', () => {
    const subagents = specSubagents(getAgentspecs('example-subagents'));
    expect(subagents.map(entry => entry.name)).toEqual([
      'researcher',
      'writer',
      'general-purpose',
    ]);
    for (const subagent of subagents) {
      // What the parent's model chooses on, and what the child is told.
      expect(subagent.description.length).toBeGreaterThan(20);
      expect(subagent.instructions?.length ?? 0).toBeGreaterThan(20);
    }
  });

  it('has nothing for a spec without subagents, or no spec', () => {
    expect(specSubagents(getAgentspecs('loop-shell'))).toEqual([]);
    expect(specSubagents(undefined)).toEqual([]);
  });
});
