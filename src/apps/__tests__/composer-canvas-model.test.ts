/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** The Canvas's model of an application's surface. */

import { describe, expect, it } from 'vitest';
import { getComponent, listComponents } from '../../specs/ui';
import { getApp } from '../../specs/apps';
import { dumpAppspec, emptyAppspec } from '../apps/appspec';
import { APP_KIND_PATHS } from '../plugins/app-page/appPageModel';
import type { AppFormSchema, AppSpec } from '../../types/agentspecs';
import {
  INTERFACE_ACTIONS,
  INTERFACE_PATHS,
  KIND_INTERFACES,
  defaultInterface,
  interfaceFindings,
  kindInterface,
  type AppInterface,
} from '../composer/appInterface';
import { writeAppspecYaml } from '../apps/yaml';
import { readAppYaml } from '../composer/AppYamlEditor';
import { draftOfAppspec } from '../composer/draft';
import {
  actionOf,
  bindingChoices,
  showsList,
  bindingProperty,
  blocksInOrder,
  boundPath,
  canMoveInto,
  canvasTree,
  conditionChoices,
  conditionOf,
  hideBlock,
  insertBlock,
  labelOf,
  labelPlace,
  moveBlock,
  moveBy,
  newBlockId,
  ownPatch,
  ownValues,
  placeOf,
  removeBlock,
  sendChoices,
  sendsProperty,
  startSurface,
  targetFor,
  templateOf,
  twoWayChoices,
  surfaceOfDefinition,
  updateBlock,
  withSurface,
  writeAction,
  writeActionContext,
  writeBinding,
  writeCondition,
  writeLabel,
} from '../composer/canvasModel';

const CATALOG = listComponents().map(component => component.id);

/** root: [title, row: [a, b]], with a Button holding its label. */
const sample = (): AppInterface => ({
  ...startSurface(),
  components: [
    { id: 'root', component: 'Column', children: ['title', 'row', 'go'] },
    { id: 'title', component: 'Text', text: 'Hello' },
    { id: 'row', component: 'Row', children: ['a', 'b'] },
    { id: 'a', component: 'Text', text: 'A' },
    { id: 'b', component: 'Text', text: 'B' },
    { id: 'go', component: 'Button', child: 'go-label' },
    { id: 'go-label', component: 'Text', text: 'Go' },
  ],
});

/** An application of a kind, with the settings given. */
const appOf = (
  kind: AppSpec['kind'],
  settings: AppFormSchema = { type: 'object', properties: {} },
): AppSpec => {
  const app = emptyAppspec(kind);
  return { ...app, interface: { ...app.interface, settings } };
};

// Its settings are a form: one field, a choice.
const PLAN: AppFormSchema = {
  type: 'object',
  properties: {
    plan: {
      type: 'string',
      title: 'Plan',
      enum: ['Team', 'Business'],
      default: 'Team',
    },
  },
};

const ids = (surface: AppInterface) =>
  blocksInOrder(canvasTree(surface).root).map(block => block.id);

describe('the layout as a tree', () => {
  it('reads every component of the surface, placed, held, or hidden', () => {
    const surface = {
      ...sample(),
      components: [
        ...sample().components,
        { id: 'lost', component: 'Divider' },
      ],
    };
    const { root, hidden } = canvasTree(surface);
    expect(blocksInOrder(root).map(block => block.id)).toEqual([
      'root',
      'title',
      'row',
      'a',
      'b',
      'go',
      'go-label',
    ]);
    expect(root?.children.find(block => block.id === 'row')?.container).toBe(
      true,
    );
    expect(
      root?.children.find(block => block.id === 'go')?.children[0],
    ).toMatchObject({ id: 'go-label', placed: false });
    expect(hidden.map(block => block.id)).toEqual(['lost']);
    expect(canvasTree(null)).toEqual({ root: null, hidden: [] });
  });

  it('reads the default decision interface whole, its template included', () => {
    const surface = defaultInterface();
    const { root, hidden } = canvasTree(surface);
    expect(blocksInOrder(root)).toHaveLength(surface.components.length);
    expect(hidden).toEqual([]);
  });
});

