/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Appspec as a YAML file a person also edits: what the Canvas writes back
 * keeps what the person wrote — the comments, the order, the quoting — and
 * changes only what changed.
 */

import { describe, expect, it } from 'vitest';
import { APP_CATALOGUE, APP_SOURCES } from '../../specs/apps';
import type { AppSpec } from '../../types/agentspecs';
import { dumpAppspec, parseAppspec } from '../apps/appspec';
import { readAppspecYaml, writeAppspecYaml } from '../apps/yaml';

const FILE = `# The support desk of the Cloud product.
schema: loop.app/v1
id: support-desk
name: Support Desk # shown in the header
kind: chat
emoji: "🛟"

# Who does the work.
agent: cog-crawler:0.0.1

connections:
  # Read only: it answers, it does not file.
  - server: tavily:0.0.1
  - server: google-workspace:0.0.1
    access: write
    only: ["*gmail*"] # mail, nothing else

rules:
  # Never without me.
  - action: Send a message
    applies_to: send
    behaviour: ask_first

interface:
  accent: sky
  starters:
    - label: Reset my password
      message: >-
        How do I reset my password? I have lost the device I used to sign in
        with, and the recovery address is one I no longer read.
`;

const edit = (change: (app: AppSpec) => void): string => {
  const { app, problems } = readAppspecYaml(FILE);
  expect(problems).toEqual([]);
  change(app);
  return writeAppspecYaml(app, FILE);
};

describe('reading a YAML file', () => {
  it('reads the application it holds', () => {
    const { app, problems } = readAppspecYaml(FILE);
    expect(problems).toEqual([]);
    expect(app.name).toBe('Support Desk');
    expect(app.emoji).toBe('🛟');
    expect(app.connections[1]).toEqual({
      server: 'google-workspace:0.0.1',
      access: 'write',
      as: 'owner',
      only: ['*gmail*'],
    });
    expect(app.interface.starters[0].message).toBe(
      'How do I reset my password? I have lost the device I used to sign in with, and the recovery address is one I no longer read.',
    );
  });

  it('says where YAML itself is wrong, with the line', () => {
    const { problems, app } = readAppspecYaml('id: a\nkind: [chat\nname: A\n');
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatch(/^Line \d+: /);
    // Whole all the same: an editor opens it.
    expect(app.kind).toBe('chat');
  });

  it('reads every application of the catalogue from the file it would write', () => {
    for (const [id, source] of Object.entries(APP_SOURCES)) {
      const text = writeAppspecYaml(APP_CATALOGUE[id]);
      const { app, problems } = readAppspecYaml(text);
      expect(problems, id).toEqual([]);
      expect(dumpAppspec(app), id).toEqual(source);
    }
  });
});

