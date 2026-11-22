/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The designer's introspection: any part of a
 * spec, found in its generated JSON Schema, read, and written back through
 * the spec's own converters — so the property grid can draw any part, and
 * the spec stays the one source of truth the editors share.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { APPSPEC_SCHEMA } from '../../specs/appspecSchema';
import { SCENE_SCHEMA } from '../../specs/sceneSchema';
import { dumpAppspec, emptyAppspec, parseAppspec } from '../apps/appspec';
import {
  picked,
  pickedValue,
  schemaAt,
  standalone,
  valueAt,
  withPickedAt,
  withValueAt,
} from '../composer/schemaAt';

describe('a part’s schema, found where the spec puts it', () => {
  it('follows references into $defs, and names the model', () => {
    const rule = schemaAt(APPSPEC_SCHEMA, ['rules', 0])!;
    expect(rule.model).toBe('AppRule');
    expect(Object.keys(rule.schema.properties ?? {})).toEqual(
      expect.arrayContaining(['action', 'applies_to', 'behaviour']),
    );
    expect(schemaAt(APPSPEC_SCHEMA, ['tests', 'cases', 0])!.model).toBe(
      'AppTestCase',
    );
    expect(schemaAt(APPSPEC_SCHEMA, ['connections', 0])!.model).toBe(
      'AppConnection',
    );
  });

  it('reads a choice from its definition, a list’s items, and a map’s values', () => {
    const type = schemaAt(APPSPEC_SCHEMA, ['triggers', 0, 'type'])!;
    expect(type.schema.enum).toEqual(expect.arrayContaining(['schedule']));
    expect(
      schemaAt(APPSPEC_SCHEMA, ['connections', 0, 'only', 0])!.schema.type,
    ).toBe('string');
    // A scene places each player in a map of positions.
    const place = schemaAt(SCENE_SCHEMA, ['stage', 'positions', 'sales'])!;
    expect(place.model).toBe('StagePosition');
    expect(place.schema.properties?.x).toBeDefined();
  });

  it('says nothing of a path the schema does not have', () => {
    expect(schemaAt(APPSPEC_SCHEMA, ['nothing-of-the-kind'])).toBeUndefined();
    expect(schemaAt(APPSPEC_SCHEMA, ['name', 0])).toBeUndefined();
  });

  it('stands a part’s schema on its own, its references still resolving', () => {
    const rule = schemaAt(APPSPEC_SCHEMA, ['rules', 0])!;
    expect(standalone(APPSPEC_SCHEMA, rule.schema).$defs).toBe(
      APPSPEC_SCHEMA.$defs,
    );
  });
});

describe('a part, read and written back', () => {
  const data = {
    name: 'Desk',
    rules: [{ action: 'Send', behaviour: 'ask' }],
    tags: ['a'],
  };

  it('reads a part, and nothing where nothing is', () => {
    expect(valueAt(data, ['rules', 0, 'behaviour'])).toBe('ask');
    expect(valueAt(data, ['rules', 3])).toBeUndefined();
  });

  it('writes a part, copying only the containers on the way', () => {
    const written = withValueAt(
      data,
      ['rules', 0, 'behaviour'],
      'alone',
    ) as typeof data;
    expect(written.rules[0].behaviour).toBe('alone');
    expect(data.rules[0].behaviour).toBe('ask');
    // What is beside the path is the same object, untouched.
    expect(written.tags).toBe(data.tags);
    // A container missing on the way is made: a list for an index.
    expect(withValueAt({}, ['connections', 0, 'server'], 'tavily')).toEqual({
      connections: [{ server: 'tavily' }],
    });
  });

  it('takes some keys as a part of their own, and puts them back beside the others', () => {
    const agent = picked(APPSPEC_SCHEMA, ['agent', 'instructions', 'goal']);
    expect(Object.keys(agent.properties ?? {})).toEqual(
      expect.arrayContaining(['agent', 'instructions', 'goal']),
    );
    expect(Object.keys(agent.properties ?? {})).not.toContain('name');
    expect(pickedValue({ agent: 'a', name: 'n' }, ['agent', 'goal'])).toEqual({
      agent: 'a',
    });
    expect(
      withPickedAt({ name: 'n', agent: 'a' }, [], ['agent'], {
        agent: 'b',
        name: 'ignored',
      }),
    ).toEqual({ name: 'n', agent: 'b' });
  });
});

describe('an edit, through the Appspec’s own converters', () => {
  it('reaches the spec: a rule’s behaviour changed in the schema’s spelling, the rest kept', () => {
    const spec = { ...emptyAppspec('chat'), name: 'Desk' };
    spec.rules = [
      {
        action: 'Send an email',
        appliesTo: ['send'],
        behaviour: 'ask',
      } as never,
    ];
    const behaviours = (schemaAt(APPSPEC_SCHEMA, ['rules', 0, 'behaviour'])!
      .schema.enum ?? []) as string[];
    const other = behaviours.find(value => value !== 'ask')!;
    // Read in the schema's spelling, written there, read back as the spec.
    const data = dumpAppspec(spec);
    // The dumper writes a one-element list as the word itself, as the schema allows (`string | string[]`).
    expect(valueAt(data, ['rules', 0, 'applies_to'])).toBe('send');
    const read = parseAppspec(
      withValueAt(data, ['rules', 0, 'behaviour'], other),
    );
    expect(read.problems).toEqual([]);
    const back = read.app;
    expect(back.rules[0].behaviour).toBe(other);
    expect(back.rules[0].appliesTo).toEqual(['send']);
    expect(back.name).toBe('Desk');
  });
});

describe('the property grid', () => {
  it('hands a change only once a person touched a field: a redraw is no step of Undo', () => {
    const grid = readFileSync(
      join(__dirname, '..', 'composer', 'SchemaProperties.tsx'),
      'utf8',
    );
    expect(grid).toMatch(/if \(!touched\.current\) \{\s*return;/);
  });
});
