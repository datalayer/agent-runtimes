/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Canvas's model of an application's surface, and
 * what its blocks are bound to, chosen from what the application's kind
 * gives and takes.
 *
 * The surface is what the Appspec holds: A2UI's flat list of components,
 * each naming the ones it holds by id, from `root`. The Canvas does not keep
 * a second copy of it. Every operation here takes a surface and gives the
 * next one, touching only the components it is about, in place in the list,
 * so that the spec it writes changes where the layout did and nowhere else
 * (the same Canvas writes the same YAML). The tree a builder sees is
 * read from the list each time ({@link canvasTree}).
 *
 * A block is placed when it is in a container's `children` list (a Row, a
 * Column, a List). A block a component holds another way — a Card's body, a
 * Button's label, a tab, a Modal's trigger — is part of that component: it is
 * shown inside it, and moves and goes with it. A block in no list and held by
 * nothing is hidden: kept in the application, off the layout.
 *
 * Pure: no React, no network. What cannot be done says why, as a sentence.
 *
 * @module apps/composer/canvasModel
 */

import { VISIBLE_WHEN } from '../../components/a2ui/visibility';
import type { ComponentSpec } from '../../types/agentspecs';
import type { AppDraft } from './draft';
import {
  INTERFACE_PROTOCOL,
  ROOT_ID,
  STANDARD_INPUTS,
  childIds,
  type AppInterface,
  type InterfaceComponent,
  type InterfacePath,
  type KindInterface,
} from './appInterface';

/** Where a block goes: into a container's children, at an index. */
export type CanvasPlace = { parent: string; index: number };