describe('writing into a file that exists', () => {
  it('gives the file back untouched when nothing changed', () => {
    expect(edit(() => undefined)).toBe(FILE);
  });

  it('changes one field and keeps every comment', () => {
    const written = edit(app => {
      app.name = 'Help Desk';
    });
    expect(written).toBe(
      FILE.replace('name: Support Desk ', 'name: Help Desk '),
    );
    for (const comment of [
      '# The support desk of the Cloud product.',
      '# shown in the header',
      '# Who does the work.',
      '# Read only: it answers, it does not file.',
      '# mail, nothing else',
      '# Never without me.',
    ]) {
      expect(written, comment).toContain(comment);
    }
  });

  it('keeps the order the person chose, and the way they quoted', () => {
    const written = edit(app => {
      app.interface.accent = 'rose';
    });
    // `emoji` stays where it was written, before the agent, though the spec puts it last.
    expect(written.indexOf('emoji:')).toBeLessThan(written.indexOf('agent:'));
    expect(written).toContain('emoji: "🛟"');
    expect(written).toContain('only: ["*gmail*"]');
    expect(written).toContain('accent: rose');
    expect(written).toContain(
      'message: >-\n        How do I reset my password? I have lost the device I used to sign in\n        with, and the recovery address is one I no longer read.',
    );
  });

  it('keeps a comment with its item when the list grows or is reordered', () => {
    const written = edit(app => {
      app.connections = [
        { server: 'slack:0.0.1', access: 'read', as: 'owner', only: [] },
        app.connections[1],
        app.connections[0],
      ];
    });
    const { app } = readAppspecYaml(written);
    expect(app.connections.map(connection => connection.server)).toEqual([
      'slack:0.0.1',
      'google-workspace:0.0.1',
      'tavily:0.0.1',
    ]);
    // The comment written on the mail connection is still on it.
    expect(written).toContain('only: ["*gmail*"] # mail, nothing else');
    expect(written.indexOf('server: slack')).toBeLessThan(
      written.indexOf('server: google-workspace'),
    );
  });

  it('puts a field that is new where the spec puts it', () => {
    const written = edit(app => {
      app.description = 'Answers questions about the Cloud product.';
      app.goal = '';
      app.tests.cases = [{ ask: 'Hello?', expect: 'It greets.' }];
    });
    const keys = written
      .split('\n')
      .filter(line => /^[a-z_]+:/.test(line))
      .map(line => line.split(':')[0]);
    // After `kind`, where the spec declares it — not at the end of the file.
    expect(keys.indexOf('description')).toBe(keys.indexOf('kind') + 1);
    expect(keys.indexOf('tests')).toBeGreaterThan(keys.indexOf('interface'));
    expect(readAppspecYaml(written).app.tests.cases).toHaveLength(1);
  });

  it('removes what is no longer said, and only that', () => {
    const written = edit(app => {
      app.rules = [];
    });
    expect(written).not.toContain('rules:');
    expect(written).not.toContain('Send a message');
    expect(written).toContain('# Read only: it answers, it does not file.');
    expect(readAppspecYaml(written).app.rules).toEqual([]);
  });

  it('always reads back as the application that was written', () => {
    const changes: Array<(app: AppSpec) => void> = [
      app => {
        app.kind = 'worker';
        app.goal = 'Keep the desk tidy.';
        app.triggers = [
          {
            type: 'schedule',
            cron: '0 8 * * *',
            event: '',
            at: '',
            description: '',
            prompt: '',
          },
        ];
      },
      app => {
        app.rules.push({
          action: 'Delete',
          appliesTo: ['delete'],
          behaviour: 'leave_to_me',
        });
        app.rules.reverse();
      },
      app => {
        app.connections = [];
        app.permissions.computer.browse = true;
      },
      app => {
        app.interface.starters = [];
        app.interface.settings = [
          {
            id: 'product',
            type: 'select',
            label: 'Product',
            options: ['Cloud', 'Desktop'],
          },
        ];
      },
    ];
    for (const change of changes) {
      const { app } = readAppspecYaml(FILE);
      change(app);
      const written = writeAppspecYaml(app, FILE);
      expect(dumpAppspec(readAppspecYaml(written).app)).toEqual(
        dumpAppspec(app),
      );
    }
  });
});

describe('what the first save settles', () => {
  it('puts one space before a comment and folds long text, once', () => {
    const loose = FILE.replace(
      'name: Support Desk # shown',
      'name: Support Desk      # shown',
    ).replace(
      'I have lost the device I used to sign in\n        with, and',
      'I have lost the device\n        I used to sign in with, and',
    );
    expect(loose).not.toBe(FILE);
    const { app } = readAppspecYaml(loose);
    const once = writeAppspecYaml(app, loose);
    expect(once).toBe(FILE);
    expect(writeAppspecYaml(readAppspecYaml(once).app, once)).toBe(once);
  });
});

describe('writing a file afresh', () => {
  it('writes the canonical document: the spec’s keys in the spec’s order', () => {
    const text = writeAppspecYaml(APP_CATALOGUE['web-research']);
    expect(text.startsWith('schema: loop.app/v1\nid: web-research\n')).toBe(
      true,
    );
    expect(text.indexOf('\nkind:')).toBeLessThan(text.indexOf('\nagent:'));
    expect(text.indexOf('\nconnections:')).toBeLessThan(
      text.indexOf('\ninterface:'),
    );
  });

  it('writes afresh when what was there cannot be read', () => {
    const app = parseAppspec({ id: 'a', name: 'A', kind: 'chat' }).app;
    const fresh = writeAppspecYaml(app);
    expect(writeAppspecYaml(app, 'kind: [chat\n')).toBe(fresh);
    expect(writeAppspecYaml(app, '')).toBe(fresh);
    expect(writeAppspecYaml(app, '- a list\n- not a mapping\n')).toBe(fresh);
  });
});
