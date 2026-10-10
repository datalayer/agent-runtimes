/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an editor refuses of a scene is what `loop` refuses (plans/STUDIO.md
 * S-10): every sentence of `sceneChecks` is agentspecs' own, in agentspecs'
 * order, each one at a time as agentspecs stops where it stops.
 *
 * The table is not written by hand. `scripts/record-scene-checks.py` runs
 * agentspecs itself (`parse_scene`, then `scene_problems`) over one scene per
 * sentence, and two that play, and writes down what it says; this file holds
 * the module to it. Two copies of a rule drift unless something compares
 * them. Each case is a scene as a person writes it, in agentspecs' spelling,
 * so the table also exercises the reader (`sceneOfYaml`).
 *
 * Moved from the landing's Studio with the module on 2026-10-10; what is the
 * Studio's own — that its words are a Maker's, and that both of its surfaces
 * read this module — stays tested there.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  AGENTSPECS_OWN,
  SECTION_WORDS,
  STAGE_SECTIONS,
  entryOf,
  problemsOfSections,
  sceneCheck,
  sceneProblems,
  sceneShapeProblem,
  sectionOfKey,
  transcriptLineOf,
} from '../apps/sceneChecks';
import { sceneOfYaml, sceneTextProblems, sceneYamlOf } from '../apps/sceneYaml';

type Case = { name: string; yaml: string; says: string[] };
const table = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'sceneCheckCases.json'), 'utf8'),
) as {
  recordedWith: string;
  cases: Case[];
};
const named = (name: string): Case => {
  const one = table.cases.find(each => each.name === name);
  if (!one) {
    throw new Error(`no case named ${name}`);
  }
  return one;
};

const specOf = (yaml: string) => {
  const read = sceneOfYaml(yaml);
  if (!read.spec) {
    throw new Error(`the case does not read as a scene: ${read.problem}`);
  }
  return read.spec;
};

describe('what an editor refuses of a scene is what `loop` refuses (S-10)', () => {
  it('has a case for every sentence agentspecs says, recorded from agentspecs itself', () => {
    expect(table.recordedWith).toBe('scripts/record-scene-checks.py');
    expect(table.cases.length).toBeGreaterThanOrEqual(34);
    // Two of them play: a scene with nothing wrong, and a system reached through a connection.
    expect(table.cases.filter(one => one.says.length === 0)).toHaveLength(2);
  });

  // As a person meets it: the text in, agentspecs' sentences out — its shape
  // refused before it is read into a spec, as pydantic refuses it, and the
  // rules read on what it says once its shape is right.
  const says = (yaml: string): string[] =>
    sceneTextProblems(yaml).map(problem => problem.says);

  for (const one of table.cases) {
    it(`says the same of ${one.name}`, () => {
      expect(says(one.yaml)).toEqual(one.says);
    });
  }

  it('says nothing twice: every case is one sentence at a time, as agentspecs stops where it stops', () => {
    for (const one of table.cases) {
      const said = says(one.yaml);
      expect(new Set(said).size).toBe(said.length);
    }
  });

  it('reads the rules on the spec a text says, once its shape is right', () => {
    for (const one of table.cases) {
      const read = sceneOfYaml(one.yaml);
      if (read.spec) {
        expect(sceneProblems(read.spec)).toEqual(one.says);
      }
    }
    expect(sceneTextProblems('cast: [')[0].says).toMatch(
      /^The text does not read/,
    );
  });
});

