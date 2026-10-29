/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Words that go elsewhere than the agent (`LoopChatExtrasValue.sendInstead`,
 * P-08): a person's own words in a Direct Conversation with a
 * company, never the model's.
 */

import { describe, expect, it } from 'vitest';
import { sendInstead } from '../core';

describe('sendInstead', () => {
  it('leaves the words to the agent when nothing takes them elsewhere', async () => {
    expect(await sendInstead({}, 'Where is my order?')).toBeNull();
  });

  it('hands the words, as typed, to where the extras say, and to nothing else', async () => {
    const sent: string[] = [];
    const answered = await sendInstead(
      {
        sendInstead: {
          says: 'Your own words to Manzanita Outfitters',
          send: async text => {
            sent.push(text);
          },
        },
      },
      'Can I talk to Rosa?',
    );
    expect(answered).toEqual({ sent: true });
    expect(sent).toEqual(['Can I talk to Rosa?']);
  });

  it('says a refusal in its sentence, the words not taken', async () => {
    const answered = await sendInstead(
      {
        sendInstead: {
          says: 'Your own words to Manzanita Outfitters',
          send: async () => {
            throw new Error('Manzanita Outfitters closed this conversation.');
          },
        },
      },
      'Hello?',
    );
    expect(answered).toEqual({
      sent: false,
      refused: 'Manzanita Outfitters closed this conversation.',
    });
  });
});
