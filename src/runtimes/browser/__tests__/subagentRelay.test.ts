/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A delegated run's stream, relayed as the subagent events the side panel
 * and the composer's pulse draw.
 */

import { describe, expect, it } from 'vitest';
import { relaySubagentRun, type SubagentStreamPart } from '../subagents';

async function* parts(list: SubagentStreamPart[]) {
  for (const part of list) {
    yield part;
  }
}

describe('relaySubagentRun', () => {
  it('turns text, tools and errors into phases, and returns the text', async () => {
    const seen: unknown[] = [];
    const text = await relaySubagentRun(
      parts([
        { type: 'start' },
        { type: 'reasoning-delta', text: 'hmm' },
        { type: 'text-delta', text: 'Two ' },
        { type: 'tool-call', toolName: 'readAllCells', input: { limit: 3 } },
        { type: 'tool-result', toolName: 'readAllCells', output: { cells: 3 } },
        { type: 'text-delta', text: 'findings.' },
        { type: 'finish-step' },
        { type: 'error', error: new Error('rate limited') },
        { type: 'finish' },
      ]),
      event => seen.push(event),
    );
    expect(text).toBe('Two findings.');
    expect(seen).toEqual([
      { phase: 'thinking', text: 'hmm' },
      { phase: 'text', text: 'Two ' },
      { phase: 'tool_call', toolName: 'readAllCells', toolArgs: { limit: 3 } },
      { phase: 'tool_result', toolName: 'readAllCells', result: '{"cells":3}' },
      { phase: 'text', text: 'findings.' },
      { phase: 'error', error: 'rate limited' },
    ]);
  });

  it('keeps a tool result short enough to show', async () => {
    const seen: { result?: string }[] = [];
    await relaySubagentRun(
      parts([{ type: 'tool-result', toolName: 'x', output: 'y'.repeat(1000) }]),
      event => seen.push(event as { result?: string }),
    );
    expect(seen[0].result).toHaveLength(401);
    expect(seen[0].result?.endsWith('…')).toBe(true);
  });
});
