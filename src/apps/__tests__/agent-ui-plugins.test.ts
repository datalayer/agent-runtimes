/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The chat's UI (the user, 15 November 2026): the agent's own `ui`, then the
 * `ui` of each MCP server it runs, each skill it enabled, each backend tool
 * it carries — each once, none from a component left out, only what needs no
 * connection for an anonymous visitor, what needs one drawn locked in its
 * place (the Marketer's *Sign in to LinkedIn*); and the seed agents get
 * theirs from what they use.
 */

import { describe, expect, it } from 'vitest';
import {
  AGENT_UI_PLUGINS,
  agentUiChoicesOf,
  agentUiChromeOf,
  agentUiIdsOf,
  agentUiPluginsFor,
  lockedUiOf,
  lockedUiPluginsFor,
  placementOf,
} from '../agentUiPlugins';
import { appPreset } from '../apps/AppRenderer';
import { ANONYMOUS_WORDS } from '../../chat/anonymous/anonymousMode';
import { APP_CATALOGUE } from '../../specs/apps';
import { listUI } from '../../specs/ui';
import { agentPlugins } from '../presets';

const LOCKED = '@datalayer/agent-plugin-locked-ui';

const nameOf = (ref: unknown): string =>
  (ref as { name?: string; plugin?: { name: string } }).name ??
  (ref as { plugin: { name: string } }).plugin.name;

describe('the chat’s UI, merged', () => {
  it('is the agent’s, then its servers’, then its skills’, then its tools’, each once', () => {
    const ids = agentUiIdsOf('worker-traveller');
    // Its own (its title bar's header, its notices, its Composer), then the
    // servers (kiwi, overture, booking-com, google-maps) before the skills.
    expect(ids.slice(0, 3)).toEqual([
      'trip-header',
      'notices',
      'composer-portal',
    ]);
    expect(ids[3]).toBe('public-library');
    expect(ids.slice(4, 8)).toEqual([
      'trip-options',
      'trip-budget',
      'trip-map',
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
    expect(visitor).not.toContain('@datalayer/agent-plugin-x-budget');
    expect(visitor).not.toContain('@datalayer/agent-plugin-linkedin-link');
    expect(visitor).not.toContain('@datalayer/agent-plugin-social-accounts');
    const shopper = agentUiPluginsFor(agentUiIdsOf('worker-shopper'), {
      anonymous: true,
    }).map(nameOf);
    expect(shopper).toContain('@datalayer/agent-plugin-shopping-basket');
    expect(shopper).not.toContain('@datalayer/agent-plugin-pap-purchase');
  });

  it('passes over the UI every chat has and an id it does not know', () => {
    expect(
      agentUiPluginsFor(['chat', 'a2ui-surface', 'browser-session', 'nope']),
    ).toEqual([]);
  });
});

describe('the seed agents’ UI', () => {
  const publicSeeds = [
    'worker-marketer',
    'worker-shopper',
    'worker-accountant',
    'worker-traveller',
    'worker-terra',
    'worker-steward-aws',
    'worker-data-analyst',
    'worker-functional-analyst',
  ];

  it.each(publicSeeds)(
    '%s can browse and publish through the Library UI',
    agent => {
      expect(agentUiIdsOf(agent)).toContain('public-library');
    },
  );

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

  it('registers a working plugin for every placement a UI spec declares', () => {
    for (const spec of listUI()) {
      if (!AGENT_UI_PLUGINS[spec.id]) {
        continue;
      }
      for (const placement of spec.placements ?? []) {
        const [plugin] = agentUiPluginsFor([{ plugin: spec.id, placement }]);
        expect(plugin, `${spec.id}@${placement}`).toBeDefined();
      }
    }
  });

  it('gives the four seed agents the document and the person’s Spaces, kept from a visitor', () => {
    for (const agent of [
      'worker-data-analyst',
      'worker-functional-analyst',
      'worker-terra',
      'worker-steward-aws',
    ]) {
      const right = agentUiChoicesOf(agent)
        .filter(choice => choice.placement === 'right')
        .map(choice => [choice.plugin, choice.tab]);
      expect(right, agent).toEqual(
        expect.arrayContaining([
          ['page-document', 'Document'],
          ['spaces', 'Spaces'],
        ]),
      );
    }
    expect(placementOf({ plugin: 'spaces' })).toBe('right');
    expect(AGENT_UI_PLUGINS.spaces.needsConnection).toBe(true);
    expect(nameOf(agentUiPluginsFor(['spaces'])[0])).toBe(
      '@datalayer/agent-plugin-spaces',
    );
  });

  it('places the page’s document and notebook in a side panel by default, never in a message', () => {
    // A message placement mounted no editor and no kernel: their code-running
    // tools waited for a kernel that never came.
    for (const id of ['page-document', 'page-notebook']) {
      expect(placementOf({ plugin: id }), id).toBe('right');
      expect(AGENT_UI_PLUGINS[id].message, id).toBeUndefined();
      expect(
        agentUiPluginsFor([{ plugin: id, placement: 'message' }]),
        id,
      ).toEqual([]);
      expect(nameOf(agentUiPluginsFor([id])[0])).toBe(
        `@datalayer/agent-plugin-${id}`,
      );
    }
  });

  it('is mounted by the preset for the spec it creates', () => {
    const names = agentPlugins({
      target: 'datalayer',
      datalayerAgentSpecId: 'worker-accountant',
    }).map(nameOf);
    expect(names).toContain('@datalayer/agent-plugin-bank-reconciliation');
    expect(names).not.toContain('@datalayer/agent-plugin-trip-options');
    const visitor = agentPlugins({
      datalayerAgentSpecId: 'worker-marketer',
      runAsAnonymous: true,
    }).map(nameOf);
    expect(visitor).not.toContain('@datalayer/agent-plugin-x-budget');
  });
});

describe('where each UI goes', () => {
  it('mounts each chrome placement in its slot', async () => {
    const { registrationOf } = await import('./fixtures/uiPluginRegistrations');
    const slotsOf = async (plugin: string, placement: string) =>
      (
        await registrationOf(() =>
          agentUiPluginsFor([{ plugin, placement: placement as never }]),
        )
      ).slots;
    expect(await slotsOf('x-budget', 'header')).toEqual(['agent.chatHeader']);
    expect(await slotsOf('x-budget', 'footer')).toEqual(['agent.status']);
    expect(await slotsOf('linkedin-link', 'banner')).toEqual([
      'agent.chatBanner',
    ]);
    expect(await slotsOf('trip-summary', 'header')).toEqual([
      'agent.chatHeader',
    ]);
    // A message UI binds its tools rather than fill a slot.
    const message = await registrationOf(() =>
      agentUiPluginsFor([{ plugin: 'shopping-basket', placement: 'message' }]),
    );
    expect(message.slots).toEqual([]);
    expect(message.points).toEqual([
      'reactor.ui.renderer',
      'reactor.ui.toolBinding',
    ]);
    // A placement the chat has no place for: nothing mounted rather than a
    // misplaced chip (the old `panel`, gone since the side panels).
    expect(
      agentUiPluginsFor([{ plugin: 'x-budget', placement: 'panel' as never }]),
    ).toEqual([]);
  });

  it('places each UI as declared, else as its spec says first', () => {
    const marketer = agentUiChoicesOf('worker-marketer');
    const placed = Object.fromEntries(
      marketer.map(choice => [choice.plugin, choice.placement]),
    );
    expect(placed).toMatchObject({
      'x-budget': 'header',
      'social-accounts': 'header',
      'linkedin-link': 'banner',
      'browser-session': 'header',
      'x-post-preview': 'message',
    });
    expect(placementOf({ plugin: 'x-budget', placement: 'footer' })).toBe(
      'footer',
    );
    const chrome = agentUiChromeOf(marketer);
    expect(chrome.header).toEqual(
      expect.arrayContaining([
        'x-budget',
        'social-accounts',
        'browser-session',
      ]),
    );
    expect(chrome.banner).toEqual(['linkedin-link']);
    expect(agentUiChromeOf(marketer, { anonymous: true }).header).toEqual([]);
    expect(
      agentUiChoicesOf('worker-functional-analyst')
        .filter(choice => choice.placement === 'right')
        .map(choice => [choice.plugin, choice.tab]),
    ).toEqual([
      ['page-excalidraw', 'Excalidraw'],
      ['page-mermaid', 'Mermaid'],
      ['page-react-flow', 'React Flow'],
      ['page-document', 'Document'],
      ['spaces', 'Spaces'],
    ]);
  });

  it('takes a UI out of its slot when its server goes', () => {
    const traveller = (running: string[]) =>
      agentUiChromeOf(agentUiChoicesOf('worker-terra', { running })).header;
    expect(traveller(['earthdata'])).toContain('earth-area');
    expect(traveller([])).not.toContain('earth-area');
  });
});

// The Data Analyst brings no card: its results land in the notebook's cells; nor does
// the Functional Analyst, whose canvas and diagrams are page tools in its right panel.
describe('the six seed agents that bring cards', () => {
  it.each([
    'worker-marketer',
    'worker-shopper',
    'worker-accountant',
    'worker-traveller',
    'worker-terra',
    'worker-steward-aws',
  ])('%s has UI in the chat and an A2UI message', agent => {
    const choices = agentUiChoicesOf(agent);
    expect(choices.some(choice => choice.placement !== 'message')).toBe(true);
    expect(
      choices.some(
        choice => choice.placement === 'message' && choice.renderer === 'a2ui',
      ),
    ).toBe(true);
    // A visitor still gets a chrome UI and an A2UI message that need no connection.
    if (agent !== 'worker-marketer') {
      const visitor = agentUiChromeOf(choices, { anonymous: true });
      expect(Object.values(visitor).flat().length).toBeGreaterThan(0);
    }
  });
});

describe('what a visitor sees locked (the user, 15 November 2026)', () => {
  const marketer = () => agentUiChoicesOf('worker-marketer');

  it('words each chrome UI that needs a connection, once, from every server and skill', () => {
    const locked = lockedUiOf(marketer());
    expect(locked).toEqual(
      expect.arrayContaining([
        ANONYMOUS_WORDS.locked.linkedin,
        ANONYMOUS_WORDS.locked.social,
        ANONYMOUS_WORDS.locked.x,
      ]),
    );
    // LinkedIn's link and its browser session say the same: one chip.
    expect(locked).toHaveLength(3);
    // Message UIs (post previews, a purchase) are no chip; nothing to lock: no group.
    expect(lockedUiOf(agentUiChoicesOf('worker-shopper'))).toEqual([]);
    expect(lockedUiPluginsFor(agentUiChoicesOf('worker-shopper'))).toEqual([]);
  });

  it('is one group in the title bar', async () => {
    const { registrationOf } = await import('./fixtures/uiPluginRegistrations');
    const registration = await registrationOf(() =>
      lockedUiPluginsFor(marketer()),
    );
    expect(registration.slots).toEqual(['agent.chatHeader']);
  });

  it('is mounted by the preset for a visitor, never for a person signed in', () => {
    const visitor = agentPlugins({
      datalayerAgentSpecId: 'worker-marketer',
      runAsAnonymous: true,
    }).map(nameOf);
    expect(visitor).toContain(LOCKED);
    expect(visitor).not.toContain('@datalayer/agent-plugin-x-budget');
    const signedIn = agentPlugins({
      target: 'datalayer',
      datalayerAgentSpecId: 'worker-marketer',
    }).map(nameOf);
    expect(signedIn).not.toContain(LOCKED);
    expect(signedIn).toContain('@datalayer/agent-plugin-x-budget');
  });

  it('comes with the demo Marketer’s agent on the visitors’ path, though its app names only the chat', () => {
    const app = APP_CATALOGUE['marketer-tryout'];
    expect(app.agent).toMatch(/^worker-marketer/);
    expect(appPreset(app, { visitor: true }).plugins.map(nameOf)).toContain(
      LOCKED,
    );
    expect(
      appPreset(app, { kept: { visitor: true } }).plugins.map(nameOf),
    ).toContain(LOCKED);
    expect(appPreset(app).plugins.map(nameOf)).not.toContain(LOCKED);
    expect(
      appPreset(app, { kept: { visitor: false } }).plugins.map(nameOf),
    ).not.toContain(LOCKED);
  });
});
