/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an agent starts without (agentspecs 0.0.188, the user, 14 November
 * 2026): the catalogue's `optional`, carried into the TypeScript catalogue,
 * keeps those servers' and skills' secrets out of what an agent requires, and
 * says which groups want one member set up.
 */

import { describe, expect, it } from 'vitest';
import {
  isAgentspecComponentOptional,
  unmetAgentspecGroups,
} from '../../types/agentspecs';
import { getAgentspecRequiredEnvVars, getAgentspecs } from '../agents';

describe('an agent’s optional servers and skills', () => {
  const marketer = getAgentspecs('worker-marketer')!;

  it('are the catalogue’s: one network at least, neither search nor the repositories', () => {
    expect(marketer.optional).toEqual({
      mcpServers: ['x', 'bluesky', 'discord'],
      skills: ['crawl', 'github'],
      // Set up by an X or Bluesky account linked in Settings (agentspecs 0.0.189).
      backendTools: ['social-post-x', 'social-post-bluesky'],
      atLeastOne: [
        ['x', 'bluesky', 'discord', 'social-post-x', 'social-post-bluesky'],
      ],
    });
    expect(
      isAgentspecComponentOptional(marketer, 'backendTool', 'social-post-x'),
    ).toBe(true);
    expect(marketer.mcpServers.map(server => server.id)).not.toContain(
      'linkedin',
    );
    expect(isAgentspecComponentOptional(marketer, 'mcpServer', 'x:0.0.1')).toBe(
      true,
    );
    expect(isAgentspecComponentOptional(marketer, 'skill', 'pdf')).toBe(false);
    expect(getAgentspecs('worker-shopper')!.optional?.skills).toEqual([
      'crawl',
    ]);
    expect(getAgentspecs('worker-terra')!.optional).toBeUndefined();
  });

  it('keep their secrets out of what the agent requires', () => {
    const required = getAgentspecRequiredEnvVars(marketer);
    for (const name of [
      'X_BEARER_TOKEN',
      'BLUESKY_APP_PASSWORD',
      'DISCORD_BOT_TOKEN',
      'TAVILY_API_KEY',
      'GITHUB_TOKEN',
    ]) {
      expect(required).not.toContain(name);
    }
    expect(
      getAgentspecRequiredEnvVars(getAgentspecs('worker-shopper')!),
    ).not.toContain('TAVILY_API_KEY');
  });

  it('say a group none of which is set up', () => {
    expect(unmetAgentspecGroups(marketer, () => false)).toEqual([
      ['x', 'bluesky', 'discord', 'social-post-x', 'social-post-bluesky'],
    ]);
    expect(unmetAgentspecGroups(marketer, id => id === 'discord')).toEqual([]);
    // A linked Bluesky account sets up its posting tool, which counts for the group.
    expect(
      unmetAgentspecGroups(marketer, id => id === 'social-post-bluesky'),
    ).toEqual([]);
    expect(unmetAgentspecGroups(undefined, () => false)).toEqual([]);
  });
});
