/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A shipped application's page opens on the conversation its runtime's agent
 * holds: a turn a personal agent asked over PAP is drawn without what the
 * runtime told the application before it (decided 2026-10-14).
 */

import { describe, expect, it } from 'vitest';
import { extractChatMessagesFromFullContext } from './fullContextMessages';

const PREAMBLE =
  '<asked-for>Asked over PAP by the personal agent https://prod1.datalayer.run/api/iam/v1/pap/agents/01M4/agent.json for a person signed in here, their account 01JV, who granted it: orders:read, orders:write.</asked-for>';

const drawn = (messages: Array<Record<string, unknown>>) =>
  extractChatMessagesFromFullContext({ messages }).map(m => [
    m.role,
    m.content,
  ]);

describe('a conversation drawn from the agent it is held by', () => {
  it("draws a personal agent's question in the person's words only", () => {
    expect(
      drawn([
        {
          role: 'user',
          content: `${PREAMBLE}\n\nExchange order ord_7Hk2 for size L.`,
        },
        { role: 'assistant', content: 'Proposed to you: size L.' },
      ]),
    ).toEqual([
      ['user', 'Exchange order ord_7Hk2 for size L.'],
      ['assistant', 'Proposed to you: size L.'],
    ]);
  });

  it('draws what a person typed, and what the agent said, as they are', () => {
    const said = `${PREAMBLE} is what it was told.`;
    expect(
      drawn([
        { role: 'user', content: 'Do you exchange jackets?' },
        { role: 'assistant', content: said },
      ]),
    ).toEqual([
      ['user', 'Do you exchange jackets?'],
      ['assistant', said],
    ]);
  });

  it('refuses a preamble that never closes', () => {
    expect(() =>
      drawn([{ role: 'user', content: '<asked-for>Asked over PAP by…' }]),
    ).toThrow(/never closes/);
  });

  it('leaves system messages out', () => {
    expect(drawn([{ role: 'system', content: 'You are…' }])).toEqual([]);
  });
});
