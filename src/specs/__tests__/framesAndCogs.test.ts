/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Frames and Cogs: two catalogues generated from agentspecs 0.0.12.
 *
 * A Frame is owned, scoped context that inherits; a Cog extends an agent
 * spec and is equipped with Frames. Both arrive resolved.
 */

import { describe, expect, it } from 'vitest';
import { getAgentspecs } from '../agents';
import { COG_CATALOGUE, cogsUsing, getCog, listCogs } from '../cogs';
import { FRAME_CATALOGUE, getFrame, listFrames } from '../frames';
import * as specs from '..';

describe('the Frame catalogue', () => {
  it('lists every Frame, owned and scoped', () => {
    expect(Object.keys(FRAME_CATALOGUE)).toEqual(
      expect.arrayContaining([
        'datalayer',
        'web-research',
        'sales-pipeline',
        'board-reporting',
        'customer-research',
      ]),
    );
    for (const frame of listFrames()) {
      expect(frame.owner).toBeTruthy();
      expect(frame.scope).toBeTruthy();
      expect(frame.rules.length).toBeGreaterThan(0);
    }
    expect(getFrame('web-research:0.0.1')?.id).toBe('web-research');
    expect(getFrame('nope')).toBeUndefined();
  });

  it('gives a Frame with what it inherits', () => {
    const company = getFrame('datalayer')!;
    const child = getFrame('web-research')!;
    expect(child.extends).toBe('datalayer:0.0.1');
    expect(child.lineage).toEqual(['datalayer']);
    expect(company.lineage).toEqual([]);
    expect(child.rules.slice(0, company.rules.length)).toEqual(company.rules);
    expect(child.rules.length).toBeGreaterThan(company.rules.length);
    expect(child.guards[0].id).toBe('no-secrets');
    expect(child.mcpServers).toEqual(['tavily:0.0.1']);
  });
});

describe('the Cog catalogue', () => {
  it('lists the three worker Cogs, each extending an agent of the catalogue', () => {
    expect(
      Object.fromEntries(listCogs().map(cog => [cog.id, cog.agent])),
    ).toEqual({
      'cog-crawler': 'worker-crawler',
      'cog-sales-pipeline-board-report': 'worker-sales-pipeline-board-report',
      'cog-customer-interviewer': 'worker-customer-interviewer',
    });
    for (const cog of listCogs()) {
      expect(getAgentspecs(cog.agent)).toBeDefined();
      expect(getAgentspecs(cog.id)).toBeUndefined();
      for (const frame of [...cog.frames, ...cog.lineage]) {
        expect(FRAME_CATALOGUE[frame]).toBeDefined();
      }
    }
    expect(getCog('cog-crawler:0.0.1')).toBe(COG_CATALOGUE['cog-crawler']);
    expect(getCog('nope')).toBeUndefined();
    expect(
      listCogs()
        .filter(cog => cog.enabled)
        .map(cog => cog.id),
    ).toEqual(['cog-crawler']);
  });

  it('gives a Cog as the agent it extends, with its Frames', () => {
    const agent = getAgentspecs('worker-crawler')!;
    const cog = getCog('cog-crawler')!;
    expect(cog.spec.id).toBe('cog-crawler');
    expect(cog.spec.model).toBe(agent.model);
    expect(cog.spec.skills.map(skill => skill.id)).toEqual([
      ...agent.skills.map(skill => skill.id),
      'crawl',
    ]);
    expect(cog.spec.tags).toEqual([...agent.tags, 'cog']);
    expect(cog.spec.systemPrompt).toContain('## Frames');
    expect(cog.spec.systemPrompt).toContain(
      'Never present a search-result snippet',
    );
    expect(cog.guards.map(guard => guard.id)).toEqual([
      'no-secrets',
      'sources-cited',
      'source-supports-claim',
      'recency-stated',
    ]);
  });

  it('finds the Cogs under a Frame, through inheritance too', () => {
    expect(
      cogsUsing('datalayer')
        .map(cog => cog.id)
        .sort(),
    ).toEqual(Object.keys(COG_CATALOGUE).sort());
    expect(cogsUsing('board-reporting:0.0.1').map(cog => cog.id)).toEqual([
      'cog-sales-pipeline-board-report',
    ]);
  });

  it('is exported with the other catalogues', () => {
    expect(specs.COG_CATALOGUE).toBe(COG_CATALOGUE);
    expect(specs.FRAME_CATALOGUE).toBe(FRAME_CATALOGUE);
  });
});
