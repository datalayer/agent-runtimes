/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An app's interface, composed from the approved catalog and checked
 * before it is kept: a model composes the first interface, and the
 * generated-UI checks refuse what the catalog does not allow.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ALLOWED_COMPONENTS,
  INTERFACE_ACTIONS,
  INTERFACE_PATHS,
  composePrompt,
  defaultInterface,
  interfaceProblems,
  parseInterface,
  surfaceData,
  surfaceMessages,
} from '../composer/appInterface';

/** The basic catalog's components, as `@a2ui/react` names them. */
/** A criterion, as a decision's form starts one. */
const emptyCriterion = () => ({
  name: '',
  kind: 'metric' as const,
  weight: 1,
  instructions: '',
  options: [] as string[],
  direction: 'higher' as const,
  measure: '' as const,
});

const CATALOG = [
  'Text',
  'Image',
  'Icon',
  'Video',
  'AudioPlayer',
  'Row',
  'Column',
  'List',
  'Card',
  'Tabs',
  'Divider',
  'Modal',
  'Button',
  'TextField',
  'CheckBox',
  'ChoicePicker',
  'Slider',
  'DateTimeInput',
];

describe('the default interface', () => {
  it('passes its own checks, over the whole catalog and over what a template allows', () => {
    const spec = defaultInterface();
    expect(interfaceProblems(spec, [], CATALOG)).toEqual([]);
    expect(
      interfaceProblems(spec, DEFAULT_ALLOWED_COMPONENTS, CATALOG),
    ).toEqual([]);
  });

  it('shows the question, the ranking and every alternative, and lets the user choose, ask and save', () => {
    const { components } = defaultInterface();
    const paths = JSON.stringify(components);
    expect(paths).toContain('"/question"');
    expect(paths).toContain('"/ranking"');
    expect(components.find(c => c.id === 'alternatives')?.children).toEqual({
      componentId: 'alternative',
      path: '/alternatives',
    });
    const actions = components.flatMap(
      c =>
        (c.action as { event?: { name: string } } | undefined)?.event?.name ??
        [],
    );
    expect(actions.sort()).toEqual(['ask', 'choose', 'save']);
  });
});

describe('an interface a model answered with', () => {
  it('is read out of a fence, out of prose, or as a bare list', () => {
    const tree =
      '{"components": [{"id": "root", "component": "Text", "text": "Hi"}]}';
    expect(
      parseInterface('```json\n' + tree + '\n```')?.components,
    ).toHaveLength(1);
    expect(
      parseInterface('Here it is:\n' + tree + '\nDone.')?.components,
    ).toHaveLength(1);
    expect(
      parseInterface('[{"id": "root", "component": "Text", "text": "Hi"}]')
        ?.components,
    ).toHaveLength(1);
    expect(
      parseInterface({
        updateComponents: {
          surfaceId: 'x',
          components: [{ id: 'root', component: 'Text' }],
        },
      })?.components,
    ).toHaveLength(1);
    expect(parseInterface('no json here')).toBeNull();
    expect(parseInterface('{"components": []}')).toBeNull();
    expect(
      parseInterface('{"components": [{"component": "Text"}]}'),
    ).toBeNull();
  });

  it('is checked: whole, allowed, reading what is published, dispatching what is handled, able to choose', () => {
    const spec = parseInterface({
      components: [
        {
          id: 'root',
          component: 'Column',
          children: ['title', 'pick', 'gone', 'chart'],
        },
        { id: 'title', component: 'Text', text: { path: '/secret' } },
        {
          id: 'pick',
          component: 'Button',
          child: 'pick-label',
          action: { event: { name: 'delete' } },
        },
        { id: 'pick-label', component: 'Text', text: 'Delete' },
        { id: 'chart', component: 'Chart', series: [] },
        { id: 'slide', component: 'Slider', max: 10, value: 1 },
      ],
    })!;
    expect(
      interfaceProblems(spec, ['Column', 'Text', 'Button'], CATALOG),
    ).toEqual([
      'root refers to gone, which is not in the interface.',
      'title reads /secret, which the app does not publish.',
      'pick dispatches delete, which the app does not handle.',
      'chart is a Chart, which the catalog does not have.',
      'slide is a Slider, which this app does not allow.',
      'Nothing in the interface lets the user choose an alternative.',
    ]);
    expect(interfaceProblems(null, [], CATALOG)).toEqual([
      'The interface has no components.',
    ]);
    const noRoot = parseInterface({
      components: [
        { id: 'a', component: 'Text', text: 'x' },
        { id: 'a', component: 'Text', text: 'y' },
      ],
    })!;
    expect(interfaceProblems(noRoot, [], CATALOG)).toEqual(
      expect.arrayContaining([
        'Two components are named a.',
        'No component is named root: the surface has nowhere to start.',
      ]),
    );
  });
});