/** A block as the Canvas shows it, with what it holds. */
export type CanvasBlock = {
  id: string;
  component: string;
  /** It takes blocks dropped into it: its `children` is a list. */
  container: boolean;
  /** It is in a container's list, and so can be moved and removed on its own. */
  placed: boolean;
  /** The blocks it holds, in order: its children, then what it holds otherwise. */
  children: CanvasBlock[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Whether a component takes blocks dropped into it. */
export const isContainer = (node: InterfaceComponent): boolean =>
  Array.isArray(node.children);

/** The surface a Canvas starts from: an empty column, the root. */
export function startSurface(): AppInterface {
  return {
    protocol: INTERFACE_PROTOCOL,
    composedBy: 'canvas',
    composedAt: '',
    components: [{ id: ROOT_ID, component: 'Column', children: [] }],
  };
}

const nodeOf = (surface: AppInterface, id: string): InterfaceComponent => {
  const node = surface.components.find(component => component.id === id);
  if (!node) {
    throw new Error(`The layout has no block named ${id}.`);
  }
  return node;
};

/** The container whose list a block is in, and where; `null` when it is in none. */
export function placeOf(surface: AppInterface, id: string): CanvasPlace | null {
  for (const node of surface.components) {
    if (Array.isArray(node.children)) {
      const index = node.children.indexOf(id);
      if (index >= 0) {
        return { parent: node.id, index };
      }
    }
  }
  return null;
}

/** The component that holds a block otherwise than in a list (a Card's body, a Button's label). */
const holderOf = (
  surface: AppInterface,
  id: string,
): InterfaceComponent | undefined =>
  surface.components.find(
    node =>
      !(Array.isArray(node.children) && node.children.includes(id)) &&
      childIds(node).includes(id),
  );

/** A block and every block under it, by id. */
export function subtreeOf(surface: AppInterface, id: string): Set<string> {
  const byId = new Map(surface.components.map(node => [node.id, node]));
  const found = new Set<string>();
  const visit = (at: string) => {
    if (found.has(at)) {
      return;
    }
    found.add(at);
    const node = byId.get(at);
    if (node) {
      childIds(node).forEach(visit);
    }
  };
  visit(id);
  return found;
}

/**
 * The layout as a tree from `root`, and the blocks that are off it (hidden,
 * or held by nothing). Every component of the surface is in one of the two:
 * the Canvas shows the whole spec.
 */
export function canvasTree(surface: AppInterface | null): {
  root: CanvasBlock | null;
  hidden: CanvasBlock[];
} {
  if (!surface) {
    return { root: null, hidden: [] };
  }
  const byId = new Map(surface.components.map(node => [node.id, node]));
  const seen = new Set<string>();
  const build = (id: string, placed: boolean): CanvasBlock | null => {
    const node = byId.get(id);
    if (!node || seen.has(id)) {
      return null;
    }
    seen.add(id);
    const listed = Array.isArray(node.children)
      ? node.children.filter((c): c is string => typeof c === 'string')
      : [];
    const held = childIds(node).filter(child => !listed.includes(child));
    return {
      id,
      component: node.component,
      container: isContainer(node),
      placed,
      children: [
        ...listed.map(child => build(child, true)),
        ...held.map(child => build(child, false)),
      ].filter((block): block is CanvasBlock => block !== null),
    };
  };
  const root = build(ROOT_ID, false);
  const referenced = new Set(surface.components.flatMap(childIds));
  const hidden = surface.components
    .filter(node => !seen.has(node.id) && !referenced.has(node.id))
    .map(node => build(node.id, false))
    .filter((block): block is CanvasBlock => block !== null);
  return { root, hidden };
}

/** Every block of the tree, in reading order. */
export function blocksInOrder(block: CanvasBlock | null): CanvasBlock[] {
  return block ? [block, ...block.children.flatMap(blocksInOrder)] : [];
}

/** An id for a new block of a component, that no block has: `table`, `table-2`. */
export function newBlockId(surface: AppInterface, component: string): string {
  const base = component.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const taken = new Set(surface.components.map(node => node.id));
  if (!taken.has(base)) {
    return base;
  }
  let n = 2;
  while (taken.has(`${base}-${n}`)) {
    n += 1;
  }
  return `${base}-${n}`;
}

/**
 * The components a new block of a component is made of: itself, from its
 * example when the catalog gives one, and what it holds — a Button its
 * label, a Card a column to drop into, a Modal what opens it and what it shows.
 */
export function newBlock(
  surface: AppInterface,
  component: string,
  spec?: ComponentSpec,
): InterfaceComponent[] {
  const id = newBlockId(surface, component);
  const held = (suffix: string): string => {
    let at = `${id}-${suffix}`;
    let n = 2;
    while (surface.components.some(node => node.id === at)) {
      at = `${id}-${suffix}-${n}`;
      n += 1;
    }
    return at;
  };
  const name = spec?.name ?? component;
  switch (component) {
    case 'Row':
    case 'Column':
    case 'List':
      return [{ id, component, children: [] }];
    case 'Text':
      return [{ id, component, text: 'Text' }];
    case 'Button': {
      const label = held('label');
      return [
        { id, component, child: label },
        { id: label, component: 'Text', text: 'Button' },
      ];
    }
    case 'Card': {
      const body = held('body');
      return [
        { id, component, child: body },
        { id: body, component: 'Column', children: [] },
      ];
    }
    case 'Modal': {
      const trigger = held('open');
      const content = held('content');
      return [
        { id, component, trigger, content },
        { id: trigger, component: 'Text', text: 'Open' },
        { id: content, component: 'Column', children: [] },
      ];
    }
    case 'Tabs': {
      const first = held('first');
      return [
        { id, component, tabs: [{ title: 'First', child: first }] },
        { id: first, component: 'Column', children: [] },
      ];
    }
    case 'Image':
    case 'Video':
    case 'AudioPlayer':
      return [{ id, component, url: '' }];
    case 'Icon':
      return [{ id, component, name: 'info' }];
    case 'TextField':
      return [{ id, component, label: name }];
    case 'CheckBox':
      return [{ id, component, label: name, value: false }];
    case 'ChoicePicker':
      return [{ id, component, label: name, options: [], value: [] }];
    case 'Slider':
      return [{ id, component, label: name, min: 0, max: 100, value: 0 }];
    case 'DateTimeInput':
      return [{ id, component, label: name, value: '', enableDate: true }];
    default:
      return [
        {
          id,
          component,
          ...(spec?.example ? JSON.parse(JSON.stringify(spec.example)) : {}),
        },
      ];
  }
}

const withComponents = (
  surface: AppInterface,
  components: InterfaceComponent[],
): AppInterface => ({
  ...surface,
  components,
});

/** The surface with a container's children list replaced. */
const withChildren = (
  components: InterfaceComponent[],
  parent: string,
  children: string[],
): InterfaceComponent[] =>
  components.map(node => (node.id === parent ? { ...node, children } : node));

const listOf = (surface: AppInterface, parent: string): string[] => {
  const node = nodeOf(surface, parent);
  if (!Array.isArray(node.children)) {
    throw new Error(
      `${parent} is a ${node.component}, which does not take blocks dropped into it.`,
    );
  }
  return node.children.filter(
    (child): child is string => typeof child === 'string',
  );
};

const clamp = (index: number, length: number): number =>
  Math.max(0, Math.min(index, length));

/**
 * A new block of a component, placed in a container at an index: its id is
 * new, and the components it is made of are added at the end of the list.
 */
export function insertBlock(
  surface: AppInterface,
  component: string,
  at: CanvasPlace,
  spec?: ComponentSpec,
): { surface: AppInterface; id: string } {
  const children = listOf(surface, at.parent);
  const made = newBlock(surface, component, spec);
  const id = made[0].id;
  const next = [...children];
  next.splice(clamp(at.index, children.length), 0, id);
  return {
    surface: withComponents(surface, [
      ...withChildren(surface.components, at.parent, next),
      ...made,
    ]),
    id,
  };
}

/**
 * Where a block added without a drag goes: into the selected block
 * when it takes blocks, after it when it is in a list, and otherwise at the
 * end of the layout.
 */
export function targetFor(
  surface: AppInterface,
  selected: string | null,
): CanvasPlace {
  const node = selected
    ? surface.components.find(component => component.id === selected)
    : undefined;
  if (node && isContainer(node)) {
    return { parent: node.id, index: (node.children as unknown[]).length };
  }
  const place = selected ? placeOf(surface, selected) : null;
  if (place) {
    return { parent: place.parent, index: place.index + 1 };
  }
  return { parent: ROOT_ID, index: listOf(surface, ROOT_ID).length };
}

/** Whether a block can go into a container: not into itself, nor into what it holds. */
export function canMoveInto(
  surface: AppInterface,
  id: string,
  parent: string,
): boolean {
  return !subtreeOf(surface, id).has(parent);
}

/**
 * A block moved to a place: out of the list it is in, into the container's,
 * at the index the container's list has once it is out. A hidden block is
 * put back on the layout this way.
 */
export function moveBlock(
  surface: AppInterface,
  id: string,
  to: CanvasPlace,
): AppInterface {
  if (id === ROOT_ID) {
    throw new Error('The root holds the layout: it does not move.');
  }
  nodeOf(surface, id);
  if (holderOf(surface, id)) {
    throw new Error(
      `${id} is part of ${holderOf(surface, id)!.id}: move ${holderOf(surface, id)!.id}.`,
    );
  }
  if (!canMoveInto(surface, id, to.parent)) {
    throw new Error(`${id} cannot go inside itself.`);
  }
  listOf(surface, to.parent);
  const from = placeOf(surface, id);
  let components = surface.components;
  if (from) {
    components = withChildren(
      components,
      from.parent,
      listOf(surface, from.parent).filter(child => child !== id),
    );
  }
  const target = (
    components.find(node => node.id === to.parent)!.children as string[]
  ).filter((child): child is string => typeof child === 'string');
  const next = [...target];
  next.splice(clamp(to.index, target.length), 0, id);
  return withComponents(surface, withChildren(components, to.parent, next));
}

/**
 * A block one place up or down in its container; at an end, it stays. The
 * keyboard's and the click's way of doing what a drag does.
 */
export function moveBy(
  surface: AppInterface,
  id: string,
  delta: -1 | 1,
): AppInterface {
  const from = placeOf(surface, id);
  if (!from) {
    throw new Error(
      `${id} is not in a list on the layout: it moves with what holds it.`,
    );
  }
  const length = listOf(surface, from.parent).length;
  const index = from.index + delta;
  if (index < 0 || index >= length) {
    return surface;
  }
  return moveBlock(surface, id, { parent: from.parent, index });
}

/** A block taken off the layout and kept in the application: hidden. */
export function hideBlock(surface: AppInterface, id: string): AppInterface {
  const from = placeOf(surface, id);
  if (!from) {
    throw new Error(`${id} is not on the layout: there is nothing to hide.`);
  }
  return withComponents(
    surface,
    withChildren(
      surface.components,
      from.parent,
      listOf(surface, from.parent).filter(child => child !== id),
    ),
  );
}

/**
 * A block removed, and every block under it. A block another one holds
 * otherwise than in a list goes with it, and the root stays.
 */
export function removeBlock(surface: AppInterface, id: string): AppInterface {
  if (id === ROOT_ID) {
    throw new Error('The root holds the layout: it is not removed.');
  }
  nodeOf(surface, id);
  const holder = holderOf(surface, id);
  if (holder) {
    throw new Error(`${id} is part of ${holder.id}: remove ${holder.id}.`);
  }
  const gone = subtreeOf(surface, id);
  const components = surface.components
    .filter(node => !gone.has(node.id))
    .map(node =>
      Array.isArray(node.children) &&
      node.children.some(child => gone.has(child as string))
        ? {
            ...node,
            children: node.children.filter(child => !gone.has(child as string)),
          }
        : node,
    );
  return withComponents(surface, components);
}

/**
 * A block's properties changed: a value set, or a key taken away when its
 * value is `undefined`. Its id, its component and what it holds stay.
 */
export function updateBlock(
  surface: AppInterface,
  id: string,
  patch: Record<string, unknown>,
): AppInterface {
  nodeOf(surface, id);
  for (const key of [
    'id',
    'component',
    'children',
    'child',
    'tabs',
    'trigger',
    'content',
  ]) {
    if (key in patch) {
      throw new Error(
        `A block's ${key} is changed on the layout, not as a property.`,
      );
    }
  }
  return withComponents(
    surface,
    surface.components.map(node => {
      if (node.id !== id) {
        return node;
      }
      const next: InterfaceComponent = { ...node };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) {
          delete next[key];
        } else {
          next[key] = value;
        }
      }
      return next;
    }),
  );
}

