/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A scene and its stage written in Python open in the Studio unchanged (LOOP
 * P-30): the YAML `loop scenes build` writes of `examples/scene-in-python/
 * scene.py` — held current by pytest `test_scenes_written` — is read by the
 * spec editor's reader with nothing refused, and written back by it as the
 * same scene, so what the Python wrote is what the Studio shows and saves.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { entryOf, sceneProblems } from '../apps/sceneChecks';
import { sceneOfYaml, sceneTextProblems, sceneYamlOf } from '../apps/sceneYaml';

const text = readFileSync(
  join(__dirname, 'fixtures', 'sceneWrittenInPython.yaml'),
  'utf8',
);

describe('a scene written in Python, opened in the Studio (P-30)', () => {
  it('reads as a scene, with nothing refused', () => {
    expect(sceneTextProblems(text)).toEqual([]);
    const read = sceneOfYaml(text);
    expect(read.problem).toBeFalsy();
    const spec = read.spec!;
    expect(sceneProblems(spec)).toEqual([]);
    expect(spec.schema).toBe('loop.scene/v1');
    expect(spec.id).toBe('desk-and-sales');
    expect(entryOf(spec)).toBe('desk');
    // The stage the Python wrote is the scene's own parts.
    expect(spec.cast.map(member => [member.member, member.runsIn])).toEqual([
      ['desk', 'browser'],
      ['sales', 'browser'],
    ]);
    expect(spec.stage.positions).toEqual({
      desk: { x: 0.25, y: 0.5 },
      sales: { x: 0.75, y: 0.5 },
    });
    expect(spec.script.map(beat => beat.id)).toEqual(['pipeline']);
    expect(spec.rehearsal.beats[0].lines).toEqual([
      'You → Desk',
      'Desk → Sales',
      'Desk: words',
    ]);
  });

  it('is written back by the Studio as the same scene', () => {
    const spec = sceneOfYaml(text).spec!;
    const again = sceneOfYaml(sceneYamlOf(spec)).spec!;
    expect(again).toEqual(spec);
  });
});
