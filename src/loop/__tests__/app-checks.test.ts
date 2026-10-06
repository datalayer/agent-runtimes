/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The instant checks of an application (LOOP V-01 to V-04), as `loop apps
 * validate` says them, computed in the page with no model call.
 */

import { describe, expect, it } from 'vitest';
import { APP_SOURCES } from '../../specs/apps';
import { themeVariants } from '@datalayer/primer-addons';
import { APP_THEME_VARIANTS, dumpAppspec, parseAppspec } from '../apps/appspec';
import {
  NEEDS_ATTENTION,
  NOT_READY,
  PASSES,
  checkAppspec,
  componentNamed,
  isOrganizationFrame,
} from '../apps/checks';

const BASE = {
  schema: 'loop.app/v1',
  id: 'desk',
  name: 'Desk',
  kind: 'chat',
  agent: 'cog-crawler:0.0.1',
};

describe('the instant checks', () => {
  it('pass every application of the catalogue, and say what to set up', () => {
    const checks = Object.fromEntries(
      Object.entries(APP_SOURCES).map(([id, source]) => [
        id,
        checkAppspec(source),
      ]),
    );
    for (const [id, check] of Object.entries(checks)) {
      expect(check.problems, id).toEqual([]);
    }
    expect(checks['web-research'].verdict).toBe(PASSES);
    expect(checks['web-research'].setup).toEqual([]);
    expect(checks['inbox-triage'].setup).toEqual([
      'The agent “worker-mail-triage:0.0.1” is not enabled.',
      'The MCP server “google-workspace:0.0.1” is not enabled.',
    ]);
  });

  it('pass an application that only reads, and tell it its tests decide', () => {
    const check = checkAppspec({
      ...BASE,
      connections: [{ server: 'tavily:0.0.1' }],
    });
    expect(check).toEqual({
      verdict: PASSES,
      problems: [],
      attention: [],
      setup: [],
    });
  });

  it('say what the spec refuses', () => {
    const check = checkAppspec({ ...BASE, colour: 'red', kind: 'worker' });
    expect(check.verdict).toBe(NOT_READY);
    expect(check.problems).toEqual(
      expect.arrayContaining([
        '`colour` is not a field of the spec.',
        'A worker says its `goal`.',
        'A worker says what starts its work, under `triggers`.',
      ]),
    );
    expect(
      checkAppspec({ ...BASE, record: { suggest_tests: 'yes' } }).problems,
    ).toContain('record.suggest_tests: is true or false.');
    expect(
      checkAppspec({
        ...BASE,
        deployment: { hosted: { character_alone: 'yes' } },
      }).problems,
    ).toContain('deployment.hosted.character_alone: is true or false.');
    expect(checkAppspec({ ...BASE, team: 'jupyter' }).problems).toContain(
      'An application names who does the work: an `agent`, or a `team`, and not both.',
    );
    expect(checkAppspec({ ...BASE, id: 'Desk Top' }).problems[0]).toContain(
      'as an id',
    );
  });

  it('say every reference that does not resolve, by name', () => {
    const check = checkAppspec({
      ...BASE,
      agent: 'no-such-agent',
      context: ['nope'],
      model: 'nope',
      connections: [{ server: 'nowhere' }],
      checks: { guards: ['nope'], gates: ['low-confidence-review'] },
    });
    expect(check.problems).toEqual(
      expect.arrayContaining([
        'There is no agent or Cog named “no-such-agent”.',
        'There is no Frame named “nope”.',
        'There is no model named “nope”.',
        'There is no MCP server named “nowhere”.',
        'There is no Guard named “nope”.',
        'The Gate “low-confidence-review” reads the Guard “confidence-guard:0.0.1”, which the application does not run: add it under `checks.guards`.',
      ]),
    );
  });

  it('refuse a rule on a tool it cannot reach, and writing through unclassed tools', () => {
    const check = checkAppspec({
      ...BASE,
      connections: [
        { server: 'google-workspace', access: 'write', only: ['*gmail*'] },
        { server: 'github', access: 'write' },
      ],
      rules: [
        {
          action: 'Search the Drive',
          applies_to: ['google-workspace.search_drive_files'],
          behaviour: 'do_it',
        },
        {
          action: 'Search',
          applies_to: ['tavily.tavily_search'],
          behaviour: 'do_it',
        },
      ],
    });
    expect(check.problems).toEqual(
      expect.arrayContaining([
        'The rule “Search the Drive” names “google-workspace.search_drive_files”, which the connection to “google-workspace” leaves out (`only`).',
        'The rule “Search” names “tavily.tavily_search”, and the application is not connected to “tavily”.',
        'The application may write through “github”, whose tools nobody has classed: every one of them is left to the person until they are.',
      ]),
    );
  });

  it('need attention for what the application can do with no rule of its own', () => {
    const check = checkAppspec({
      ...BASE,
      connections: [{ server: 'slack:0.0.1', access: 'write' }],
    });
    expect(check.verdict).toBe(NEEDS_ATTENTION);
    expect(check.attention[0]).toMatch(/^It can send \(slack\./);
    expect(check.attention).toContain(
      "It writes through slack:0.0.1 with its builder's account, for everybody who uses it. Is that meant?",
    );
    const ruled = checkAppspec({
      ...BASE,
      connections: [{ server: 'slack:0.0.1', access: 'write', as: 'user' }],
      rules: [{ action: 'Post', applies_to: 'send', behaviour: 'ask_first' }],
    });
    expect(ruled.verdict).toBe(PASSES);
  });

  it('refuse a component no UI plugin renders (C-13)', () => {
    expect(componentNamed('ChoicePicker')?.standard).toBe(true);
    expect(componentNamed('Table')?.properties).toBeDefined();
    const check = checkAppspec({
      ...BASE,
      interface: {
        components: ['Text', 'Marquee'],
        surface: {
          components: [
            { id: 'root', component: 'Column', children: ['ticker'] },
            { id: 'ticker', component: 'Marquee' },
          ],
        },
      },
    });
    expect(check.verdict).toBe(NOT_READY);
    expect(check.problems).toEqual([
      'There is no component named “Marquee” in the catalog.',
      "The surface's “ticker” is a “Marquee”, which the catalog does not have.",
    ]);
  });

  it('refuse a form that asks no named field (C-16)', () => {
    const page = (form: Record<string, unknown>) =>
      checkAppspec({
        ...BASE,
        interface: {
          layout: 'page',
          surface: {
            components: [
              { id: 'root', component: 'Column', children: ['quote'] },
              { id: 'quote', component: 'Form', ...form },
            ],
          },
        },
      }).problems;
    const seats = {
      type: 'object',
      required: ['seats'],
      properties: { seats: { type: 'integer', minimum: 1 } },
    };
    expect(page({ schema: seats })).toEqual([]);
    expect(page({})).toEqual([
      'The form “quote” has no fields: its schema is the JSON Schema of what it asks.',
    ]);
    expect(page({ schema: { type: 'string' } })).toEqual([
      'The form “quote” asks for no named field: its schema is an object with properties.',
    ]);
    expect(
      page({ schema: { ...seats, required: ['seats', 'reason'] } }),
    ).toEqual(['The form “quote” requires “reason”, which it does not ask.']);
  });

  it('need attention for a Guard the runtime does not run (R-06)', () => {
    const check = checkAppspec({
      ...BASE,
      checks: {
        guards: ['sensitive-data-guard:0.0.1', 'consensus-guard:0.0.1'],
      },
    });
    expect(check.verdict).toBe(NEEDS_ATTENTION);
    expect(check.attention).toEqual([
      'The Consensus Guard is judged by a Cog the runtime does not run yet: nothing is checked by it.',
    ]);
  });

  it('count a rule on a versioned tool as a rule on that tool', () => {
    const slack = checkAppspec({
      ...BASE,
      connections: [{ server: 'slack:0.0.1', access: 'write', as: 'user' }],
    });
    const tools = (slack.attention[0].match(/slack\.[a-z_]+/g) ?? []).map(
      tool => tool.replace('slack.', 'slack:0.0.1.'),
    );
    expect(tools.length).toBeGreaterThan(0);
    const ruled = checkAppspec({
      ...BASE,
      connections: [{ server: 'slack:0.0.1', access: 'write', as: 'user' }],
      rules: [{ action: 'Post', applies_to: tools, behaviour: 'ask_first' }],
    });
    expect(ruled.attention.join(' ')).not.toMatch(/^It can send/);
  });

  it('refuse what the reader would otherwise replace with a default', () => {
    const check = checkAppspec({
      ...BASE,
      connections: [{ server: 'tavily:0.0.1', access: 'admin', as: 'me' }],
      rules: [{ action: 'Post', applies_to: 'send', behaviour: 'always' }],
      interface: { layout: 'grid', accent: 'blue' },
      tests: { ready_at: 2 },
      record: { include: ['everything'] },
      triggers: 'daily',
      deployment: { embedded: { origins: ['https://example.com/path'] } },
      permissions: { computer: { shell: 'yes' } },
      backend_tools: 'decide:0.0.1',
    });
    expect(check.verdict).toBe(NOT_READY);
    expect(check.problems).toEqual(
      expect.arrayContaining([
        'connections.0.access: is one of read, write.',
        'connections.0.as: is one of owner, user.',
        'rules.0.behaviour: is one of do_it, if_asked, ask_first, leave_to_me.',
        'interface.layout: is one of chat, page, split.',
        'tests.ready_at: is a share, from 0 to 1.',
        'record.include.0: is one of conversations, actions, decisions, approvals, checks, sources, outputs, feedback.',
        'triggers: is a list.',
        'deployment.embedded.origins.0: is an origin: https://example.com, without a path.',
        'permissions.computer.shell: is true or false.',
        'backend_tools: is a list of words.',
      ]),
    );
  });

  it('read an avatar and a banner chosen as a person chooses theirs, and refuse one misnamed', () => {
    const chosen = parseAppspec({
      ...BASE,
      avatar: 'AstronautIcon',
      banner: 'SvgTutorialsHero',
    }).app;
    expect([chosen.avatar, chosen.banner]).toEqual([
      'AstronautIcon',
      'SvgTutorialsHero',
    ]);
    const written = Object.keys(dumpAppspec(chosen));
    expect(written.slice(-2)).toEqual(['avatar', 'banner']);
    // Unchosen: nothing written, the emoji stands for it.
    expect(dumpAppspec(parseAppspec(BASE).app)).not.toHaveProperty('avatar');
    expect(
      checkAppspec({ ...BASE, avatar: 'an astronaut' }).problems,
    ).toContain('avatar: is named as its drawing is, `AstronautIcon`.');
  });

  it('read the assistant embed mode and any character a plugin may contribute, and refuse an id of the wrong shape (D-07, T-24)', () => {
    const assistant = parseAppspec({
      ...BASE,
      interface: { assistant: 'wizard' },
      deployment: { embedded: { mode: 'assistant' } },
    }).app;
    expect(assistant.interface.assistant).toBe('wizard');
    expect(assistant.deployment.embedded?.mode).toBe('assistant');
    const written = dumpAppspec(assistant);
    expect(written.interface).toEqual({ assistant: 'wizard' });
    expect(parseAppspec(written).app).toEqual(assistant);
    // Unchosen: nothing written, the paper clip.
    expect(parseAppspec(BASE).app.interface.assistant).toBeUndefined();
    // A plugin's own character is named as Datalayer's are; whether an
    // enabled plugin gives it is the page's to say, not the spec's.
    for (const id of ['owl', 'acme-owl-2']) {
      expect(
        checkAppspec({ ...BASE, interface: { assistant: id } }).problems,
      ).not.toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^interface\.assistant/),
        ]),
      );
      expect(
        parseAppspec({ ...BASE, interface: { assistant: id } }).app.interface
          .assistant,
      ).toBe(id);
    }
    for (const wrong of [
      'Clippy',
      'acme owl',
      'owl-',
      'acme.owl',
      'o'.repeat(65),
    ]) {
      expect(
        checkAppspec({ ...BASE, interface: { assistant: wrong } }).problems,
      ).toContain(
        'interface.assistant: names a character by the id a plugin contributes it under, lowercase words joined by a hyphen: `paperclip`, `acme-owl`.',
      );
    }
    expect(
      checkAppspec({
        ...BASE,
        deployment: { embedded: { mode: 'popup' } },
      }).problems,
    ).toContain(
      'deployment.embedded.mode: is one of inline, bubble, panel, assistant.',
    );
  });

  it('read how the balloon shows the conversation, and refuse any other word (T-23)', () => {
    for (const balloon of ['history', 'current'] as const) {
      const app = parseAppspec({ ...BASE, interface: { balloon } }).app;
      expect(app.interface.balloon).toBe(balloon);
      expect(dumpAppspec(app).interface).toEqual({ balloon });
      expect(parseAppspec(dumpAppspec(app)).app).toEqual(app);
      expect(
        checkAppspec({ ...BASE, interface: { balloon } }).problems,
      ).toEqual([]);
    }
    expect(parseAppspec(BASE).app.interface.balloon).toBeUndefined();
    expect(
      checkAppspec({ ...BASE, interface: { balloon: 'latest' } }).problems,
    ).toContain('interface.balloon: is one of history, current.');
  });

  it('reads the theme it runs in, and refuses one Appearance does not have (T-30)', () => {
    expect(APP_THEME_VARIANTS).toEqual(themeVariants);
    for (const theme of [
      { variant: 'earth' },
      { variant: 'matrix', mode: 'dark' },
      { variant: 'loop', mode: 'auto' },
    ] as const) {
      const app = parseAppspec({ ...BASE, interface: { theme } }).app;
      expect(app.interface.theme).toEqual(theme);
      expect(dumpAppspec(app).interface).toEqual({ theme });
      expect(parseAppspec(dumpAppspec(app)).app).toEqual(app);
      expect(checkAppspec({ ...BASE, interface: { theme } }).problems).toEqual(
        [],
      );
    }
    expect(parseAppspec(BASE).app.interface.theme).toBeUndefined();
    const said = (theme: unknown) =>
      checkAppspec({ ...BASE, interface: { theme } }).problems;
    expect(said({ variant: 'neon' })).toContain(
      'interface.theme.variant: is one of datalayer, spatial, lovely, matrix, earth, sand, ivory, sun, loop.',
    );
    expect(said({ variant: 'sun', mode: 'night' })).toContain(
      'interface.theme.mode: is one of light, dark, auto.',
    );
    expect(said({ mode: 'dark' })).toContain(
      'interface.theme.variant: is missing.',
    );
    expect(said({ variant: 'sun', accent: 'sky' })).toContain(
      'interface.theme.accent: is not a key of a theme: variant, mode.',
    );
    expect(said('earth')).toContain('interface.theme: is a mapping.');
  });

  it('checks a context of an organization’s own against the organization’s (LOOP U-32)', () => {
    const own = { ...BASE, context: ['org-house-style'] };
    expect(
      checkAppspec(own, {
        pluginsOff: [],
        organizationFrames: ['board-reporting', 'org-house-style'],
      }).problems,
    ).toEqual([]);
    expect(
      checkAppspec(own, { pluginsOff: [], organizationFrames: [] }).problems,
    ).toEqual(['Its organization has no context named “org-house-style”.']);
    expect(checkAppspec(own).problems).toEqual([
      '“org-house-style” is a context of an organization’s own: it is checked with the organization the application belongs to, which was not said.',
    ]);
    expect(isOrganizationFrame('org-house-style:0.0.1')).toBe(true);
    expect(isOrganizationFrame('board-reporting')).toBe(false);
  });
});
