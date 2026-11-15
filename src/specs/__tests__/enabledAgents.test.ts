/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agents offered: the six of the home page (the user, 14 November 2026;
 * the Voyager since 15 November 2026).
 * The new agent page, the chats, the assign menu and loop's pickers offer what
 * the catalogue enables and lists (`isAgentspecOffered`), and nothing else, so
 * these flags are the whole list. `listed: false` (agentspecs 0.0.187) keeps
 * an enabled agent out of the pickers: example-simple, the neutral default,
 * runs by id and for the applications that name it.
 */

import { describe, expect, it } from 'vitest';
import { isAgentspecOffered } from '../../types/agentspecs';
import { getAgentspecs, listAgentspecs } from '../agents';

const SIX = [
  'worker-accountant',
  'worker-marketer',
  'worker-shopper',
  'worker-steward-aws',
  'worker-terra',
  'worker-voyager',
];

describe('the agents the catalogue offers', () => {
  it('are the Marketer, the Shopper, the Accountant, the Voyager, Terra and the Steward for AWS', () => {
    const offered = listAgentspecs()
      .filter(isAgentspecOffered)
      .map(spec => spec.id)
      .sort();
    expect(offered).toEqual(SIX);
  });

  it('leave out an enabled agent that is not listed', () => {
    for (const id of [
      'example-simple',
      'example-blank',
      'jupyter-data-analyst',
    ]) {
      const spec = getAgentspecs(id);
      expect(spec?.enabled).toBe(true);
      expect(spec?.listed).toBe(false);
      expect(isAgentspecOffered(spec)).toBe(false);
    }
  });

  it('read listed as true unless said, and a disabled agent as not offered', () => {
    expect(isAgentspecOffered({ enabled: true })).toBe(true);
    expect(isAgentspecOffered({ enabled: true, listed: true })).toBe(true);
    expect(isAgentspecOffered({ enabled: false, listed: true })).toBe(false);
    expect(isAgentspecOffered(undefined)).toBe(false);
  });
});