describe('placing blocks', () => {
  it('drops a new block into a container at an index, with a new id and what it is made of', () => {
    const first = insertBlock(sample(), 'Text', { parent: 'row', index: 1 });
    expect(first.id).toBe('text');
    expect(placeOf(first.surface, 'text')).toEqual({ parent: 'row', index: 1 });
    const button = insertBlock(first.surface, 'Button', {
      parent: 'root',
      index: 99,
    });
    expect(button.id).toBe('button');
    expect(button.surface.components.slice(-2)).toEqual([
      { id: 'button', component: 'Button', child: 'button-label' },
      { id: 'button-label', component: 'Text', text: 'Button' },
    ]);
    expect(placeOf(button.surface, 'button')).toEqual({
      parent: 'root',
      index: 3,
    });
    expect(newBlockId(button.surface, 'Text')).toBe('text-2');
    expect(newBlockId(button.surface, 'FileUpload')).toBe('file-upload');
  });

  it('adds without a drag into the selected container, after the selected block, or at the end', () => {
    expect(targetFor(sample(), 'row')).toEqual({ parent: 'row', index: 2 });
    expect(targetFor(sample(), 'title')).toEqual({ parent: 'root', index: 1 });
    expect(targetFor(sample(), 'go-label')).toEqual({
      parent: 'root',
      index: 3,
    });
    expect(targetFor(sample(), null)).toEqual({ parent: 'root', index: 3 });
    const textRoot = {
      ...startSurface(),
      components: [{ id: 'root', component: 'Text', text: 'x' }],
    };
    expect(() => targetFor(textRoot, null)).toThrow(
      'root is a Text, which does not take blocks dropped into it.',
    );
  });

  it('starts a component of Datalayer own from its example', () => {
    const table = getComponent('Table')!;
    const { surface, id } = insertBlock(
      startSurface(),
      'Table',
      { parent: 'root', index: 0 },
      table,
    );
    expect(surface.components.find(node => node.id === id)).toEqual({
      id: 'table',
      component: 'Table',
      ...table.example,
    });
  });

  it('refuses a drop into what takes no blocks', () => {
    expect(() =>
      insertBlock(sample(), 'Text', { parent: 'title', index: 0 }),
    ).toThrow('title is a Text, which does not take blocks dropped into it.');
  });

  it('moves a block between containers, and never into itself', () => {
    const moved = moveBlock(sample(), 'title', { parent: 'row', index: 2 });
    expect(ids(moved)).toEqual([
      'root',
      'row',
      'a',
      'b',
      'title',
      'go',
      'go-label',
    ]);
    // Only the two lists changed, in place: the spec's diff is the move.
    expect(moved.components.map(node => node.id)).toEqual(
      sample().components.map(node => node.id),
    );
    expect(canMoveInto(sample(), 'row', 'row')).toBe(false);
    expect(() =>
      moveBlock(sample(), 'row', { parent: 'row', index: 0 }),
    ).toThrow('row cannot go inside itself.');
    expect(() =>
      moveBlock(sample(), 'go-label', { parent: 'root', index: 0 }),
    ).toThrow('go-label is part of go: move go.');
    expect(() =>
      moveBlock(sample(), 'root', { parent: 'row', index: 0 }),
    ).toThrow('The root holds the layout');
  });

  it('moves a block up and down in its container, and stays at an end', () => {
    expect(ids(moveBy(sample(), 'b', -1))).toEqual([
      'root',
      'title',
      'row',
      'b',
      'a',
      'go',
      'go-label',
    ]);
    expect(moveBy(sample(), 'b', 1)).toEqual(sample());
    expect(moveBy(sample(), 'title', -1)).toEqual(sample());
    expect(() => moveBy(sample(), 'go-label', 1)).toThrow(
      'go-label is not in a list on the layout',
    );
  });

  it('removes a block and what is under it, and keeps the root', () => {
    const removed = removeBlock(sample(), 'row');
    expect(removed.components.map(node => node.id)).toEqual([
      'root',
      'title',
      'go',
      'go-label',
    ]);
    expect(removed.components[0].children).toEqual(['title', 'go']);
    expect(removeBlock(sample(), 'go').components.map(node => node.id)).toEqual(
      ['root', 'title', 'row', 'a', 'b'],
    );
    expect(() => removeBlock(sample(), 'root')).toThrow(
      'The root holds the layout: it is not removed.',
    );
    expect(() => removeBlock(sample(), 'go-label')).toThrow(
      'go-label is part of go: remove go.',
    );
  });

  it('hides a block off the layout, and puts it back where it is dropped', () => {
    const hidden = hideBlock(sample(), 'a');
    expect(canvasTree(hidden).hidden.map(block => block.id)).toEqual(['a']);
    expect(hidden.components.find(node => node.id === 'a')).toEqual({
      id: 'a',
      component: 'Text',
      text: 'A',
    });
    const shown = moveBlock(hidden, 'a', { parent: 'root', index: 0 });
    expect(ids(shown)[1]).toBe('a');
  });
});