/** A component's properties as its own form edits them: those its schema declares. */
export function ownValues(
  node: InterfaceComponent,
  spec: ComponentSpec,
): Record<string, unknown> {
  const fields = Object.keys(
    (spec.properties?.properties ?? {}) as Record<string, unknown>,
  );
  return Object.fromEntries(
    fields
      .filter(name => node[name] !== undefined)
      .map(name => [name, node[name]]),
  );
}

/**
 * The patch that writes a form's values on a block: each property its schema
 * declares, set when it differs from its default and is not empty, and taken
 * away otherwise — so that a block says what was chosen and nothing more.
 */
export function ownPatch(
  spec: ComponentSpec,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const fields = (spec.properties?.properties ?? {}) as Record<
    string,
    { default?: unknown }
  >;
  return Object.fromEntries(
    Object.keys(fields).map(name => {
      const value = values[name];
      const unset =
        value === undefined ||
        value === '' ||
        JSON.stringify(value) === JSON.stringify(fields[name]?.default);
      return [name, unset ? undefined : value];
    }),
  );
}

/** The A2UI property that holds the words a person reads on a standard component. */
const STANDARD_LABELS: Record<string, string> = {
  Text: 'text',
  TextField: 'label',
  CheckBox: 'label',
  ChoicePicker: 'label',
  Slider: 'label',
  DateTimeInput: 'label',
};

