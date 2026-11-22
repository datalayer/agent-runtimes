/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** The catalog of visual components, as the Studio reads it, and the palette's *More*. */

import { describe, expect, it } from 'vitest';

import type { ComponentSpec } from '../../types/agentspecs';
import { DRAWN_OWN_COMPONENTS } from '../../components/a2ui/datalayer/drawn';
import { getComponent, listComponents } from '../../specs/ui';
import {
  bindingsSentence,
  changedValues,
  groupComponents,
  nodesPython,
  pythonCallName,
  nodesYaml,
  pythonLiteral,
  surfaceNode,
  surfaceNodeYaml,
} from '../composer/componentCatalog';

/**
 * Whether a renderer of `datalayerCatalog` draws a component: A2UI's basic
 * catalog a standard one, Datalayer's own renderers the others.
 */
const rendered = (component: ComponentSpec): boolean =>
  component.standard ||
  (DRAWN_OWN_COMPONENTS as readonly string[]).includes(component.id);

describe('the component catalog', () => {
  it('groups every component under one palette group', () => {
    const groups = groupComponents(listComponents());
    const listed = groups.flatMap(group => group.components.map(c => c.id));
    expect(listed.sort()).toEqual(
      listComponents()
        .map(c => c.id)
        .sort(),
    );
    expect(groups.map(group => group.label)[0]).toBe('Conversation');
  });

  it('refuses a component the palette has no group for', () => {
    const stray = {
      ...getComponent('Table')!,
      id: 'Stray',
      category: 'widgets',
    } as ComponentSpec;
    expect(() => groupComponents([stray])).toThrow(
      'Stray is in the category widgets',
    );
  });

  it('writes a component as a node of a surface, with what differs from its defaults', () => {
    const table = getComponent('Table')!;
    expect(changedValues(table, { columns: ['model'], page_size: 20 })).toEqual(
      { columns: ['model'] },
    );
    expect(
      surfaceNodeYaml(
        table,
        { columns: ['model', 'cost'], page_size: 50 },
        'runs',
      ),
    ).toBe(
      [
        '- id: runs',
        '  component: Table',
        '  columns: ["model","cost"]',
        '  page_size: 50',
      ].join('\n'),
    );
    expect(surfaceNodeYaml(getComponent('ChoicePicker')!, {})).toBe(
      '- id: choicepicker\n  component: ChoicePicker',
    );
  });

  it('says what a component can be bound to', () => {
    expect(bindingsSentence(getComponent('Table')!)).toBe(
      'It shows rows and sends selected.',
    );
    expect(bindingsSentence(getComponent('Chart')!)).toBe('It shows points.');
    expect(bindingsSentence(getComponent('Divider')!)).toBe(
      'Its properties and bindings are A2UI’s own.',
    );
  });

  it('writes a component as the Python that places it, with the same properties', () => {
    const table = getComponent('Table')!;
    expect(
      nodesPython([
        surfaceNode(
          table,
          { columns: ['model', 'cost'], page_size: 20, selectable: true },
          'runs',
        ),
      ]),
    ).toBe('app.ui.table("runs", columns=["model", "cost"], selectable=True)');
    expect(
      pythonLiteral({
        rows: { path: '/runs' },
        none: null,
        off: false,
        n: 2.5,
      }),
    ).toBe('{"rows": {"path": "/runs"}, "none": None, "off": False, "n": 2.5}');
    const long = surfaceNode(
      table,
      {
        title: 'Every run of the week, by model',
        columns: ['model', 'pass rate', 'cost', 'latency'],
      },
      'runs',
    );
    expect(nodesPython([long])).toBe(
      [
        'app.ui.table(',
        '    "runs",',
        '    title="Every run of the week, by model",',
        '    columns=["model", "pass rate", "cost", "latency"],',
        ')',
      ].join('\n'),
    );
    expect(() =>
      nodesPython([{ id: 'x', component: 'Text', 'not-a-name': 1 }]),
    ).toThrow('is not a Python name');
    // Every component's typed call, named as agent-runtimes generates it.
    expect(
      [
        'Table',
        'TextField',
        'CheckBox',
        'DateTimeInput',
        'AudioPlayer',
        'FileUpload',
      ].map(pythonCallName),
    ).toEqual([
      'table',
      'text_field',
      'check_box',
      'date_time_input',
      'audio_player',
      'file_upload',
    ]);
  });
});