describe('a block properties', () => {
  it('are changed, and taken away, but never its place in the tree', () => {
    const next = updateBlock(sample(), 'title', {
      variant: 'h2',
      text: undefined,
    });
    expect(next.components[1]).toEqual({
      id: 'title',
      component: 'Text',
      variant: 'h2',
    });
    expect(() => updateBlock(sample(), 'row', { children: [] })).toThrow(
      "A block's children is changed on the layout",
    );
  });

  it('are those its schema declares, written when they differ from the default', () => {
    const table = getComponent('Table')!;
    const node = {
      id: 't',
      component: 'Table',
      columns: ['a'],
      page_size: 50,
      other: 1,
    };
    expect(ownValues(node, table)).toEqual({ columns: ['a'], page_size: 50 });
    expect(
      ownPatch(table, { columns: ['a'], page_size: 20, title: '' }),
    ).toEqual({
      title: undefined,
      columns: ['a'],
      page_size: undefined,
      selectable: undefined,
    });
  });

  it('have a label where a person reads it', () => {
    const surface = insertBlock(
      sample(),
      'Table',
      { parent: 'root', index: 0 },
      getComponent('Table')!,
    ).surface;
    expect(labelPlace(surface, 'title')).toEqual({
      block: 'title',
      property: 'text',
    });
    expect(labelPlace(surface, 'go')).toEqual({
      block: 'go-label',
      property: 'text',
    });
    expect(labelPlace(surface, 'table', getComponent('Table'))).toEqual({
      block: 'table',
      property: 'title',
    });
    const row = labelPlace(surface, 'row');
    expect(row).toEqual({
      block: 'row',
      property: 'label',
      accessibility: true,
    });
    const labelled = writeLabel(surface, row, 'Two letters');
    expect(
      labelled.components.find(node => node.id === 'row')?.accessibility,
    ).toEqual({ label: 'Two letters' });
    expect(labelOf(labelled, row)).toBe('Two letters');
    expect(
      writeLabel(labelled, row, '').components.find(node => node.id === 'row'),
    ).not.toHaveProperty('accessibility');
    expect(
      labelOf(writeLabel(surface, labelPlace(surface, 'go'), 'Start'), {
        block: 'go-label',
        property: 'text',
      }),
    ).toBe('Start');
  });

  it('bind to what the application publishes, chosen in words', () => {
    expect(
      bindingChoices(kindInterface(appOf('chat'))).map(choice => choice.path),
    ).toEqual(['/app', '/question', '/answer', '/status']);
    const choices = bindingChoices(kindInterface());
    expect(choices.find(choice => choice.path === '/question')?.words).toBe(
      'The question the app answers.',
    );
    expect(choices.some(choice => choice.path === '/alternatives')).toBe(false);
    const node = sample().components[1];
    expect(bindingProperty(node)).toBe('text');
    expect(
      bindingProperty({ id: 'r', component: 'Row', children: [] }),
    ).toBeNull();
    expect(
      bindingProperty({ id: 't', component: 'Table' }, getComponent('Table')),
    ).toBe('rows');
    const bound = writeBinding(sample(), 'title', 'text', '/question');
    expect(boundPath(bound.components[1], 'text')).toBe('/question');
    expect(writeBinding(bound, 'title', 'text', '').components[1]).toEqual({
      id: 'title',
      component: 'Text',
      text: 'Text',
    });
  });
});