/** Where a block's label is written: the block, a property of it. */
export type LabelPlace = {
  block: string;
  property: string;
  accessibility?: boolean;
};

/**
 * Where a block's label is: the words a person reads on it — a Text's text,
 * an input's label, a Button's label (the Text it holds), the title of a
 * component of Datalayer's own — or, on what shows no words, what a screen
 * reader says of it (`accessibility.label`).
 */
export function labelPlace(
  surface: AppInterface,
  id: string,
  spec?: ComponentSpec,
): LabelPlace {
  const node = nodeOf(surface, id);
  if (node.component === 'Button' && typeof node.child === 'string') {
    const label = surface.components.find(other => other.id === node.child);
    if (label?.component === 'Text') {
      return { block: label.id, property: 'text' };
    }
  }
  const standard = STANDARD_LABELS[node.component];
  if (standard) {
    return { block: id, property: standard };
  }
  const fields = (
    spec && !spec.standard ? (spec.properties?.properties ?? {}) : {}
  ) as Record<string, unknown>;
  for (const property of ['label', 'title']) {
    if (property in fields) {
      return { block: id, property };
    }
  }
  return { block: id, property: 'label', accessibility: true };
}

/** A block's label as it reads; empty when it is bound rather than written. */
export function labelOf(surface: AppInterface, place: LabelPlace): string {
  const node = nodeOf(surface, place.block);
  const value = place.accessibility
    ? isRecord(node.accessibility)
      ? node.accessibility.label
      : undefined
    : node[place.property];
  return typeof value === 'string' ? value : '';
}

