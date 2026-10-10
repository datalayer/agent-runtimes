/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A scene's spec, `loop.scene/v1`, as text: how it is read and how it is
 * written — what `appspec.ts` is for an application.
 *
 * agentspecs writes a scene in its own spelling (`talks_to`, `runs_in`) and
 * agent-runtimes' `SceneSpec` in its own (`talksTo`, `runsIn`); a text in
 * either reads (`sceneOfYaml`) and is written back in agentspecs' spelling
 * (`sceneYamlOf`), so that what an editor saves is what `loop` reads. What is
 * read *off* a scene rather than written into one — its `setup`, its recorded
 * `played` — is never written into the text and never erased by an edit of it
 * (`SCENE_DERIVED_KEYS`, `sceneWithDerived`). A text's own refusals are the
 * scene's checks over what it reads (`sceneTextProblems`).
 *
 * Moved from the landing's Studio on 2026-10-10 with `sceneChecks.ts`
 * (plans/STUDIO.md S-10), so that every shell editing a scene reads and writes
 * it alike. Pure: no React, no network.
 *
 * @module apps/apps/sceneYaml
 */

import { parse, stringify } from 'yaml';
import type { SceneSpec } from '../../types/scenes';
import { entryOf, sceneCheck, type SceneProblem } from './sceneChecks';

export type { SceneSpec };

/** What a scene spec says of itself. */
export const SCENE_SCHEMA = 'loop.scene/v1';

/** A spec with nothing said yet: signed-in people may watch, the transcript shows everything. */
export const emptySceneSpec = (): SceneSpec => ({
  schema: SCENE_SCHEMA,
  id: '',
  version: '0.0.1',
  name: '',
  description: '',
  tags: [],
  icon: '',
  emoji: '',
  team: '',
  entry: '',
  cast: [],
  setting: { systems: [], period: '', language: 'en', assumes: '' },
  script: [],
  stage: {
    positions: {},
    opensFirst: '',
    transcript: { tools: true, narration: true },
    inspectors: [],
    restsAfter: '',
    pace: 'steady',
  },
  audience: { who: 'signed-in', ceilingPerAsk: 0, asksADay: 0 },
  rehearsal: {
    beats: [],
    within: '',
    verified: { live: [], recorded: [], unverified: [] },
  },
  deployment: { account: '', page: '', addresses: {} },
  setup: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * What is written: the spec without what says nothing — an empty string, an
 * empty list, an empty map — as `generate_apps.py` drops them, so the text
 * beside the stage reads as a person would write it.
 */
export function compactScene(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(compactScene);
  }
  if (isRecord(value)) {
    const kept: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === '' || item === undefined || item === null) {
        continue;
      }
      if (Array.isArray(item) && item.length === 0) {
        continue;
      }
      if (isRecord(item) && Object.keys(item).length === 0) {
        continue;
      }
      kept[key] = compactScene(item);
    }
    return kept;
  }
  return value;
}

/**
 * The keys agentspecs spells with an underscore, as the TypeScript spec
 * spells them (`generate_scenes.py`'s `CAMEL`): the text beside the stage
 * is written as agentspecs reads it, so that a scene's YAML pastes in and
 * the schema's completion names what is there.
 */
export const TEXT_KEYS: Readonly<Record<string, string>> = {
  runs_in: 'runsIn',
  talks_to: 'talksTo',
  opens_first: 'opensFirst',
  rests_after: 'restsAfter',
  ceiling_per_ask: 'ceilingPerAsk',
  asks_a_day: 'asksADay',
  must_say: 'mustSay',
  must_not_say: 'mustNotSay',
};

const SPEC_KEYS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(TEXT_KEYS).map(([text, spec]) => [spec, text]),
);

/** Every key renamed by a map, deep; a key the map does not name — a member's id among them — is left as it is. */
function respelled(
  value: unknown,
  keys: Readonly<Record<string, string>>,
): unknown {
  if (Array.isArray(value)) {
    return value.map(item => respelled(item, keys));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        keys[key] ?? key,
        respelled(item, keys),
      ]),
    );
  }
  return value;
}

/**
 * What a scene spec carries that is not written by hand: what it names that
 * is not enabled today (`setup`, computed by agentspecs' `scene_setup`) and
 * the last rehearsal played (`played`, what *Live* is read from). agentspecs
 * refuses both in a scene file — they are read off a scene, never into one —
 * so the text does not write them, and an edit of the text does not erase
 * them (`sceneWithDerived`).
 */
export const SCENE_DERIVED_KEYS = ['setup', 'played'] as const;