describe('what the composer is asked', () => {
  it('names the allowed components, the published paths, the handled actions, and the app', () => {
    const criteria = [
      {
        ...emptyCriterion(),
        name: 'Pass rate',
        kind: 'metric' as const,
        weight: 3,
        instructions: 'From the run.',
      },
    ];
    const [system, user] = composePrompt(
      {
        question: 'Which config?',
        alternatives: ['A', 'B'],
        criteria,
        components: ['Column', 'Text', 'Button'],
      },
      CATALOG,
    );
    expect(system.role).toBe('system');
    expect(system.content).toContain(
      'Use only these components: Column, Text, Button.',
    );
    for (const entry of INTERFACE_PATHS) {
      expect(system.content).toContain(`- ${entry.path}: `);
    }
    for (const action of INTERFACE_ACTIONS) {
      expect(system.content).toContain(`- ${action.name}: `);
    }
    expect(user.content).toContain('Question: Which config?');
    expect(user.content).toContain('Alternatives: A, B');
    expect(user.content).toContain(
      '- Pass rate (metric, weight 3): From the run.',
    );
    // With no components named, the default set that the catalog has.
    const [open] = composePrompt(
      { question: '', alternatives: [], criteria: [], components: [] },
      CATALOG,
    );
    expect(open.content).toContain(
      `Use only these components: ${DEFAULT_ALLOWED_COMPONENTS.join(', ')}.`,
    );
  });
});

describe('what the surface reads', () => {
  it('is the page’s state in words, at the published paths', () => {
    const criteria = [
      {
        ...emptyCriterion(),
        name: 'Pass rate',
        kind: 'metric' as const,
        weight: 3,
      },
      { ...emptyCriterion(), name: 'Notes', kind: 'noul' as const, weight: 0 },
    ];
    const data = surfaceData({
      question: 'Which config?',
      app: 'Ship or fix',
      chosen: 'B',
      criteria,
      alternatives: [
        {
          name: 'A',
          evidence: 'Three failures.',
          findings: ['Pass rate: 0.8'],
        },
        { name: 'B', evidence: '', findings: [] },
      ],
      ranking: [
        { name: 'B', score: 0.9, coverage: 1 },
        { name: 'A', score: null, coverage: 0.5 },
      ],
      known: 1,
      total: 2,
    });
    expect(data.question).toBe('Which config?');
    expect(data.first).toBe('B');
    expect(data.ranking).toBe('B 90% · A —');
    expect(data.coverage).toBe('1 of 2 findings in.');
    expect(data.criteria).toBe('Pass rate ×3 · Notes ×0');
    expect(data.alternatives).toEqual([
      {
        name: 'A',
        summary: 'Pass rate: 0.8',
        evidence: 'Three failures.',
        score: '—',
        rank: '2nd',
        isChosen: '',
      },
      {
        name: 'B',
        summary: 'Nothing found yet.',
        evidence: 'No evidence.',
        score: '90%',
        rank: '1st',
        isChosen: 'chosen',
      },
    ]);
    const messages = surfaceMessages(
      defaultInterface(),
      'app',
      'catalog',
      data,
    );
    expect(messages.map(message => Object.keys(message)[1])).toEqual([
      'createSurface',
      'updateComponents',
      'updateDataModel',
    ]);
  });
});
