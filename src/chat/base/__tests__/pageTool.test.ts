/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A page tool always answers: what its handler returned, or why it failed.
 *
 * A handler that threw used to leave its call without a result, so the run
 * never went on and the runtime could not count the failure (its guard ends
 * a turn whose page tool failed twice). It now answers a failed result, the
 * tool and what failed in a sentence.
 *
 * @module chat/base/__tests__/pageTool
 */

import { describe, expect, it } from 'vitest';
import { runPageTool } from '../pageTool';

describe('a page tool', () => {
  it('answers what its handler returned', async () => {
    expect(
      await runPageTool('set_shop_header', async () => ({ set: ['basket'] }), {
        basket: { value: 2 },
      }),
    ).toEqual({
      toolCallId: undefined,
      success: true,
      result: { set: ['basket'] },
    });
  });

  it('answers a failure, in a sentence, when its handler throws', async () => {
    const answered = await runPageTool(
      'set_shop_header',
      async () => {
        throw new Error('Nothing to set: name one of basket, budget.');
      },
      {},
    );
    expect(answered).toEqual({
      toolCallId: undefined,
      success: false,
      error:
        'set_shop_header failed: Nothing to set: name one of basket, budget.',
    });
  });

  it('answers a failure for something thrown that is not an Error', async () => {
    const answered = await runPageTool(
      'show_notice',
      async () => {
        throw 'no edge';
      },
      {},
    );
    expect(answered.success).toBe(false);
    expect(answered.error).toBe('show_notice failed: no edge');
  });
});
