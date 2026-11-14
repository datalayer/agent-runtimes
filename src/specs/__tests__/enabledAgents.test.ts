/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agents offered: the five of the home page (agentspecs 0.0.186, the user,
 * 14 November 2026). The new agent page and loop's pickers offer what the
 * catalogue enables and nothing else, so these flags are the whole list.
 */

import { describe, expect, it } from 'vitest';
import { listAgentspecs } from '../agents';

describe('the agents the catalogue enables', () => {
  it('are the Marketer, the Shopper, Terra, the Accountant and the Steward for AWS', () => {
    const enabled = listAgentspecs()
      .filter(spec => spec.enabled === true)
      .map(spec => spec.id)
      .sort();
    expect(enabled).toEqual([
      'worker-accountant',
      'worker-marketer',
      'worker-shopper',
      'worker-steward-aws',
      'worker-terra',
    ]);
  });

  it('keep the others in the catalogue, runnable by id', () => {
    const ids = listAgentspecs().map(spec => spec.id);
    for (const id of [
      'example-simple',
      'example-blank',
      'jupyter-data-analyst',
    ]) {
      expect(ids).toContain(id);
    }
  });
});