describe('each refusal says which part of the scene it is about (S-09)', () => {
  it('reads the stage’s own refusals apart: where each player runs, and what the audience may do', () => {
    const inTheBrowser = named('an address for a member in the browser');
    const visitors = named('visitors may watch and a member has no address');
    expect(
      problemsOfSections(
        sceneCheck(specOf(inTheBrowser.yaml)),
        STAGE_SECTIONS,
      ).map(problem => problem.says),
    ).toEqual(inTheBrowser.says);
    expect(
      problemsOfSections(sceneCheck(specOf(visitors.yaml)), STAGE_SECTIONS).map(
        problem => problem.says,
      ),
    ).toEqual(visitors.says);
    expect(sceneCheck(specOf(visitors.yaml))[0].section).toBe('audience');
    expect(sceneCheck(specOf(inTheBrowser.yaml))[0].section).toBe('stage');
  });

  it('puts a script’s refusal under what happens, and a setting’s under what is on stage', () => {
    const beat = named('a beat moved by someone not in the cast');
    const system = named('a system nobody reaches');
    expect(sceneCheck(specOf(beat.yaml))[0].section).toBe('script');
    expect(sceneCheck(specOf(system.yaml))[0].section).toBe('setting');
    expect(
      problemsOfSections(sceneCheck(specOf(beat.yaml)), STAGE_SECTIONS),
    ).toEqual([]);
  });

  it('names every section a person reads, the stage’s among them', () => {
    expect(Object.keys(SECTION_WORDS).sort()).toEqual([
      'audience',
      'cast',
      'rehearsal',
      'scene',
      'script',
      'setting',
      'stage',
    ]);
    expect(STAGE_SECTIONS).toEqual(['stage', 'audience']);
    for (const one of table.cases) {
      for (const problem of sceneTextProblems(one.yaml)) {
        expect(SECTION_WORDS[problem.section]).toBeTruthy();
      }
    }
  });

  it('files a refusal of the shape under the part whose key it names', () => {
    const section = (name: string) =>
      sceneTextProblems(named(name).yaml)[0].section;
    expect(section('a cast that is a word')).toBe('cast');
    expect(section('a member running nowhere')).toBe('cast');
    expect(section('an audience nobody can be')).toBe('audience');
    expect(section('a rehearsal bound that is no duration')).toBe('rehearsal');
    expect(section('places that are a word')).toBe('stage');
    expect(section('a name that is a number')).toBe('scene');
    // Both faults are said; the part is the first's.
    expect(section('two things wrong at once')).toBe('cast');
    expect(sectionOfKey('deployment')).toBe('stage');
    expect(sectionOfKey('nothing-of-the-kind')).toBe('scene');
  });

  it('never throws on a scene of the wrong shape: it refuses it', () => {
    // A cast written as one word used to make the reader throw.
    for (const yaml of [
      'schema: loop.scene/v1\nid: x\nname: X\ncast: sales\n',
      'schema: loop.scene/v1\nid: x\nname: X\nscript: 3\nstage: []\n',
    ]) {
      expect(() => sceneTextProblems(yaml)).not.toThrow();
      expect(sceneTextProblems(yaml).length).toBe(1);
    }
  });
});

describe('what stays agentspecs’', () => {
  it('names the checks the browser cannot make, so no second set of them is written', () => {
    // A tool a system does not offer is the browser's since 2026-10-10: the
    // catalogue says what each server offers and for what (\`SERVER_ACTIONS\`).
    expect(AGENTSPECS_OWN).toHaveLength(3);
    expect(AGENTSPECS_OWN.join(' ')).not.toMatch(
      /tool a system does not offer/,
    );
    expect(AGENTSPECS_OWN.join(' ')).toMatch(/kept in your space/);
    expect(AGENTSPECS_OWN.join(' ')).toMatch(/recording/);
    expect(AGENTSPECS_OWN.join(' ')).toMatch(/names a team of the catalogue/);
  });
});

describe('the pieces of the reading', () => {
  it('reads the entry agentspecs reads: the one said, else the initiator, else the first of the cast', () => {
    const spec = specOf(named('a scene that plays').yaml);
    expect(entryOf(spec)).toBe('sales');
    expect(entryOf({ ...spec, entry: '' })).toBe('sales');
    expect(
      entryOf({
        ...spec,
        entry: '',
        cast: spec.cast.map(member => ({ ...member, role: 'contributor' })),
      }),
    ).toBe('sales');
    expect(entryOf({ ...spec, entry: '', cast: [] })).toBe('');
  });

  it('reads a rehearsal’s line as the transcript writes it: an ask, a tool, an answer', () => {
    expect(transcriptLineOf('You → Sales')).toEqual({
      who: 'You',
      whom: 'Sales',
      detail: '',
    });
    expect(transcriptLineOf('Accounting → Odoo: odoo_accounting_*')).toEqual({
      who: 'Accounting',
      whom: 'Odoo',
      detail: 'odoo_accounting_*',
    });
    expect(transcriptLineOf('Accounting: a table')).toEqual({
      who: 'Accounting',
      whom: '',
      detail: 'a table',
    });
    expect(transcriptLineOf('nothing at all')).toBeUndefined();
  });

  it('refuses a member placed outside the box, as the spec does: fractions, not pixels', () => {
    const spec = specOf(named('a scene that plays').yaml);
    expect(sceneShapeProblem(spec)).toBeUndefined();
    const pixels = {
      ...spec,
      stage: { ...spec.stage, positions: { sales: { x: 40, y: 0.5 } } },
    };
    expect(sceneShapeProblem(pixels)?.says).toBe(
      'probe: stage.positions.sales.x: Input should be less than or equal to 1',
    );
    expect(sceneShapeProblem(pixels)?.section).toBe('stage');
    const under = {
      ...spec,
      stage: { ...spec.stage, positions: { sales: { x: 0.2, y: -1 } } },
    };
    expect(sceneShapeProblem(under)?.says).toBe(
      'probe: stage.positions.sales.y: Input should be greater than or equal to 0',
    );
  });

  it('writes back what it read: a scene that plays reads the same after a round trip', () => {
    const spec = specOf(named('a scene that plays').yaml);
    expect(specOf(sceneYamlOf(spec))).toEqual(spec);
  });
});