describe('every change checked where it is made', () => {
  it('says a problem on the block it is about', () => {
    const surface = insertBlock(startSurface(), 'Table', {
      parent: 'root',
      index: 0,
    }).surface;
    const findings = interfaceFindings(surface, [], CATALOG, {
      app: appOf('chat'),
      componentSpec: getComponent,
    });
    expect(findings).toEqual([
      { id: 'table', problem: 'table is a Table without its columns.' },
    ]);
    expect(
      interfaceFindings(
        writeBinding(sample(), 'title', 'text', '/ranking'),
        [],
        CATALOG,
        { app: appOf('chat') },
      ),
    ).toEqual([
      {
        id: 'title',
        problem: 'title reads /ranking, which the app does not publish.',
      },
    ]);
    const bound = writeBinding(sample(), 'title', 'text', '/question');
    expect(
      interfaceFindings(bound, [], CATALOG, { app: appOf('chat') }),
    ).toEqual([]);
    expect(interfaceFindings(bound, [], CATALOG)).toEqual([
      {
        id: null,
        problem:
          'Nothing in the interface lets the user choose an alternative.',
      },
    ]);
  });

  it('checks every property against its JSON Schema, with the validator its form uses', () => {
    const placed = insertBlock(startSurface(), 'Table', {
      parent: 'root',
      index: 0,
    }).surface;
    const check = (patch: Record<string, unknown>) =>
      interfaceFindings(updateBlock(placed, 'table', patch), [], CATALOG, {
        app: appOf('chat'),
        componentSpec: getComponent,
      });
    expect(check({ columns: ['model'], page_size: 20 })).toEqual([]);
    expect(check({ columns: ['model'], page_size: 0 })).toEqual([
      { id: 'table', problem: "table's rows per page must be at least 1." },
    ]);
    expect(
      check({ columns: ['model'], page_size: 2.5, selectable: 'yes' }),
    ).toEqual([
      { id: 'table', problem: "table's rows per page must be a whole number." },
      { id: 'table', problem: "table's selectable must be yes or no." },
    ]);
    // Bound, a property is a path, checked as one; empty, it is said once, as missing.
    expect(
      check({ columns: { path: '/columns' } }).map(finding => finding.problem),
    ).toEqual(['table reads /columns, which the app does not publish.']);
    expect(check({ columns: [] })).toEqual([
      { id: 'table', problem: 'table is a Table without its columns.' },
    ]);
    const chart = insertBlock(startSurface(), 'Chart', {
      parent: 'root',
      index: 0,
    }).surface;
    expect(
      interfaceFindings(
        updateBlock(chart, 'chart', { kind: 'pie', x: 'model', y: 'cost' }),
        [],
        CATALOG,
        {
          app: appOf('chat'),
          componentSpec: getComponent,
        },
      ),
    ).toEqual([
      {
        id: 'chart',
        problem: "chart's kind must be one of bar, line, scatter, area.",
      },
    ]);
    // A standard component's properties too, against the catalog's own schema.
    const text = insertBlock(startSurface(), 'Text', {
      parent: 'root',
      index: 0,
    }).surface;
    const said = (patch: Record<string, unknown>) =>
      interfaceFindings(updateBlock(text, 'text', patch), [], CATALOG, {
        app: appOf('chat'),
        componentSpec: getComponent,
      }).filter(finding => finding.id === 'text');
    expect(said({ text: 'Hello', variant: 'h2' })).toEqual([]);
    expect(said({ text: 'Hello', variant: 'huge' })).toEqual([
      {
        id: 'text',
        problem:
          "text's style must be one of h1, h2, h3, h4, h5, caption, body.",
      },
    ]);
  });
});