/** Whether a block's label is bound to data rather than written. */
export function labelIsBound(
  surface: AppInterface,
  place: LabelPlace,
): boolean {
  const node = nodeOf(surface, place.block);
  const value = place.accessibility
    ? isRecord(node.accessibility)
      ? node.accessibility.label
      : undefined
    : node[place.property];
  return isRecord(value);
}

/** The surface with a block's label written; an empty one is taken away. */
export function writeLabel(
  surface: AppInterface,
  place: LabelPlace,
  words: string,
): AppInterface {
  if (!place.accessibility) {
    // A standard component's words are required of it; a property of
    // Datalayer's own left empty is not written.
    const standard = Boolean(
      STANDARD_LABELS[nodeOf(surface, place.block).component],
    );
    return updateBlock(surface, place.block, {
      [place.property]: words === '' && !standard ? undefined : words,
    });
  }
  const node = nodeOf(surface, place.block);
  const accessibility = {
    ...(isRecord(node.accessibility) ? node.accessibility : {}),
  };
  if (words) {
    accessibility.label = words;
  } else {
    delete accessibility.label;
  }
  return updateBlock(surface, place.block, {
    accessibility: Object.keys(accessibility).length
      ? accessibility
      : undefined,
  });
}

/** The A2UI property a standard component shows its data in. */
const STANDARD_BINDINGS: Record<string, string> = {
  Text: 'text',
  Image: 'url',
  Video: 'url',
  AudioPlayer: 'url',
  TextField: 'value',
  CheckBox: 'value',
  ChoicePicker: 'value',
  Slider: 'value',
  DateTimeInput: 'value',
};

/**
 * The property a block shows its data through: what a standard component
 * shows, or the first thing a component of Datalayer's own shows; `null` for
 * one that shows nothing it is given (a Row, a Divider, a File upload).
 */
export function bindingProperty(
  node: InterfaceComponent,
  spec?: ComponentSpec,
): string | null {
  const standard = STANDARD_BINDINGS[node.component];
  if (standard) {
    return standard;
  }
  if (spec && !spec.standard && spec.bindings) {
    return spec.bindings.shows[0] ?? null;
  }
  return null;
}

/**
 * The property a block sends what a person does through: an input's value
 * (the one it shows), or the first thing a component of Datalayer's own
 * sends — a Table's chosen row, a File upload's files; `null` for one that
 * sends nothing.
 */
export function sendsProperty(
  node: InterfaceComponent,
  spec?: ComponentSpec,
): string | null {
  if (STANDARD_INPUTS.includes(node.component)) {
    return 'value';
  }
  if (spec && !spec.standard && spec.bindings) {
    return spec.bindings.sends[0] ?? null;
  }
  return null;
}

/** One thing a block can be bound to, in the words a builder reads. */
export type BindingChoice = { path: string; words: string };

/**
 * The template a block is inside, if any: the List that repeats it for each
 * item of a list the application publishes. Inside it, a path without a
 * leading `/` reads the item.
 */
export function templateOf(
  surface: AppInterface,
  id: string,
): InterfaceComponent | null {
  for (const node of surface.components) {
    const children = node.children;
    if (
      isRecord(children) &&
      typeof children.componentId === 'string' &&
      subtreeOf(surface, children.componentId).has(id)
    ) {
      return node;
    }
  }
  return null;
}

const asChoices = (entries: InterfacePath[]): BindingChoice[] =>
  entries.map(entry => ({
    path: entry.path,
    words: entry.words ?? entry.meaning,
  }));

