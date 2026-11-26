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
      // The linkedin server on a browser session (agentspecs 0.0.191); no
      // bluesky server: the linked account reads and acts (agentspecs 0.0.192);
      // no x server either (agentspecs 0.0.194).
      mcpServers: ['discord', 'linkedin'],
      // Stock photos, set up by any one provider's key (agentspecs 0.0.218).
      // Crawling a page asks no key (25 November 2026): never optional.
      skills: ['github', 'datalayer-email', 'image-stock'],
      // Set up by an X, Bluesky or LinkedIn account linked in Settings
      // (agentspecs 0.0.189, LinkedIn 0.0.190).
      backendTools: [
        'social-post-x',
        'social-read-x',
        'social-reply-x',
        'social-like-x',
        'social-repost-x',
        'social-post-bluesky',
        'social-read-bluesky',
        'social-reply-bluesky',
        'social-like-bluesky',
        'social-repost-bluesky',
        'social-follow-bluesky',
        'social-post-linkedin',
        'social-comment-linkedin',
      ],
      atLeastOne: [
        [
          'discord',
          'linkedin',
          'social-post-x',
          'social-post-bluesky',
          'social-post-linkedin',
        ],
      ],
    });
    expect(
      isAgentspecComponentOptional(marketer, 'backendTool', 'social-post-x'),
    ).toBe(true);
    // The linkedin server, optional, on a browser session (agentspecs 0.0.191).
    expect(marketer.mcpServers.map(server => server.id)).toContain('linkedin');
    expect(
      isAgentspecComponentOptional(marketer, 'mcpServer', 'linkedin:0.0.1'),
    ).toBe(true);
    // X is read and acted on with the linked account: no x server, no key.
    expect(marketer.mcpServers.map(server => server.id)).not.toContain('x');
    expect(isAgentspecComponentOptional(marketer, 'skill', 'pdf')).toBe(false);
    // Nothing of the Shopper's is optional since its crawl skill asks no key.
    expect(getAgentspecs('worker-shopper')!.optional).toBeUndefined();
    expect(isAgentspecComponentOptional(marketer, 'skill', 'crawl')).toBe(
      false,
    );
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
      [
        'discord',
        'linkedin',
        'social-post-x',
        'social-post-bluesky',
        'social-post-linkedin',
      ],
    ]);
    expect(unmetAgentspecGroups(marketer, id => id === 'discord')).toEqual([]);
    // A linked Bluesky account sets up its posting tool, which counts for the group.
    expect(
      unmetAgentspecGroups(marketer, id => id === 'social-post-bluesky'),
    ).toEqual([]);
    expect(
      unmetAgentspecGroups(marketer, id => id === 'social-post-linkedin'),
    ).toEqual([]);
    expect(unmetAgentspecGroups(undefined, () => false)).toEqual([]);
  });
});
