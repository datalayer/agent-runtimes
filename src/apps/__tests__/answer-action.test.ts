/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, expect, it } from 'vitest';
import type { Display } from '@datalayer/reactor/ui';
import {
  ANSWER_DISPLAY_TYPE,
  answerPress,
  answerSurface,
} from '../plugins/a2ui-surface/toolResult';

const CATALOG = 'datalayer';

const answer: Display = {
  type: ANSWER_DISPLAY_TYPE,
  version: 1,
  id: 'm1-shows',
  text: 'Bot showed Button again',
  data: {
    message_id: 'm1',
    title: 'Bot',
    summary: 'Bot showed Button again',
    surface: {
      surfaceId: 'm1-shows',
      catalogId:
        'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json',
      title: 'Bot',
      messages: [
        {
          version: 'v0.9',
          createSurface: {
            surfaceId: 'm1-shows',
            catalogId:
              'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json',
          },
        },
      ],
    },
  },
  actions: [{ name: 'again', token: 'minted-for-m1-shows' }],
};

describe('a button of what an answer shows (P-04, RU-2)', () => {
  it('presses the action its display offered, with its token and what it read', () => {
    expect(answerPress(answer, { name: 'again', context: { row: 2 } })).toEqual(
      {
        message: 'again',
        forwardedProps: {
          loop: {
            action: {
              name: 'again',
              display_id: 'm1-shows',
              token: 'minted-for-m1-shows',
              payload: { row: 2 },
            },
          },
        },
      },
    );
  });

  it('sends nothing for an action the display did not offer', () => {
    expect(answerPress(answer, { name: 'delete-everything' })).toEqual({
      refused: '“delete-everything” was not offered here.',
    });
    expect(answerPress({ ...answer, actions: [] }, { name: 'again' })).toEqual({
      refused: '“again” was not offered here.',
    });
  });

  it('draws the surface in the display, in the page’s catalog, and nothing of another type', () => {
    const surface = answerSurface(answer, CATALOG);
    expect(surface?.surfaceId).toBe('m1-shows');
    expect(
      (surface?.messages?.[0] as { createSurface: { catalogId: string } })
        .createSurface.catalogId,
    ).toBe(CATALOG);
    expect(
      answerSurface({ ...answer, type: 'application/vnd.other+json' }, CATALOG),
    ).toBeNull();
  });
});
