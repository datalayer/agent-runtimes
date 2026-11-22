/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Canvas's palette as a contribution point: the
 * blocks the enabled plugins contribute, read from Reactor, the plugins the
 * application's organization has turned off (IAM's `plugins_off`) taken off,
 * and an application's setup notes saying what its page uses from one of
 * them; the organization's settings switch them.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { listComponents } from '../../specs/ui';
import {
  organizationOfSpace,
  paletteComponents,
  pluginSwitches,
  switchPlugin,
  unknownPluginsOff,
} from '../composer/canvasPalette';
import { appComponents } from '../apps/customComponents';
import { parseAppspec } from '../apps/appspec';
import { groupComponents } from '../composer/componentCatalog';

const source = (...parts: string[]): string =>
  readFileSync(join(__dirname, '..', ...parts), 'utf8');

describe('the palette', () => {
  it('is every component of the catalog while the organization has none off', () => {
    expect(paletteComponents([]).map(component => component.id)).toEqual(
      listComponents().map(component => component.id),
    );
    expect(groupComponents(paletteComponents([])).length).toBeGreaterThan(0);
  });

  it('loses the blocks of a plugin the organization turned off, by catalogue id', () => {
    expect(paletteComponents(['a2ui-surface'])).toEqual([]);
    expect(paletteComponents(['chat', 'no-such-plugin']).length).toBe(
      listComponents().length,
    );
  });

  it("lists an application's own components last, under Its own, and on no other's", () => {
    const { app } = parseAppspec({
      schema: 'agent.app/v1',
      id: 'desk',
      name: 'Desk',
      kind: 'chat',
      agent: 'cog-crawler:0.0.1',
      interface: {
        custom_components: [
          {
            name: 'Gauge',
            description: 'A dial.',
            props: {
              type: 'object',
              properties: { label: { type: 'string' } },
            },
            shows: ['value'],
            source: 'https://elements.example.com/gauge.js',
          },
        ],
      },
    });
    const groups = groupComponents([
      ...paletteComponents([]),
      ...appComponents(app, []),
    ]);
    expect(groups[groups.length - 1].label).toBe('Its own');
    expect(
      groups[groups.length - 1].components.map(component => component.id),
    ).toEqual(['Gauge']);
    const other = parseAppspec({
      schema: 'agent.app/v1',
      id: 'other',
      name: 'Other',
      kind: 'chat',
      agent: 'cog-crawler:0.0.1',
    });
    expect(
      groupComponents([
        ...paletteComponents([]),
        ...appComponents(other.app, []),
      ]).map(group => group.label),
    ).not.toContain('Its own');
  });

  it('is what the Canvas lists and what Add offers, for the list it is given', () => {
    const canvas = source('composer', 'AppLayoutEditor.tsx');
    expect(canvas).toContain(
      "import { paletteComponents } from './canvasPalette';",
    );
    // With the components the application's developer wrote, its own.
    expect(canvas).toContain(
      'groupComponents([...paletteComponents(pluginsOff), ...own])',
    );
    expect(canvas).toContain('appComponents(definition.spec, [])');
    expect(canvas).toContain('const { groups } = useCanvas();');
    expect(canvas).not.toContain('groupComponents(listComponents())');
  });
});

describe('the organization of an application', () => {
  const spaces = [
    { uid: 'personal', name_t: 'Library' },
    { uid: 'shared', organization_uid: '01ORG' },
  ];

  it('is the organization of its Space; a personal Space has none', () => {
    expect(organizationOfSpace(spaces, 'shared')).toBe('01ORG');
    expect(organizationOfSpace(spaces, 'personal')).toBe('');
    expect(organizationOfSpace(spaces, 'elsewhere')).toBe('');
    expect(organizationOfSpace(spaces, undefined)).toBe('');
  });
});

describe("the organization's Components tab", () => {
  it('lists the catalogue, each on unless the organization turned it off, in plain words', () => {
    const switches = pluginSwitches(['a2ui-surface']);
    // A switch per UI plugin that renders components.
    expect(switches.map(entry => entry.plugin.id)).toEqual(['a2ui-surface']);
    const [surfaces] = switches;
    expect(surfaces.on).toBe(false);
    expect(surfaces.says).toBe(
      'Off: its components are off the Canvas, and an application using one says so.',
    );
    expect(pluginSwitches([])[0].says).toMatch(
      /^On: its \d+ components are on the Canvas\.$/,
    );
  });

  it('switches one plugin and keeps the rest of the list', () => {
    expect(switchPlugin(['x', 'a2ui-surface'], 'a2ui-surface', true)).toEqual([
      'x',
    ]);
    expect(switchPlugin(['x'], 'a2ui-surface', false)).toEqual([
      'x',
      'a2ui-surface',
    ]);
    expect(switchPlugin(['a2ui-surface'], 'a2ui-surface', false)).toEqual([
      'a2ui-surface',
    ]);
    // 'a2ui' is a renderer, not a UI plugin: unknown.
    expect(unknownPluginsOff(['x', 'a2ui-surface', 'a2ui'])).toEqual([
      'x',
      'a2ui',
    ]);
  });
});
