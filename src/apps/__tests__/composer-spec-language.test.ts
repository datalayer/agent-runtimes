/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the YAML editor knows of an Appspec: fields where
 * the cursor is, choices, references from the catalogues, meanings, and the
 * line a problem is on.
 */

import { describe, expect, it } from 'vitest';
import {
  ITEM,
  completionsAt,
  componentAt,
  contextAt,
  hoverAt,
  lineOfProblem,
  referencesFor,
  schemaAt,
} from '../composer/appSpecLanguage';

const DOC = [
  'schema: agent.app/v1',
  'id: desk',
  'name: Desk',
  'kind: chat',
  'agent: cog-',
  'connections:',
  '  - server: tavily:0.0.1',
  '    access: ',
  'rules:',
  '  - action: Post',
  '    applies_to: send',
  '    behaviour: ',
  'checks:',
  '  guards:',
  '    - ',
  'interface:',
  '  ',
  '',
].join('\n');

const at = (line: number, column?: number) => {
  const lines = DOC.split('\n');
  const before =
    lines.slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0);
  return before + (column ?? lines[line - 1].length);
};
const labels = (line: number, column?: number) =>
  completionsAt(DOC, at(line, column)).options.map(o => o.label);

describe('the YAML editor of an Appspec', () => {
  it('knows where the cursor is', () => {
    expect(contextAt(DOC, at(8))).toMatchObject({
      path: ['connections', ITEM],
      mode: 'value',
      key: 'access',
    });
    expect(contextAt(DOC, at(12))).toMatchObject({
      path: ['rules', ITEM],
      mode: 'value',
      key: 'behaviour',
    });
    expect(contextAt(DOC, at(15))).toMatchObject({
      path: ['checks', 'guards', ITEM],
      mode: 'key',
    });
    expect(contextAt(DOC, at(17))).toMatchObject({
      path: ['interface'],
      mode: 'key',
    });
    expect(contextAt(DOC, at(5))).toMatchObject({
      path: [],
      mode: 'value',
      key: 'agent',
      prefix: 'cog-',
    });
  });

  it('completes the fields of the mapping the cursor is in', () => {
    expect(labels(17)).toEqual(
      expect.arrayContaining(['layout', 'starters', 'settings', 'accent']),
    );
    expect(labels(18, 0)).toEqual(
      expect.arrayContaining([
        'permissions',
        'tests',
        'record',
        'avatar',
        'banner',
      ]),
    );
    expect(schemaAt(['connections', ITEM])?.properties).toHaveProperty('only');
  });

  it('completes a choice with its values, and a reference from its catalogue', () => {
    expect(labels(8)).toEqual(['read', 'write']);
    expect(labels(12)).toEqual([
      'do_it',
      'if_asked',
      'ask_first',
      'leave_to_me',
    ]);
    expect(labels(5)).toEqual(expect.arrayContaining(['cog-crawler']));
    expect(labels(15)).toEqual(expect.arrayContaining(['confidence-guard']));
    expect(referencesFor(['connections', ITEM], 'server')).toEqual(
      expect.arrayContaining(['tavily', 'slack']),
    );
    expect(referencesFor([], 'model').length).toBeGreaterThan(10);
    // The backend tools are `backend_tools`; `tools` is not a field of the spec.
    expect(referencesFor([], 'backend_tools')).toEqual(
      expect.arrayContaining(['decide', 'runtime-echo']),
    );
    expect(referencesFor([], 'tools')).toEqual([]);
  });

  it('says what a field means', () => {
    const hover = hoverAt(DOC, at(4, 1));
    expect(hover?.text).toMatch(/chat, widget, decision or worker|chat/);
    expect(hoverAt(DOC, at(12, 6))?.text).toMatch(/do_it/);
    expect(hoverAt(DOC, at(1, 12))).toBeNull();
  });

  it('completes a component of the surface from the catalog, its properties from its schema', () => {
    const surface = [
      'interface:',
      '  surface:',
      '    components:',
      '      - id: root',
      '        component: Column',
      '      - id: runs',
      '        component: Table',
      '        page_size: 10',
      '        ',
      '      - id: hello',
      '        component: ',
      '      - id: words',
      '        component: Text',
      '        variant: ',
      '',
    ].join('\n');
    const offset = (line: number) => {
      const lines = surface.split('\n');
      return (
        lines.slice(0, line - 1).join('\n').length + 1 + lines[line - 1].length
      );
    };
    const options = (line: number) =>
      completionsAt(surface, offset(line)).options.map(option => option.label);
    expect(componentAt(surface, offset(9))).toBe('Table');
    expect(componentAt(surface, offset(14))).toBe('Text');
    // A Table's properties, its bindings and its action, and what every block takes.
    expect(options(9)).toEqual(
      expect.arrayContaining([
        'columns',
        'page_size',
        'selectable',
        'rows',
        'selected',
        'action',
        'visible_when',
      ]),
    );
    expect(options(9)).not.toContain('component');
    expect(options(11)).toEqual(
      expect.arrayContaining(['Table', 'Chart', 'Form', 'TextField']),
    );
    // A standard one's choices are the catalog's.
    expect(options(14)).toEqual([
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'caption',
      'body',
    ]);
    expect(hoverAt(surface, offset(8) - 4)?.text).toBe(
      'Rows per page: How many rows show at once.',
    );
  });

  it('puts a problem on its line', () => {
    expect(lineOfProblem(DOC, 'Line 3: bad indentation')).toBe(3);
    expect(
      lineOfProblem(DOC, 'connections.0.access: is one of read, write.'),
    ).toBe(8);
    expect(
      lineOfProblem(DOC, 'There is no MCP server named “tavily:0.0.1”.'),
    ).toBe(7);
    expect(
      lineOfProblem(DOC, 'An application names who does the work.'),
    ).toBeNull();
  });

  /*
    A scene, in the same editor. Seen 2026-10-10 in a signed-in page:
    every refusal the panel listed was missing from its line. agentspecs
    prefixes a scene's refusal with the scene's id, and read as one path that
    id led nowhere — so nothing was underlined, ever. And a scene repeats its
    keys (`who:` seventeen times in Sales & Accounting), so a path has to be
    walked, not its last key searched for.
  */
  describe('a scene’s refusal, as agentspecs says it', () => {
    const SCENE = [
      'schema: agent.scene/v1', //            1
      'id: sales-accounting', //             2
      'name: Sales & Accounting', //         3
      'cast:', //                            4
      '  - id: sales', //                    5
      '    app: sales', //                   6
      '  - id: accounting', //               7
      '    app: accounting', //              8
      'script:', //                          9
      '  - id: invoices', //                10
      '    cue:', //                        11
      '      say: Open invoices', //        12
      '  - id: balance', //                 13
      '    cue:', //                        14
      '      say: A balance', //            15
      'stage:', //                          16
      '  positions:', //                    17
      '    sales:', //                      18
      '      x: 0.25', //                   19
      '      y: 0.5', //                    20
      '    accounting:', //                 21
      '      x: 5', //                      22
      '      y: 0.5', //                     23
    ].join('\n');

    it('reads the path after the scene’s id, and lands on that very line', () => {
      expect(
        lineOfProblem(
          SCENE,
          'sales-accounting: stage.positions.accounting.x: Input should be less than or equal to 1',
        ),
      ).toBe(22);
    });

    it('walks the path, so a key said twice lands on the one it is about', () => {
      // The second beat's `say`, not the first `say:` in the text.
      expect(
        lineOfProblem(
          SCENE,
          'sales-accounting: script.1.cue.say: String should have at least 1 character',
        ),
      ).toBe(15);
      // The second player's `x`, not the first.
      expect(
        lineOfProblem(
          SCENE,
          'stage.positions.accounting.x: Input should be less than or equal to 1',
        ),
      ).toBe(22);
    });

    it('finds a member named in straight quotes as a whole word, not inside the scene’s id', () => {
      // `sales` is inside `sales-accounting` on line 2: the member is on line 5.
      expect(
        lineOfProblem(
          SCENE,
          "sales-accounting: Its cast makes no team: member 'sales' talks to itself",
        ),
      ).toBe(5);
    });

    it('still says nothing of a refusal about the whole scene', () => {
      expect(
        lineOfProblem(
          SCENE,
          'sales-accounting: A scene needs at least one beat',
        ),
      ).toBeNull();
    });
  });
});