describe('what each kind gives its layout and takes from it', () => {
  it('is, for a decision, what its run page publishes, takes and handles', () => {
    const decision = kindInterface(appOf('decision'));
    expect(decision.publishes).toBe(INTERFACE_PATHS);
    expect(decision.accepts.map(entry => entry.path)).toEqual(['/chosen']);
    expect(decision.actions).toBe(INTERFACE_ACTIONS);
    expect(kindInterface()).toBe(decision);
    expect(KIND_INTERFACES.decision).toBe(decision);
  });

  it('is, for a chat, a widget or a worker, what the runtime’s page of it publishes, takes and handles', () => {
    for (const kind of ['chat', 'widget', 'worker'] as const) {
      expect(KIND_INTERFACES[kind]).toBe(APP_KIND_PATHS[kind]);
    }
    const names = (kind: AppSpec['kind']) =>
      kindInterface(appOf(kind)).actions.map(action => action.name);
    expect([names('chat'), names('widget'), names('worker')]).toEqual([
      ['send', 'stop', 'new'],
      ['run', 'upload', 'stop'],
      ['send', 'stop'],
    ]);
    // Its settings are shown and sent at /inputs/<id>, for a chat and a widget; a worker has none.
    const widget = kindInterface(appOf('widget', PLAN));
    expect(bindingChoices(widget)).toContainEqual({
      path: '/output',
      words: 'What it gave',
    });
    expect(bindingChoices(widget)).toContainEqual({
      path: '/inputs/plan',
      words: 'Plan',
    });
    // A widget takes a file upload's files too; a chat publishes its conversation, a list.
    expect(sendChoices(widget)).toEqual([
      { path: '/files', words: 'The files given' },
      { path: '/inputs/plan', words: 'Plan' },
    ]);
    expect(
      kindInterface(appOf('chat')).publishes.find(
        entry => entry.path === '/messages',
      )?.list,
    ).toBe(true);
    expect(
      sendChoices(kindInterface(appOf('chat', PLAN))).map(
        choice => choice.path,
      ),
    ).toEqual(['/draft', '/inputs/plan']);
    expect(
      sendChoices(kindInterface(appOf('worker', PLAN))).map(
        choice => choice.path,
      ),
    ).toEqual(['/draft']);
    // A Send or Run button may say its message, and needs not.
    const sending = writeAction(
      sample(),
      'go',
      'send',
      kindInterface(appOf('chat')),
    );
    expect(
      interfaceFindings(sending, [], CATALOG, { app: appOf('chat') }),
    ).toEqual([]);
  });

  it('takes the catalogue’s Quote Calculator as it is', () => {
    const quote = getApp('quote-calculator')!;
    expect(quote.kind).toBe('widget');
    const surface = quote.interface.surface as unknown as AppInterface;
    expect(
      interfaceFindings(surface, quote.interface.components, CATALOG, {
        app: quote,
        componentSpec: getComponent,
      }),
    ).toEqual([]);
    expect(
      sendChoices(kindInterface(quote)).map(choice => choice.path),
    ).toEqual(['/files', '/inputs/seats', '/inputs/plan', '/inputs/term']);
  });

  it('offers a list to a property that shows one, and only to it', () => {
    const chat = kindInterface(appOf('chat'));
    // A Chat's messages are the conversation; a Table's rows, a Chart's points, a list too.
    expect(showsList('Chat', 'messages')).toBe(true);
    expect(showsList('Table', 'rows')).toBe(true);
    expect(
      bindingChoices(chat, undefined, true).map(choice => choice.path),
    ).toContain('/messages');
    // Lists only: no single value is offered to a list.
    expect(
      bindingChoices(chat, undefined, true).every(
        choice =>
          chat.publishes.find(entry => entry.path === choice.path)?.list,
      ),
    ).toBe(true);
    // A property that shows one value is offered values, never a list.
    expect(showsList('Text', 'text')).toBe(false);
    expect(showsList('Form', 'values')).toBe(false);
    expect(bindingChoices(chat).map(choice => choice.path)).not.toContain(
      '/messages',
    );
    expect(
      bindingChoices(kindInterface(), undefined, true).map(
        choice => choice.path,
      ),
    ).toEqual(['/alternatives']);
    // Every component of the catalogue that shows something says whether it is a list.
    for (const component of listComponents().filter(
      one => !one.standard && one.bindings?.shows.length,
    )) {
      for (const property of component.bindings!.shows) {
        expect([
          component.id,
          property,
          typeof showsList(component.id, property),
        ]).toEqual([component.id, property, 'boolean']);
      }
    }
    expect(() => showsList('Table', 'points')).toThrow(
      'Table shows nothing through “points”',
    );
    // Bound on the Canvas, a Chat block reads the conversation.
    const bound = writeBinding(
      {
        ...sample(),
        components: [...sample().components, { id: 'talk', component: 'Chat' }],
      },
      'talk',
      'messages',
      '/messages',
    );
    expect(
      boundPath(
        bound.components.find(node => node.id === 'talk')!,
        'messages',
      ),
    ).toBe('/messages');
  });

  it('offers what an item says only inside the List that repeats it', () => {
    const surface = defaultInterface();
    expect(templateOf(surface, 'alternative-name')?.id).toBe('alternatives');
    expect(templateOf(surface, 'question')).toBeNull();
    const outside = bindingChoices(kindInterface(), {
      surface,
      id: 'question',
    }).map(choice => choice.path);
    const inside = bindingChoices(kindInterface(), {
      surface,
      id: 'alternative-name',
    }).map(choice => choice.path);
    expect(outside).toContain('/ranking');
    expect(outside).not.toContain('name');
    expect(inside).toEqual(
      expect.arrayContaining(['/ranking', 'name', 'score']),
    );
    expect([...outside, ...inside]).not.toContain('/alternatives');
    // An input shows and sends through its value: what is published, then what is taken, each once.
    const both = twoWayChoices(kindInterface(), {
      surface,
      id: 'question',
    }).map(choice => choice.path);
    expect(both.filter(path => path === '/chosen')).toHaveLength(1);
  });

  it('shows a block on a condition chosen from what the app publishes, checked like a binding', () => {
    const surface = defaultInterface();
    const outside = conditionChoices(kindInterface(), {
      surface,
      id: 'question',
    }).map(choice => choice.path);
    const inside = conditionChoices(kindInterface(), {
      surface,
      id: 'alternative-name',
    }).map(choice => choice.path);
    // A list too: shown while it has items. Each path once.
    expect(outside).toEqual(
      expect.arrayContaining(['/chosen', '/alternatives']),
    );
    expect(outside.filter(path => path === '/chosen')).toHaveLength(1);
    expect(outside).not.toContain('isChosen');
    expect(inside).toContain('isChosen');
    const shown = writeCondition(surface, 'alternative-name', 'isChosen');
    const node = shown.components.find(
      component => component.id === 'alternative-name',
    )!;
    expect(node.visible_when).toEqual({ path: 'isChosen' });
    expect(conditionOf(node)).toBe('isChosen');
    expect(interfaceFindings(shown, [], CATALOG)).toEqual(
      interfaceFindings(surface, [], CATALOG),
    );
    // What the app does not publish is a problem on the block.
    const unknown = writeCondition(surface, 'question', '/nowhere');
    expect(interfaceFindings(unknown, [], CATALOG)).toContainEqual({
      id: 'question',
      problem: 'question reads /nowhere, which the app does not publish.',
    });
    // Always: the key goes.
    const always = writeCondition(shown, 'alternative-name', '');
    expect(always.components).toEqual(surface.components);
    expect(() => writeCondition(surface, 'root', '/chosen')).toThrow(/root/);
  });

  it('knows what a block shows through and what it sends through', () => {
    expect(sendsProperty({ id: 'f', component: 'TextField' })).toBe('value');
    expect(bindingProperty({ id: 'f', component: 'TextField' })).toBe('value');
    expect(
      sendsProperty({ id: 't', component: 'Table' }, getComponent('Table')),
    ).toBe('selected');
    expect(
      sendsProperty(
        { id: 'u', component: 'FileUpload' },
        getComponent('FileUpload'),
      ),
    ).toBe('files');
    expect(
      bindingProperty(
        { id: 'u', component: 'FileUpload' },
        getComponent('FileUpload'),
      ),
    ).toBeNull();
    expect(
      sendsProperty({ id: 'c', component: 'Chart' }, getComponent('Chart')),
    ).toBeNull();
    expect(sendsProperty({ id: 'x', component: 'Text' })).toBeNull();
    expect(sendsProperty({ id: 'b', component: 'Button' })).toBeNull();
  });

  it('writes where a block sends, and checks it is taken', () => {
    const placed = insertBlock(
      startSurface(),
      'Table',
      { parent: 'root', index: 0 },
      getComponent('Table'),
    ).surface;
    const sent = writeBinding(placed, 'table', 'selected', '/chosen');
    expect(sent.components.find(node => node.id === 'table')?.selected).toEqual(
      { path: '/chosen' },
    );
    const check = (surface: AppInterface, kind: AppSpec['kind']) =>
      interfaceFindings(surface, [], CATALOG, {
        app: appOf(kind),
        componentSpec: getComponent,
      }).filter(finding => finding.id === 'table');
    expect(check(sent, 'decision')).toEqual([]);
    expect(
      check(writeBinding(placed, 'table', 'selected', '/question'), 'decision'),
    ).toEqual([
      {
        id: 'table',
        problem: 'table sends to /question, which the app does not take.',
      },
    ]);
    expect(check(sent, 'chat')).toEqual([
      {
        id: 'table',
        problem: 'table sends to /chosen, which the app does not take.',
      },
    ]);
    // Sending nowhere takes the key away.
    expect(
      writeBinding(sent, 'table', 'selected', '').components.find(
        node => node.id === 'table',
      ),
    ).not.toHaveProperty('selected');
  });

  it('writes what a button does, chosen from what the app handles, and checks what it sends with it', () => {
    const check = (surface: AppInterface, kind: AppSpec['kind'] = 'decision') =>
      interfaceFindings(surface, [], CATALOG, { app: appOf(kind) }).filter(
        finding => finding.id === 'go',
      );
    const choosing = writeAction(sample(), 'go', 'choose', kindInterface());
    expect(
      actionOf(choosing.components.find(node => node.id === 'go')!),
    ).toEqual({ name: 'choose', context: {} });
    expect(check(choosing)).toEqual([
      {
        id: 'go',
        problem: 'go dispatches choose without the alternative it chooses.',
      },
    ]);
    const said = writeActionContext(choosing, 'go', 'alternative', '/chosen');
    expect(said.components.find(node => node.id === 'go')?.action).toEqual({
      event: { name: 'choose', context: { alternative: { path: '/chosen' } } },
    });
    expect(check(said)).toEqual([]);
    // Another action keeps only what it takes; nothing takes the action away.
    const saving = writeAction(said, 'go', 'save', kindInterface());
    expect(saving.components.find(node => node.id === 'go')?.action).toEqual({
      event: { name: 'save' },
    });
    expect(
      writeAction(saving, 'go', '', kindInterface()).components.find(
        node => node.id === 'go',
      ),
    ).not.toHaveProperty('action');
    expect(check(saving, 'chat')).toEqual([
      {
        id: 'go',
        problem: 'go dispatches save, which the app does not handle.',
      },
    ]);
    expect(() =>
      writeActionContext(sample(), 'go', 'alternative', '/chosen'),
    ).toThrow('go does nothing yet');
  });
});

