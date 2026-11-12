/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The recorded transcripts the message views are tested on: the cases of
 * `agent_runtimes/tests/fixtures/scene_transcript.json`, the fixture the
 * transcript's grammar is held to on both sides, read into lines.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OtelSpan } from '@datalayer/core/lib/otel/types';
import {
  transcriptOfSpans,
  type SceneTranscriptLine,
  type SceneTranscriptMember,
} from '../../sceneTranscriptRules';

type Fixture = {
  members: SceneTranscriptMember[];
  cases: { name: string; spans: OtelSpan[] }[];
};

export const HERE = dirname(fileURLToPath(import.meta.url));

export const FIXTURES = resolve(
  HERE,
  '../../../../../agent_runtimes/tests/fixtures',
);

const fixture = JSON.parse(
  readFileSync(resolve(FIXTURES, 'scene_transcript.json'), 'utf8'),
) as Fixture;

/** The members: Sales, and Accounting with Odoo (the harness's case names its own). */
export const MEMBERS: readonly SceneTranscriptMember[] = fixture.members.filter(
  member => member.id === 'sales' || member.id === 'accounting',
);

/** A case's spans and lines: the scripted scene (0), the open call and the refusal (1)… */
export function recorded(index: number): {
  name: string;
  spans: OtelSpan[];
  lines: SceneTranscriptLine[];
} {
  const scene = fixture.cases[index];
  return {
    name: scene.name,
    spans: scene.spans,
    lines: transcriptOfSpans(scene.spans, MEMBERS),
  };
}

/** The scripted scene: the person asks Sales, Sales asks Accounting, Accounting calls Odoo, both answer. */
export const SCRIPTED = 0;
/** An open call to Odoo, and Accounting's refusal: `TASK_STATE_FAILED`. */
export const OPEN_AND_FAILED = 1;
/** A coding harness's turn behind the Shield: a read allowed, an edit refused under the rule *Change a file*. */
export const HARNESS_STEPS = 4;
