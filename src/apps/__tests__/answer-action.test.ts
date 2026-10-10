/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, expect, it } from 'vitest';
import { answerAction } from '../plugins/a2ui-surface/toolResult';

describe('a button of what an answer shows (LOOP P-04)', () => {
  it('sends its action to the application, by name, with what it read', () => {
    expect(
      answerAction({
        name: 'again',
        surfaceId: 'answer-m1',
        context: { row: 2 },
      }),
    ).toEqual({
      message: 'again',
      forwardedProps: {
        loop: { action: { name: 'again', payload: { row: 2 } } },
      },
    });
    expect(
      answerAction({ name: 'again', surfaceId: 'answer-m1' })?.forwardedProps
        .loop.action.payload,
    ).toEqual({});
  });

  it('leaves any other surface its own', () => {
    expect(answerAction({ name: 'go', surfaceId: 'form-1' })).toBeNull();
    expect(answerAction({ name: ' ', surfaceId: 'answer-m1' })).toBeNull();
  });
});
