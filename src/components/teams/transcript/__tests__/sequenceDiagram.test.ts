/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The transcript as a mermaid sequence diagram (SCENES S2-02): the source
 * of a recorded transcript matches its golden file (`golden/*.mmd`; run
 * with `UPDATE_GOLDEN=1` to write them again), the participants stand in
 * the cast's order, each arrow and note maps back to its line, the words
 * are kept to one line of the diagram's grammar.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SceneTranscriptLine } from '../../sceneTranscriptRules';
import {
  diagramText,
  sequenceDiagramOf,
  sequenceDiagramPlan,
  type SequenceCastMember,
} from '../sequenceDiagramRules';
import { HERE, OPEN_AND_FAILED, SCRIPTED, recorded } from './fixture';

const CAST: SequenceCastMember[] = [
  { name: 'Sales' },
  { name: 'Accounting' },
  { name: 'Odoo', system: true },
];

/** The golden source, written when asked. */
function golden(name: string, source: string): string {
  const path = resolve(HERE, 'golden', `${name}.mmd`);
  if (process.env.UPDATE_GOLDEN || !existsSync(path)) {
    writeFileSync(path, source);
  }
  return readFileSync(path, 'utf8');
}

describe('sequenceDiagramOf', () => {
  it('matches the golden source for the scripted scene', () => {
    const source = sequenceDiagramOf(recorded(SCRIPTED).lines, CAST);
    expect(source).toBe(golden('sales-and-accounting', source));
    expect(source.startsWith('sequenceDiagram\n  actor p0 as You\n')).toBe(
      true,
    );
    // The asks and the call go out solid, the answers come back dotted,
    // each one asked is activated until it answers.
    expect(source).toContain(
      'p0->>p1: Give me the aged receivables as of today, by customer.',
    );
    expect(source).toContain('p3-->>p2: answered in 2 s');
    expect(source.match(/activate/g)).toHaveLength(6);
    expect(source).not.toContain('rect');
  });

  it('matches the golden source for the open call and the refusal, in a rect', () => {
    const source = sequenceDiagramOf(recorded(OPEN_AND_FAILED).lines, CAST);
    expect(source).toBe(golden('open-and-failed', source));
    expect(source).toContain(
      'rect rgba(248, 81, 73, 0.14)\n    p1->>p2: Open invoices.',
    );
    expect(source).toContain(
      'p2-->>p1: could not answer: TASK_STATE_FAILED (failed)\n    deactivate p2\n  end',
    );
    // The open call is activated and never deactivated: still running.
    expect(source).toContain(
      'p2->>p3: odoo_accounting_list_invoices…\n    activate p3',
    );
    expect(source).not.toContain('deactivate p3');
  });

  it('maps every arrow back to its line, a call to both its arrows', () => {
    const plan = sequenceDiagramPlan(recorded(SCRIPTED).lines, CAST);
    expect(plan.arrows).toEqual([
      's1:asked',
      's3:asked',
      's4:called',
      's4:called',
      's3:said',
      's1:said',
    ]);
    expect(plan.notes).toEqual([]);
  });

  it('stands the participants in the cast order, systems after members, and the rest as met', () => {
    const lines: SceneTranscriptLine[] = [
      {
        key: 'a:said',
        at: 0,
        from: 'Narrator',
        kind: 'said',
        text: 'The scene opens.',
      },
      {
        key: 'b:asked',
        at: 1,
        from: 'Accounting',
        to: 'Sales',
        kind: 'asked',
        text: 'Ready?',
      },
    ];
    const plan = sequenceDiagramPlan(lines, [
      { name: 'Odoo', system: true },
      { name: 'Sales' },
    ]);
    expect(plan.source.split('\n').slice(0, 5)).toEqual([
      'sequenceDiagram',
      '  participant p0 as Sales',
      '  participant p1 as Odoo',
      '  participant p2 as Narrator',
      '  participant p3 as Accounting',
    ]);
    // Words said to no one are a note over the speaker.
    expect(plan.source).toContain('Note over p2: The scene opens.');
    expect(plan.notes).toEqual(['a:said']);
    expect(plan.arrows).toEqual(['b:asked']);
  });

  it('keeps the words to one line of the grammar', () => {
    expect(diagramText('a;  b\n#c')).toBe('a#59; b #35;c');
    expect(diagramText('x'.repeat(100))).toBe(`${'x'.repeat(71)}…`);
    expect(diagramText('   ')).toBe(' ');
  });
});
