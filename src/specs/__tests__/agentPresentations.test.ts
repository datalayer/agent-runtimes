/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agents that present themselves, without the catalogue: the same
 * tagline and presentation the catalogue's agent carries.
 */

import { describe, expect, it } from 'vitest';
import {
  AGENT_PRESENTATIONS,
  getAgentPresentation,
} from '../agentPresentations';
import { getAgentspecs } from '../agents';

describe('the agents’ presentations', () => {
  it('are the seed agents’, each with a tagline and a Markdown document', () => {
    expect(Object.keys(AGENT_PRESENTATIONS).sort()).toEqual([
      'jupyter-data-analyst',
      'worker-accountant',
      'worker-analyst',
      'worker-marketer',
      'worker-shopper',
      'worker-steward-aws',
      'worker-terra',
      'worker-traveller',
    ]);
    for (const one of Object.values(AGENT_PRESENTATIONS)) {
      expect(one.tagline).not.toBe('');
      expect(one.tagline).not.toContain('\n');
      // A paragraph (its description), a list, a link: no heading, no HTML.
      expect(one.presentation.replace(/\s+/g, ' ')).toContain(one.description);
      expect(one.presentation).toMatch(/^- /m);
      expect(one.presentation).not.toMatch(/^#|<[a-z]/m);
    }
  });

  it('say what the catalogue’s agent says', () => {
    for (const one of Object.values(AGENT_PRESENTATIONS)) {
      const spec = getAgentspecs(one.id)!;
      expect(spec.name).toBe(one.name);
      expect(spec.emoji).toBe(one.emoji);
      expect(spec.tagline).toBe(one.tagline);
      expect(spec.presentation).toBe(one.presentation);
    }
  });

  it('are read by id, with or without a version', () => {
    expect(getAgentPresentation('worker-marketer:0.0.1')?.tagline).toBe(
      'Plans, drafts, reads the replies',
    );
    expect(getAgentPresentation('example-simple')).toBeUndefined();
  });
});
