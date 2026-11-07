/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, expect, it } from 'vitest';
import { APP_CATALOGUE } from '../apps';
import { BATTLE_CATALOGUE } from '../battles';
import {
  hasOverrides,
  overridesWords,
  withAppOverrides,
} from '../appOverrides';

describe('an application overridden on stage', () => {
  const app = Object.values(APP_CATALOGUE)[0];

  it('is the same application when nothing is overridden', () => {
    expect(withAppOverrides(app, undefined)).toBe(app);
    expect(withAppOverrides(app, {})).toBe(app);
    expect(hasOverrides({ skills: [] })).toBe(false);
    expect(overridesWords({})).toBe('');
  });

  it('answers with the model said, keeps the rest, and says what changed', () => {
    const played = withAppOverrides(app, {
      model: 'alibaba:qwen-max',
      skills: ['pdf'],
    });
    expect(played).not.toBe(app);
    expect(played.model).toBe('alibaba:qwen-max');
    expect(played.skills).toEqual(['pdf']);
    expect(played.instructions).toBe(app.instructions);
    expect(played.id).toBe(app.id);
    expect(
      overridesWords({ model: 'alibaba:qwen-max', instructions: 'Be brief.' }),
    ).toBe('model alibaba:qwen-max · instructions');
  });

  it('is what Red plays with in the races and challenges of the catalogue', () => {
    for (const id of [
      'deck-race',
      'sheet-race',
      'invoice-race',
      'report-challenge',
    ]) {
      const red = BATTLE_CATALOGUE[id].contestants.find(c => c.id === 'red');
      expect([id, red?.overrides]).toEqual([id, { model: 'alibaba:qwen-max' }]);
      const blue = BATTLE_CATALOGUE[id].contestants.find(c => c.id === 'blue');
      expect([id, hasOverrides(blue?.overrides)]).toEqual([id, false]);
    }
  });
});
