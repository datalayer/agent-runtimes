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
  dumpAppspec,
  emptyAppspec,
  parseAppspec,
  retentionDays,
} from '../apps/appspec';

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
});
