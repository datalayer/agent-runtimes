/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An approval as every card says it (M-016): a message whole, anything
 * else every argument, why it asked apart.
 *
 * @module portable/__tests__/approvalCard
 */

import { describe, expect, it } from 'vitest';
import { APPROVAL_CARD_WORDS, approvalCardOf } from '..';

describe('an approval card (M-016)', () => {
  it('shows a message whole, its row by recipients and subject, never its body', () => {
    const card = approvalCardOf({
      tool_name: 'send_email',
      tool_args: {
        to: 'ada@example.com',
        subject: 'Report',
        body: 'Attached.',
        _rule: 'Mail asks first',
      },
    });
    expect(card).toMatchObject({
      action: 'Send email',
      why: 'Mail asks first',
      raw: '',
      summary: 'ada@example.com · Report',
    });
    expect(card.message).toMatchObject({
      to: 'ada@example.com',
      body: 'Attached.',
    });
  });

  it('falls back to every non-private argument, complete', () => {
    const card = approvalCardOf({
      toolName: 'delete-file',
      toolArgs: { path: '/a', recursive: true, _check: 'Deletes' },
    });
    expect(card).toMatchObject({
      action: 'Delete file',
      why: 'Deletes',
      message: null,
      summary: 'Deletes',
    });
    expect(JSON.parse(card.raw)).toEqual({ path: '/a', recursive: true });
    expect(approvalCardOf({ tool_name: '', tool_args: {} })).toMatchObject({
      action: 'An action',
      raw: APPROVAL_CARD_WORDS.noArguments,
    });
  });
});