describe('one spec for the Canvas and the YAML', () => {
  const YAML = [
    'schema: agent.app/v1',
    'id: helper',
    'version: 0.0.1',
    'name: Helper',
    'kind: chat',
    '# Who answers.',
    'agent: datalayer-ai',
    'interface:',
    '  surface:',
    '    components:',
    '      - id: root',
    '        component: Column',
    '        children: []',
    '',
  ].join('\n');

  it('writes a block dropped on the Canvas into the text, comments kept', () => {
    const read = readAppYaml(YAML);
    expect(read.app).not.toBeNull();
    const definition = {
      ...draftOfAppspec(dumpAppspec(read.app!)),
      source: YAML,
    };
    const surface = surfaceOfDefinition(definition)!;
    expect(surface.components).toEqual([
      { id: 'root', component: 'Column', children: [] },
    ]);
    const placed = insertBlock(
      surface,
      'Table',
      { parent: 'root', index: 0 },
      getComponent('Table'),
    ).surface;
    const next = withSurface(definition, placed);
    const text = writeAppspecYaml(next.spec!, YAML);
    expect(text).toContain('# Who answers.');
    expect(text).toContain('component: Table');
    // And the text reads back as the surface the Canvas made.
    expect(
      surfaceOfDefinition(draftOfAppspec(dumpAppspec(readAppYaml(text).app!)))
        ?.components,
    ).toEqual(placed.components);
  });

  it('writes what a block sends and what a button does into the text, and reads them back', () => {
    const definition = {
      ...draftOfAppspec(dumpAppspec(readAppYaml(YAML).app!)),
      source: YAML,
    };
    let surface = insertBlock(
      surfaceOfDefinition(definition)!,
      'Table',
      { parent: 'root', index: 0 },
      getComponent('Table'),
    ).surface;
    surface = writeBinding(surface, 'table', 'selected', '/chosen');
    surface = insertBlock(surface, 'Button', {
      parent: 'root',
      index: 1,
    }).surface;
    surface = writeActionContext(
      writeAction(surface, 'button', 'choose', kindInterface()),
      'button',
      'alternative',
      '/chosen',
    );
    const next = withSurface(definition, surface);
    const text = writeAppspecYaml(next.spec!, YAML);
    expect(text).toContain('# Who answers.');
    expect(text).toContain('selected:');
    expect(text).toContain('name: choose');
    const back = surfaceOfDefinition(
      draftOfAppspec(dumpAppspec(readAppYaml(text).app!)),
    )!;
    expect(back.components).toEqual(surface.components);
  });
});