/**
 * What each of Datalayer's own components shows through the property it is
 * bound by (`bindings.shows`): a list — rows, points, messages, sources — or
 * one value. The catalogue's JSON Schema describes what a builder sets, not
 * what a block is bound to, so it is said here, for every component of the
 * catalogue that shows something (`canvasModel.spec` holds it to the
 * catalogue). A standard component shows one value.
 */
export const SHOWN_LISTS: Readonly<
  Record<string, Readonly<Record<string, 'list' | 'value'>>>
> = {
  Table: { rows: 'list' },
  Chart: { points: 'list' },
  Chat: { messages: 'list' },
  Evidence: { sources: 'list' },
  Form: { values: 'value' },
};

/** Whether a block's bound property shows a list (a Table's rows, a Chat's messages), not one value. */
export function showsList(component: string, property: string | null): boolean {
  if (!property) {
    return false;
  }
  const own = SHOWN_LISTS[component];
  if (!own) {
    return false;
  }
  const takes = own[property];
  if (!takes) {
    throw new Error(
      `${component} shows nothing through “${property}”: what it shows is ${Object.keys(own).join(', ')}.`,
    );
  }
  return takes === 'list';
}

/**
 * What a block can show: the data the application publishes to
 * its surface, in plain words (`kindInterface`). A property that shows a
 * list — a Table's rows, a Chat's messages — is offered the lists, and only
 * them; any other property one value, never a list (a List repeats over a
 * list, it does not show it). What an item says is offered only to a block
 * inside the List that repeats it, when the block is given.
 */
export function bindingChoices(
  gives: KindInterface,
  at?: { surface: AppInterface; id: string },
  list = false,
): BindingChoice[] {
  const inside = at ? templateOf(at.surface, at.id) !== null : true;
  return asChoices(
    gives.publishes.filter(
      entry =>
        Boolean(entry.list) === list && (inside || entry.path.startsWith('/')),
    ),
  );
}

/**
 * Where what a block sends can go: what the application takes from
 * its surface, in plain words. An application that takes nothing gives an
 * empty list.
 */
export function sendChoices(gives: KindInterface): BindingChoice[] {
  return asChoices(gives.accepts);
}

/**
 * What a block both shows and sends through one property (an input's
 * value, a Form's values) can be bound to: what is published, then what is
 * taken, each once.
 */
export function twoWayChoices(
  gives: KindInterface,
  at?: { surface: AppInterface; id: string },
): BindingChoice[] {
  const shown = bindingChoices(gives, at);
  return [
    ...shown,
    ...sendChoices(gives).filter(
      choice => !shown.some(other => other.path === choice.path),
    ),
  ];
}

/** The path a block's binding (or an action's context) reads; empty when it is bound to nothing. */
export function boundPath(
  node: Record<string, unknown>,
  property: string | null,
): string {
  const value = property ? node[property] : undefined;
  return isRecord(value) && typeof value.path === 'string' ? value.path : '';
}

/** What a standard component's bound property is when it is bound to nothing. */
const UNBOUND: Record<string, unknown> = {
  Text: 'Text',
  Image: '',
  Video: '',
  AudioPlayer: '',
  TextField: '',
  CheckBox: false,
  ChoicePicker: [],
  Slider: 0,
  DateTimeInput: '',
};

/**
 * The surface with a block bound to a path, or unbound (`''`): a standard
 * component's property then takes back the value a new block starts with,
 * and a component of Datalayer's own loses the key.
 */
export function writeBinding(
  surface: AppInterface,
  id: string,
  property: string,
  path: string,
): AppInterface {
  const node = nodeOf(surface, id);
  if (path) {
    return updateBlock(surface, id, { [property]: { path } });
  }
  if (!isRecord(node[property])) {
    return surface;
  }
  return updateBlock(surface, id, { [property]: UNBOUND[node.component] });
}

/**
 * What a block can be shown on: what the application publishes or
 * takes, in plain words — a list too, shown on while it has items. What an
 * item says is offered only to a block inside the List that repeats it, when
 * the block is given.
 */
