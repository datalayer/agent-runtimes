/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The chat's UI (the user, 15 November 2026): the agent's own `ui`, then the
 * `ui` of each MCP server it runs, each skill it enabled, each backend tool
 * it carries — each once, none from a component left out, only what needs no
 * connection for an anonymous visitor; and the seed agents get theirs from
 * what they use.
 */

import { describe, expect, it } from 'vitest';
import {
  AGENT_UI_PLUGINS,
  agentUiIdsOf,
  agentUiPluginsFor,
} from '../agentUiPlugins';
import { listUI } from '../../specs/ui';
import { loopPlugins } from '../presets';

const nameOf = (ref: unknown): string =>
  (ref as { name?: string; plugin?: { name: string } }).name ??
  (ref as { plugin: { name: string } }).plugin.name;

describe('the chat’s UI, merged', () => {
  it('is the agent’s, then its servers’, then its skills’, then its tools’, each once', () => {
    const ids = agentUiIdsOf('worker-voyager');
    // The servers (kiwi, booking-com, google-maps) before the skills.
    expect(ids.slice(0, 3)).toEqual([
      'trip-options',
      'trip-budget',
      'trip-itinerary',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    const marketer = agentUiIdsOf('worker-marketer');
    expect(marketer.slice(0, 2)).toEqual(['a2ui-surface', 'x-budget']);
    expect(marketer).toEqual(
      expect.arrayContaining([
        'browser-session',
        'social-accounts',
        'x-post-preview',
        'bluesky-post-preview',
        'linkedin-post-preview',
        'linkedin-link',
      ]),
    );
  });

  it('takes none from an optional server left out, nor from one not running', () => {
    expect(agentUiIdsOf('worker-marketer')).toContain('browser-session');
    expect(
      agentUiIdsOf('worker-marketer', { leftOut: ['linkedin'] }),
    ).not.toContain('browser-session');
    // Running reported: only those running bring theirs.
    expect(
      agentUiIdsOf('worker-marketer', { running: ['discord'] }),
    ).not.toContain('browser-session');
  });

  it('brings a server’s UI when it starts and drops it when it stops', () => {
    // LinkedIn's server: its sign-in comes with it, and goes with it.
    expect(agentUiIdsOf('worker-marketer', { running: [] })).not.toContain(
      'browser-session',
    );
    expect(
      agentUiIdsOf('worker-marketer', { running: ['linkedin'] }),
    ).toContain('browser-session');
    // A card a show tool brings stays while its server is away.
    expect(agentUiIdsOf('worker-shopper', { running: [] })).toContain(
      'product-comparison',
    );
  });

  it('gives an anonymous visitor only the UI that needs no connection', () => {
    const ids = agentUiIdsOf('worker-marketer');
    const visitor = agentUiPluginsFor(ids, { anonymous: true }).map(nameOf);
    expect(visitor).not.toContain('@datalayer/loop-plugin-x-budget');
    expect(visitor).not.toContain('@datalayer/loop-plugin-linkedin-link');
    expect(visitor).not.toContain('@datalayer/loop-plugin-social-accounts');
    const shopper = agentUiPluginsFor(agentUiIdsOf('worker-shopper'), {
      anonymous: true,
    }).map(nameOf);
    expect(shopper).toContain('@datalayer/loop-plugin-shopping-basket');
    expect(shopper).not.toContain('@datalayer/loop-plugin-pap-purchase');
  });

  it('passes over the UI every chat has and an id it does not know', () => {
    expect(
      agentUiPluginsFor(['chat', 'a2ui-surface', 'browser-session', 'nope']),
    ).toEqual([]);
  });
});

describe('the seed agents’ UI', () => {
  it('comes from what each uses', () => {
    expect(agentUiIdsOf('worker-shopper')).toEqual(
      expect.arrayContaining([
        'pap-purchase',
        'product-comparison',
        'shopping-basket',
      ]),
    );
    expect(agentUiIdsOf('worker-accountant')).toEqual(
      expect.arrayContaining([
        'bank-reconciliation',
        'trial-balance',
        'vat-summary',
      ]),
    );
    expect(agentUiIdsOf('worker-terra')).toEqual(
      expect.arrayContaining(['earth-scenes', 'earth-index']),
    );
    expect(agentUiIdsOf('worker-steward-aws')).toContain('aws-savings');
  });

  it('has a UI spec for every agent UI plugin', () => {
    const specified = new Set(listUI().map(spec => spec.id));
    for (const id of Object.keys(AGENT_UI_PLUGINS)) {
      expect(specified.has(id), id).toBe(true);
    }
  });

  it('is mounted by the preset for the spec it creates', () => {
    const names = loopPlugins({
      target: 'datalayer',
      datalayerAgentSpecId: 'worker-accountant',
    }).map(nameOf);
    expect(names).toContain('@datalayer/loop-plugin-bank-reconciliation');
    expect(names).not.toContain('@datalayer/loop-plugin-trip-options');
    const visitor = loopPlugins({
      datalayerAgentSpecId: 'worker-marketer',
      runAsAnonymous: true,
    }).map(nameOf);
    expect(visitor).not.toContain('@datalayer/loop-plugin-x-budget');
  });
});
