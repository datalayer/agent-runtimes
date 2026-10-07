/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The scene spec's JSON Schema (LOOP A-03, S-01): generated from agentspecs
 * beside the catalogue, it says what `loop.scene/v1` accepts — the parts of
 * a scene, the cast member, a beat's move — so that an editor of the text
 * completes and explains the same thing the loader checks.
 */

import { describe, expect, it } from 'vitest';
import { SCENE_SCHEMA } from '../sceneSchema';
import { SCENE_CATALOGUE } from '../scenes';
import { APPSPEC_SCHEMA } from '../appspecSchema';

const defs = SCENE_SCHEMA.$defs ?? {};
const properties = SCENE_SCHEMA.properties ?? {};

describe('the scene spec’s JSON Schema', () => {
  it('is loop.scene/v1, with the parts of a scene the plan names (§6.10, A-11)', () => {
    expect(SCENE_SCHEMA.title).toBe('Scene spec');
    expect(properties.schema).toMatchObject({
      const: 'loop.scene/v1',
      default: 'loop.scene/v1',
    });
    for (const part of [
      'id',
      'name',
      'description',
      'icon',
      'emoji',
      'team',
      'entry',
      'cast',
      'setting',
      'script',
      'stage',
      'audience',
      'rehearsal',
      'deployment',
    ]) {
      expect(Object.keys(properties)).toContain(part);
    }
  });

  it('describes a cast member, a system of the setting, a beat and its move, each with its words', () => {
    const named = (name: string) => {
      const def = defs[name];
      expect(def, name).toBeDefined();
      return def.properties ?? {};
    };
    expect(Object.keys(named('SceneCastMember'))).toEqual(
      expect.arrayContaining([
        'member',
        'app',
        'server',
        'role',
        'runs_in',
        'talks_to',
        'persona',
        'brief',
      ]),
    );
    expect(Object.keys(named('SceneSystem'))).toEqual(
      expect.arrayContaining(['server', 'as', 'holds']),
    );
    expect(Object.keys(named('SceneBeat'))).toEqual(
      expect.arrayContaining(['id', 'cue', 'moves', 'expect']),
    );
    expect(Object.keys(named('SceneMove'))).toEqual(
      expect.arrayContaining(['who', 'asks', 'over', 'tool']),
    );
    // Every field says what it is for, the editor's hover reading it — a stage position's x and y apart, which say nothing.
    for (const [name, def] of Object.entries(defs).filter(
      ([name]) => name !== 'StagePosition',
    )) {
      for (const [field, prop] of Object.entries(def.properties ?? {})) {
        expect([
          name,
          field,
          typeof prop.description === 'string' && prop.description.length > 0,
        ]).toEqual([name, field, true]);
      }
    }
  });

  it('accepts the shapes the catalogue’s scenes are written in, and shares the Appspec schema’s type', () => {
    // The same `JsonSchema` shape as the Appspec's: one reader for both.
    expect(typeof APPSPEC_SCHEMA.$defs).toBe('object');
    const over = defs.SceneMove?.properties?.over;
    expect(over).toBeDefined();
    for (const scene of Object.values(SCENE_CATALOGUE)) {
      for (const member of scene.cast) {
        expect(
          Object.keys(named(member)).every(key =>
            Object.keys(defs.SceneCastMember?.properties ?? {}).includes(key),
          ),
        ).toBe(true);
      }
    }
  });
});

/** A member's keys as the schema spells them (`runs_in`, `talks_to`). */
function named(member: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(member).map(([key, value]) => [
      key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`),
      value,
    ]),
  );
}