export function conditionChoices(
  gives: KindInterface,
  at?: { surface: AppInterface; id: string },
): BindingChoice[] {
  const inside = at ? templateOf(at.surface, at.id) !== null : true;
  const entries = [...gives.publishes, ...gives.accepts].filter(
    entry => inside || entry.path.startsWith('/'),
  );
  return asChoices(
    entries.filter(
      (entry, index) =>
        entries.findIndex(other => other.path === entry.path) === index,
    ),
  );
}

/** The path a block is shown on; empty when it is always shown. */
export const conditionOf = (node: InterfaceComponent): string =>
  boundPath(node, VISIBLE_WHEN);

/**
 * The surface with a block shown only while what the application publishes
 * at a path is there — `true`, or not empty — or always (`''`). Written as
 * `visible_when`, which Datalayer's renderer reads around any block: A2UI has
 * no visibility of its own.
 */
export function writeCondition(
  surface: AppInterface,
  id: string,
  path: string,
): AppInterface {
  if (id === ROOT_ID) {
    throw new Error('The root holds the layout: it is always shown.');
  }
  return updateBlock(surface, id, {
    [VISIBLE_WHEN]: path ? { path } : undefined,
  });
}

/** What a Button does: the action it dispatches, and what it sends with it. */
export type BlockAction = { name: string; context: Record<string, unknown> };

/** The action a block dispatches; `null` when it does nothing. */
export function actionOf(node: InterfaceComponent): BlockAction | null {
  const action = node.action;
  if (
    isRecord(action) &&
    isRecord(action.event) &&
    typeof action.event.name === 'string'
  ) {
    return {
      name: action.event.name,
      context: isRecord(action.event.context)
        ? { ...action.event.context }
        : {},
    };
  }
  return null;
}

/**
 * The surface with a block dispatching an action, as A2UI writes it
 * (`action.event`), or doing nothing (`''`). What its context carried is
 * kept for the keys the new action takes, and dropped for the others.
 */
export function writeAction(
  surface: AppInterface,
  id: string,
  name: string,
  gives: KindInterface,
): AppInterface {
  const node = nodeOf(surface, id);
  if (!name) {
    return updateBlock(surface, id, { action: undefined });
  }
  const takes =
    gives.actions.find(action => action.name === name)?.context ?? [];
  const before = actionOf(node)?.context ?? {};
  const context = Object.fromEntries(
    takes
      .filter(key => before[key] !== undefined)
      .map(key => [key, before[key]]),
  );
  return updateBlock(surface, id, {
    action: {
      event: Object.keys(context).length ? { name, context } : { name },
    },
  });
}

/**
 * The surface with what a block's action sends under a key bound to a path
 * the application publishes or takes, or taken away (`''`).
 */
export function writeActionContext(
  surface: AppInterface,
  id: string,
  key: string,
  path: string,
): AppInterface {
  const action = actionOf(nodeOf(surface, id));
  if (!action) {
    throw new Error(`${id} does nothing yet: choose what it does first.`);
  }
  const context = { ...action.context };
  if (path) {
    context[key] = { path };
  } else {
    delete context[key];
  }
  return updateBlock(surface, id, {
    action: {
      event: Object.keys(context).length
        ? { name: action.name, context }
        : { name: action.name },
    },
  });
}

/**
 * The surface a definition holds: its interface, which reading the Appspec
 * fills from `interface.surface` for every kind of application.
 */
export const surfaceOfDefinition = (
  definition: AppDraft,
): AppInterface | null => definition.interface;

/**
 * A definition with its surface replaced — in the interface the decision
 * form writes the spec from, and in the spec another kind is written from —
 * so that the Canvas, the form and the YAML stay one spec.
 */
export function withSurface<D extends AppDraft>(
  definition: D,
  surface: AppInterface | null,
): D {
  if (!definition.spec) {
    return { ...definition, interface: surface };
  }
  const ui = { ...definition.spec.interface };
  if (surface) {
    ui.surface = {
      protocol: surface.protocol,
      components: surface.components,
      composedBy: surface.composedBy,
      composedAt: surface.composedAt,
    };
  } else {
    delete ui.surface;
  }
  return {
    ...definition,
    interface: surface,
    spec: { ...definition.spec, interface: ui },
  };
}