/** The spec with what is not written by hand carried over from another: the one the text was read from. */
export const sceneWithDerived = (
  spec: SceneSpec,
  from: SceneSpec,
): SceneSpec => ({
  ...spec,
  setup: from.setup ?? [],
  ...(from.played ? { played: from.played } : {}),
});

/**
 * The scene as YAML, spelled as agentspecs spells it: the text under the
 * stage (S-01, S-08), edited there as on the stage (`sceneOfYaml`). What is
 * not written by hand is left out, so the text reads as a scene file
 * (`SCENE_DERIVED_KEYS`).
 */
export function sceneYamlOf(spec: SceneSpec): string {
  const written = Object.fromEntries(
    Object.entries(spec).filter(
      ([key]) => !(SCENE_DERIVED_KEYS as readonly string[]).includes(key),
    ),
  );
  return stringify(respelled(compactScene(written), SPEC_KEYS), {
    lineWidth: 0,
  });
}

/**
 * The scene the text says, in the words the problem is said with when it
 * says none: not YAML, not a mapping, not `loop.scene/v1`. A spec that is
 * one is laid over the empty spec, as one read from its item is.
 */
export function sceneOfYaml(text: string): {
  spec?: SceneSpec;
  problem?: string;
} {
  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (error) {
    const why =
      error instanceof Error ? error.message.split('\n')[0] : String(error);
    return { problem: `The text does not read: ${why}` };
  }
  if (!isRecord(parsed)) {
    return {
      problem: 'The text is not a scene: it starts with its name and its cast.',
    };
  }
  if (parsed.schema !== SCENE_SCHEMA) {
    return {
      problem: `The text is not a scene: it says schema ${JSON.stringify(parsed.schema ?? '')}, and a scene says ${SCENE_SCHEMA}.`,
    };
  }
  // Spelled as agentspecs spells it, or as the spec does: both read.
  return {
    spec: sceneOfData(respelled(parsed, TEXT_KEYS) as Partial<SceneSpec>),
  };
}

/** A cast member with nothing said: what `compactScene` dropped reads as empty again. */
const EMPTY_MEMBER = {
  app: '',
  ref: '',
  server: '',
  brief: '',
  persona: { name: '', face: '', line: '' },
} as const;

/**
 * A spec said in part, laid over the empty one: a part left unsaid — of the
 * scene, of a cast member, of a system of the setting, of the rehearsal —
 * reads as empty rather than as `undefined`, so that what was written
 * compact (`compactScene`) reads back whole.
 */
export function sceneOfData(spec: Partial<SceneSpec>): SceneSpec {
  const empty = emptySceneSpec();
  const setting: Partial<SceneSpec['setting']> = spec.setting ?? {};
  const rehearsal: Partial<SceneSpec['rehearsal']> = spec.rehearsal ?? {};
  return {
    ...empty,
    ...spec,
    schema: SCENE_SCHEMA,
    cast: (spec.cast ?? []).map(member => ({
      ...EMPTY_MEMBER,
      ...member,
      persona: { ...EMPTY_MEMBER.persona, ...(member.persona ?? {}) },
    })),
    setting: {
      ...empty.setting,
      ...setting,
      systems: (setting.systems ?? []).map(system => ({
        ...system,
        as: system.as ?? '',
        holds: system.holds ?? '',
      })),
    },
    script: spec.script ?? [],
    stage: {
      ...empty.stage,
      ...(spec.stage ?? {}),
      transcript: {
        ...empty.stage.transcript,
        ...(spec.stage?.transcript ?? {}),
      },
    },
    audience: { ...empty.audience, ...(spec.audience ?? {}) },
    rehearsal: {
      ...empty.rehearsal,
      ...rehearsal,
      verified: { ...empty.rehearsal.verified, ...(rehearsal.verified ?? {}) },
    },
    deployment: { ...empty.deployment, ...(spec.deployment ?? {}) },
    setup: spec.setup ?? [],
  };
}

/**
 * What the text says of itself (S-08): what stands in the way, each in
 * agentspecs' sentence with the part of the scene it is about — a text that
 * is no scene first of all, since nothing else can be read of it.
 */
export function sceneTextProblems(text: string): SceneProblem[] {
  const read = sceneOfYaml(text);
  if (!read.spec) {
    return [{ says: read.problem ?? '', section: 'scene' }];
  }
  return sceneCheck(read.spec);
}

/** The member the audience talks to, as the text says it (`entryOf`); empty while it does not read. */
export function sceneTextEntry(text: string): string {
  const read = sceneOfYaml(text);
  return read.spec ? entryOf(read.spec) : '';
}
