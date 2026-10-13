/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Appspec as a file, and as the application an editor holds.
 *
 * Three editors work on one file, so reading what was written has to give the
 * application back, and writing what was read has to give the document back.
 * `APP_SOURCES` is each application of the catalogue as agentspecs writes it:
 * what this has to read, and what it has to write.
 */

import { describe, expect, it } from 'vitest';
import { APP_CATALOGUE, APP_SOURCES } from '../../specs/apps';
import type { AppSpec } from '../../types/agentspecs';
import {
  APPSPEC_KEY_ORDER,
  APP_SCHEMA,
  DEFAULT_EMOJI,
  PAP_PROFILES,
  dumpAppspec,
  emptyAppspec,
  parseAppspec,
  retentionDays,
} from '../apps/appspec';
import { documentShapeProblems } from '../apps/checks';

/** An application without what the catalogue adds to it. */
const spec = (app: AppSpec): Omit<AppSpec, 'setup'> => {
  const { setup: _setup, ...rest } = app;
  return rest;
};

const ids = Object.keys(APP_SOURCES);

describe('reading an Appspec', () => {
  it('reads every application of the catalogue as agentspecs does', () => {
    expect(ids.sort()).toEqual(Object.keys(APP_CATALOGUE).sort());
    for (const id of ids) {
      const { app, problems } = parseAppspec(APP_SOURCES[id]);
      expect(problems, id).toEqual([]);
      expect(spec(app), id).toEqual(spec(APP_CATALOGUE[id]));
    }
  });

  it('reads the actions its code declares, typed (REACTOR_UI RU-5)', () => {
    const { app } = parseAppspec(APP_SOURCES['customer-interview']);
    const [save, finish] = app.interface.actions ?? [];
    expect(save.name).toBe('save');
    expect(save.payload?.required).toEqual(['insight', 'quote']);
    expect(finish).toEqual({
      name: 'finish',
      description: 'End the interview, and record its result.',
    });
    expect(dumpAppspec(app).interface).toMatchObject({
      actions: [{ name: 'save', payload: save.payload }, { name: 'finish' }],
    });
    // An application without code declares none, and none is written.
    const plain = parseAppspec({ id: 'a', name: 'A', kind: 'chat' }).app;
    expect(plain.interface.actions).toEqual([]);
    expect(dumpAppspec(plain).interface ?? {}).not.toHaveProperty('actions');
  });

  it('gives a kind its layout, and a retention its days', () => {
    const { app } = parseAppspec({ id: 'w', name: 'W', kind: 'worker' });
    expect(app.interface.layout).toBe('split');
    expect(parseAppspec({ kind: 'widget' }).app.interface.layout).toBe('page');
    expect(app.record.retentionDays).toBe(365);
    expect(retentionDays('90_days')).toBe(90);
    expect(retentionDays('18_months')).toBe(540);
    expect(retentionDays('forever')).toBe(0);
  });

  it('gives an application its face, and nothing it was not granted', () => {
    const { app } = parseAppspec({ id: 'a', name: 'A', kind: 'chat' });
    expect(app.emoji).toBe(DEFAULT_EMOJI);
    expect(app.permissions).toEqual({
      spaces: [],
      computer: { browse: false, files: false, shell: false },
    });
    expect(app.connections).toEqual([]);
  });

  it('opens a draft whole, and says what is wrong with it', () => {
    const { app, problems } = parseAppspec({
      schema: 'loop.app/v9',
      kind: 'robot',
      colour: 'red',
      record: { keep_for: 'forever' },
      rules: 'none',
      connections: [{ server: 'tavily', access: 'everything', as: 'me' }],
    });
    expect(problems).toEqual([
      '`colour` is not a field of the spec.',
      'This reads loop.app/v1; the application is written in loop.app/v9.',
      '`robot` is not a kind: chat, widget, decision or worker.',
      'Cannot read the retention `forever`: write 90_days, 18_months or 1_years.',
    ]);
    // Whole, so that an editor can open it: what could not be read took its default.
    expect(app.kind).toBe('chat');
    expect(app.rules).toEqual([]);
    expect(app.connections).toEqual([
      { server: 'tavily', access: 'read', as: 'owner', only: [] },
    ]);
    expect(parseAppspec('not an application').problems).toEqual([
      'The document is not an application.',
    ]);
    expect(parseAppspec({ id: 'a' }).problems).toEqual([
      'The application does not say its `kind`.',
    ]);
  });

  it('reads a rule on one class written alone, or on several things', () => {
    const { app } = parseAppspec({
      kind: 'chat',
      rules: [
        { action: 'Send', applies_to: 'send', behaviour: 'ask_first' },
        {
          action: 'Label',
          applies_to: ['s.label', 's.archive'],
          behaviour: 'do_it',
        },
      ],
    });
    expect(app.rules.map(rule => rule.appliesTo)).toEqual([
      ['send'],
      ['s.label', 's.archive'],
    ]);
  });
});

describe('writing an Appspec', () => {
  it('writes back the document it read, for every application of the catalogue', () => {
    for (const id of ids) {
      expect(dumpAppspec(parseAppspec(APP_SOURCES[id]).app), id).toEqual(
        APP_SOURCES[id],
      );
    }
  });

  it('reads back the application it wrote', () => {
    for (const id of ids) {
      const app = APP_CATALOGUE[id];
      expect(spec(parseAppspec(dumpAppspec(app)).app), id).toEqual(spec(app));
    }
  });

  it('writes its keys in one order, whatever order they were read in', () => {
    for (const id of ids) {
      const source = APP_SOURCES[id];
      const shuffled = Object.fromEntries(Object.entries(source).reverse());
      const written = Object.keys(dumpAppspec(parseAppspec(shuffled).app));
      expect(written, id).toEqual(
        APPSPEC_KEY_ORDER.filter(key => written.includes(key)),
      );
      expect(JSON.stringify(dumpAppspec(parseAppspec(shuffled).app))).toBe(
        JSON.stringify(dumpAppspec(parseAppspec(source).app)),
      );
      // And it is the document agentspecs writes, key for key and in its order.
      expect(JSON.stringify(dumpAppspec(parseAppspec(source).app))).toBe(
        JSON.stringify(source),
      );
      expect(written[0]).toBe('schema');
    }
  });

  it('writes the keys the spec does not declare in one order too', () => {
    const tree = [
      { id: 'root', component: 'Column', children: ['go'] },
      {
        id: 'go',
        component: 'Button',
        variant: 'primary',
        action: { event: { name: 'run', context: { b: 1, a: 2 } } },
      },
    ];
    const reversedTree = [
      { children: ['go'], component: 'Column', id: 'root' },
      {
        action: { event: { context: { a: 2, b: 1 }, name: 'run' } },
        variant: 'primary',
        component: 'Button',
        id: 'go',
      },
    ];
    const document = (components: unknown, weights: unknown) => ({
      kind: 'decision',
      id: 'd',
      name: 'D',
      decision: { question: 'Which?', scenarios: [{ name: 'S', weights }] },
      interface: { surface: { components } },
    });
    const one = dumpAppspec(
      parseAppspec(document(tree, { Cost: 1, Accuracy: 2 })).app,
    );
    const other = dumpAppspec(
      parseAppspec(document(reversedTree, { Accuracy: 2, Cost: 1 })).app,
    );
    expect(JSON.stringify(one)).toBe(JSON.stringify(other));
    const written = one as {
      decision: { scenarios: Array<{ weights: object }> };
      interface: { surface: { components: Array<Record<string, unknown>> } };
    };
    expect(Object.keys(written.decision.scenarios[0].weights)).toEqual([
      'Accuracy',
      'Cost',
    ]);
    expect(Object.keys(written.interface.surface.components[1])).toEqual([
      'id',
      'component',
      'action',
      'variant',
    ]);
  });

  it('writes nothing that is at its default', () => {
    expect(dumpAppspec(emptyAppspec('chat'))).toEqual({
      schema: APP_SCHEMA,
      id: '',
      name: '',
      kind: 'chat',
    });
    const worker = emptyAppspec('worker');
    // A worker's split layout is its kind's own: not written. A chat's would be.
    expect(dumpAppspec(worker).interface).toBeUndefined();
    expect(
      dumpAppspec({
        ...worker,
        interface: { ...worker.interface, layout: 'chat' },
      }).interface,
    ).toEqual({ layout: 'chat' });
  });

  it('writes why it is not offered only when it says so (E-01)', () => {
    const off = APP_CATALOGUE['inbox-triage'];
    expect(off.enabled).toBe(false);
    expect(off.unavailable_because).toMatch(/\.$/);
    const written = dumpAppspec(off);
    expect(written.enabled).toBe(false);
    expect(written.unavailable_because).toBe(off.unavailable_because);
    expect(parseAppspec(written).app.unavailable_because).toBe(
      off.unavailable_because,
    );
    const on = APP_CATALOGUE['quote-calculator'];
    expect(on.enabled).toBe(true);
    expect(dumpAppspec(on)).not.toHaveProperty('unavailable_because');
  });

  it('reads and writes a test that is a conversation, and refuses one that does not hold (E-01)', () => {
    const interview = APP_CATALOGUE['customer-interview'];
    const [declined, , , finished] = interview.tests.cases;
    expect(declined.ask).toBe('');
    expect(declined.turns).toEqual([
      { choose: 'No' },
      { say: 'Ask me why I stopped after the trial.' },
    ]);
    expect(finished.turns?.map(turn => turn.press ?? '')).toEqual([
      '',
      '',
      '',
      'save',
      'finish',
    ]);
    const written = dumpAppspec(interview) as {
      tests: { cases: Array<Record<string, unknown>> };
    };
    expect(written.tests.cases[0]).not.toHaveProperty('ask');
    expect(written.tests.cases[3].turns).toEqual(finished.turns);
    expect(parseAppspec(written).app.tests.cases).toEqual(
      interview.tests.cases,
    );
    expect(documentShapeProblems(written)).toEqual([]);
    const shaped = (cases: unknown[]) =>
      documentShapeProblems({ ...written, tests: { cases } });
    expect(shaped([{ expect: 'x' }])).toEqual([
      'tests.cases.0: asks one message (ask) or has a conversation (turns).',
    ]);
    expect(
      shaped([{ turns: [{ say: 'Hi', press: 'save' }], expect: 'x' }]),
    ).toEqual(['tests.cases.0.turns.0: says, chooses or presses one thing.']);
    expect(
      shaped([{ turns: [{ say: 'Hi', payload: { a: 1 } }], expect: 'x' }]),
    ).toEqual(['tests.cases.0.turns.0.payload: goes with an action pressed.']);
  });

  it('writes the files a test gives, and none for a test in words alone (E-01)', () => {
    const report = APP_CATALOGUE['report-from-a-file'];
    const [orders, , pdf] = report.tests.cases;
    expect(orders.files?.map(file => file.name)).toEqual(['orders.csv']);
    expect(pdf.files).toBeUndefined();
    const written = dumpAppspec(report) as {
      tests: { cases: Array<Record<string, unknown>> };
    };
    expect(written.tests.cases[0].files).toEqual([
      { name: 'orders.csv', text: orders.files?.[0].text },
    ]);
    expect(written.tests.cases[2]).not.toHaveProperty('files');
    expect(parseAppspec(written).app.tests.cases).toEqual(report.tests.cases);
  });

  it('writes that its conversations may suggest tests only when they may (V-16)', () => {
    const chat = emptyAppspec('chat');
    expect(chat.record.suggestTests).toBe(false);
    expect(parseAppspec({ kind: 'chat' }).app.record.suggestTests).toBe(false);
    const allowed = {
      ...chat,
      record: { ...chat.record, suggestTests: true },
    };
    expect(dumpAppspec(allowed).record).toEqual({ suggest_tests: true });
    expect(parseAppspec(dumpAppspec(allowed)).app.record.suggestTests).toBe(
      true,
    );
    // Only `true` says yes: anything else is no.
    expect(
      parseAppspec({ kind: 'chat', record: { suggest_tests: 'yes' } }).app
        .record.suggestTests,
    ).toBe(false);
  });

  it('writes a deployment that is there, even with nothing to say of it', () => {
    const app = {
      ...emptyAppspec('chat'),
      deployment: { hosted: { visibility: 'private' as const, slug: '' } },
    };
    expect(dumpAppspec(app).deployment).toEqual({ hosted: {} });
    expect(parseAppspec(dumpAppspec(app)).app.deployment).toEqual(
      app.deployment,
    );
  });

  it('shows only its character at its address when said, off unless said (T-21)', () => {
    const alone = parseAppspec({
      kind: 'chat',
      deployment: { hosted: { slug: 'desk', character_alone: true } },
    }).app;
    expect(alone.deployment.hosted).toEqual({
      visibility: 'private',
      slug: 'desk',
      characterAlone: true,
    });
    expect(dumpAppspec(alone).deployment).toEqual({
      hosted: { slug: 'desk', character_alone: true },
    });
    expect(
      parseAppspec({
        kind: 'chat',
        deployment: { hosted: { slug: 'desk', character_alone: 'yes' } },
      }).app.deployment.hosted?.characterAlone,
    ).toBeUndefined();
  });

  it('leaves out what is not the spec', () => {
    const app = {
      ...emptyAppspec('chat'),
      setup: ['The agent is not enabled.'],
    };
    expect(dumpAppspec(app)).not.toHaveProperty('setup');
    expect(dumpAppspec(app).record).toBeUndefined();
  });
  it('reads and writes the protocols it speaks, refusing what agentspecs refuses (AGENT_PROTOCOLS PS-02)', () => {
    const { app, problems } = parseAppspec({
      kind: 'chat',
      protocols: ['mcp', 'a2a'],
    });
    expect(problems).toEqual([]);
    expect(app.protocols).toEqual(['mcp', 'a2a']);
    expect(dumpAppspec(app).protocols).toEqual(['mcp', 'a2a']);
    expect(dumpAppspec(emptyAppspec('chat'))).not.toHaveProperty('protocols');
    const said = (document: Record<string, unknown>) =>
      parseAppspec({ kind: 'chat', ...document }).problems;
    expect(said({ protocols: ['smtp'] })[0]).toMatch(
      /no protocol named 'smtp'/,
    );
    expect(said({ protocols: ['mcp', 'mcp'] })).toEqual([
      "It lists the protocol 'mcp' twice.",
    ]);
    expect(said({ protocols: ['tap'] })[0]).toMatch(/planned, not shipped/);
    expect(
      said({
        protocols: ['tap'],
        enabled: false,
        unavailable_because: 'Later.',
      }),
    ).toEqual([]);
    expect(
      said({
        pap: {
          profile: 'draft-01',
          connections: [{ id: 'o', company: 'manzanita.example' }],
        },
      }),
    ).toEqual([
      "Its `pap` block configures Personal Agent Protocol, which it does not list: add 'pap' to `protocols`.",
    ]);
    expect(said({ a2a: { extensions: [{ uri: 'urn:x' }] } })[0]).toMatch(
      /add 'a2a' to `protocols`/,
    );
  });
  it('reads and writes the UI its answers render in (AGENT_PROTOCOLS PS-04)', () => {
    const { app, problems } = parseAppspec({ kind: 'chat', ui: ['a2ui'] });
    expect(problems).toEqual([]);
    expect(dumpAppspec(app).ui).toEqual(['a2ui']);
    expect(dumpAppspec(emptyAppspec('chat'))).not.toHaveProperty('ui');
    const said = (document: Record<string, unknown>) =>
      parseAppspec({ kind: 'chat', ...document }).problems;
    expect(said({ ui: ['nope'] })[0]).toMatch(/no UI named 'nope'/);
    expect(said({ ui: ['a2ui', 'a2ui'] })).toEqual([
      "It lists the UI 'a2ui' twice.",
    ]);
    expect(said({ ui: ['mcp-ui'] })[0]).toMatch(/is not enabled/);
    expect(
      said({ ui: ['mcp-ui'], enabled: false, unavailable_because: 'Later.' }),
    ).toEqual([]);
  });
  it('reads and writes the personal agents a company accepts (PAP_DATALAYER U-04)', () => {
    const agent = 'https://agents.example/agent.json';
    const company = {
      enabled: true,
      scopes: ['poppy:read'],
      interfaces: ['agent', 'mcp'],
      personal_agents: 'registered',
      registered_agents: [agent],
    };
    const { app, problems } = parseAppspec({
      kind: 'chat',
      protocols: ['pap'],
      pap: { profile: 'draft-01', company },
    });
    expect(problems).toEqual([]);
    expect(app.pap?.company.registeredAgents).toEqual([agent]);
    expect(app.pap?.company.interfaces).toEqual(['agent', 'mcp']);
    expect(dumpAppspec(app).pap).toEqual({ profile: 'draft-01', company });
  });
  it('reads and writes Personal Agent Protocol (PAP_DATALAYER S-01)', () => {
    const { app, problems } = parseAppspec({
      kind: 'chat',
      protocols: ['pap'],
      pap: {
        profile: 'draft-01',
        connections: [
          {
            id: 'orders',
            company: 'manzanita.example',
            access: 'write',
            scopes: ['orders:read'],
          },
        ],
        company: { enabled: true, scopes: ['poppy:read'] },
      },
    });
    expect(problems).toEqual([]);
    expect(app.pap).toEqual({
      profile: 'draft-01',
      connections: [
        {
          id: 'orders',
          company: 'manzanita.example',
          access: 'write',
          as: 'user',
          scopes: ['orders:read'],
          interfaces: ['agent'],
          signIn: ['direct', 'device'],
          extensions: [],
        },
      ],
      company: {
        enabled: true,
        signedOut: true,
        interfaces: ['agent'],
        scopes: ['poppy:read'],
        extensions: [],
        personalAgents: 'any',
        registeredAgents: [],
        operations: [],
      },
    });
    // Nothing at its default is written; the profile always is.
    expect(dumpAppspec(app).pap).toEqual({
      profile: 'draft-01',
      connections: [
        {
          id: 'orders',
          company: 'manzanita.example',
          access: 'write',
          scopes: ['orders:read'],
        },
      ],
      company: { enabled: true, scopes: ['poppy:read'] },
    });
    // Without it, the application has none.
    expect(parseAppspec({ kind: 'chat' }).app.pap).toBeUndefined();
    expect(dumpAppspec(emptyAppspec('chat'))).not.toHaveProperty('pap');
  });
  it('refuses a Personal Agent Protocol profile it does not speak, in a sentence (PAP_DATALAYER S-03)', () => {
    const connections = [{ id: 'orders', company: 'manzanita.example' }];
    const read = (pap: Record<string, unknown>) =>
      parseAppspec({ kind: 'chat', protocols: ['pap'], pap });
    expect(PAP_PROFILES).toEqual(['draft-01']);
    expect(read({ profile: 'draft-01', connections }).problems).toEqual([]);
    const unknown = read({ profile: 'draft-02', connections });
    expect(unknown.problems).toEqual([
      'This application asks for Personal Agent Protocol profile “draft-02”; Datalayer speaks draft-01.',
    ]);
    expect(unknown.app.pap).toBeUndefined();
    expect(read({ connections }).problems).toEqual([
      'Its `pap` block names no Personal Agent Protocol profile: add `profile: draft-01`.',
    ]);
    // A block saying nothing is no block.
    expect(read({}).problems).toEqual([]);
    expect(read({}).app.pap).toBeUndefined();
  });
  it('reads and writes PACT businesses and A2A card extensions (AGENT_PROTOCOLS PI-01, PR-02)', () => {
    const document = {
      kind: 'chat',
      protocols: ['pact', 'a2a'],
      pact: {
        connections: [
          {
            id: 'air',
            brand: 'air.example',
            audience: 'https://provider.example/a2a',
            scopes: ['bookings:read'],
          },
        ],
      },
      a2a: {
        extensions: [
          {
            uri: 'https://shop.example/extensions/gift-wrap/v1',
            description: 'Wraps an order as a gift.',
            params: { papers: ['red', 'gold'] },
          },
          { uri: 'urn:example:loyalty', required: true },
        ],
      },
    };
    const { app, problems } = parseAppspec(document);
    expect(problems).toEqual([]);
    expect(app.pact?.connections[0]).toEqual({
      ...document.pact.connections[0],
      access: 'read',
    });
    // No business said: none (AGENT_PROTOCOLS PR-13).
    expect(app.pact?.business?.enabled).toBe(false);
    expect(app.a2a?.extensions).toEqual([
      { ...document.a2a.extensions[0], required: false },
      {
        uri: 'urn:example:loyalty',
        description: '',
        required: true,
        params: {},
      },
    ]);
    // Written back as read: nothing at its default.
    const written = dumpAppspec(app);
    expect(written.pact).toEqual(document.pact);
    expect(written.a2a).toEqual(document.a2a);
    // Without them, the application has none.
    expect(parseAppspec({ kind: 'chat' }).app.a2a).toBeUndefined();
    expect(dumpAppspec(emptyAppspec('chat'))).not.toHaveProperty('a2a');
    expect(dumpAppspec(emptyAppspec('chat'))).not.toHaveProperty('pact');
  });
  it('reads and writes the application as a PACT business (AGENT_PROTOCOLS PR-13, PI-32)', () => {
    const document = {
      kind: 'chat',
      protocols: ['pact'],
      pact: {
        business: {
          enabled: true,
          brand: 'Example Air',
          scopes: {
            'bookings:read': 'See your bookings',
            'bookings:change': 'Change a booking',
          },
          registered_agents: [
            {
              issuer: 'https://agent.example/pact',
              jwks_uri: 'https://agent.example/pact/jwks.json',
            },
          ],
        },
      },
    };
    const { app, problems } = parseAppspec(document);
    expect(problems).toEqual([]);
    expect(app.pact?.connections).toEqual([]);
    expect(app.pact?.business).toEqual({
      enabled: true,
      brand: 'Example Air',
      scopes: document.pact.business.scopes,
      registeredAgents: [
        {
          issuer: 'https://agent.example/pact',
          jwksUri: 'https://agent.example/pact/jwks.json',
        },
      ],
    });
    // Written back as read: nothing at its default.
    expect(dumpAppspec(app).pact).toEqual(document.pact);
    // A business configures PACT: refused unless `pact` is listed.
    expect(
      parseAppspec({ ...document, protocols: [] }).problems.join(' '),
    ).toMatch(/`pact` block configures/);
    // An application without the block is no business.
    expect(parseAppspec({ kind: 'chat' }).app.pact).toBeUndefined();
  });
  it('reads and writes the merchants it shops at, each listed protocol (AGENT_PROTOCOLS PI-01)', () => {
    const document = {
      kind: 'chat',
      protocols: ['ucp', 'acp'],
      commerce: {
        merchants: [
          {
            id: 'store',
            protocol: 'ucp',
            merchant: 'store.example',
            access: 'write',
            limit: { amount: '50', currency: 'USD' },
          },
          { id: 'outfitters', protocol: 'acp', merchant: 'outfitters.example' },
        ],
      },
    };
    const { app, problems } = parseAppspec(document);
    expect(problems).toEqual([]);
    expect(app.commerce?.merchants[1]).toEqual({
      ...document.commerce.merchants[1],
      access: 'read',
    });
    // Written back as read: nothing at its default.
    expect(dumpAppspec(app).commerce).toEqual(document.commerce);
    expect(dumpAppspec(emptyAppspec('chat'))).not.toHaveProperty('commerce');
    // A merchant over a protocol it does not list is refused.
    expect(parseAppspec({ ...document, protocols: ['ucp'] }).problems).toEqual([
      "Its `commerce` block shops over ACP, which it does not list: add 'acp' to `protocols`.",
    ]);
  });
  it('reads and writes what a company does once the person confirms (PAP_DATALAYER B-04)', () => {
    const operations = [
      {
        action: 'orders.exchange',
        tool: 'exchange_order',
        summary: 'Exchange order {order_id} for size {size}',
      },
      {
        action: 'orders.cancel',
        tool: 'cancel_order',
        summary: 'Cancel order {order_id}',
        user_approval_required: false,
      },
    ];
    const source = {
      kind: 'chat',
      protocols: ['pap'],
      pap: {
        profile: 'draft-01',
        company: { enabled: true, extensions: ['operations'], operations },
      },
    };
    const { app, problems } = parseAppspec(source);
    expect(problems).toEqual([]);
    expect(app.pap?.company.operations).toEqual([
      {
        action: 'orders.exchange',
        tool: 'exchange_order',
        summary: 'Exchange order {order_id} for size {size}',
        userApprovalRequired: true,
      },
      {
        action: 'orders.cancel',
        tool: 'cancel_order',
        summary: 'Cancel order {order_id}',
        userApprovalRequired: false,
      },
    ]);
    // Only the person confirming is the default, and is not written.
    expect(dumpAppspec(app).pap).toEqual(source.pap);
    expect(parseAppspec(dumpAppspec(app)).app.pap).toEqual(app.pap);
  });
});
