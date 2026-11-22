/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the YAML editor knows of an Appspec: the fields it
 * may hold where the cursor is, the values a choice accepts, the ids a
 * reference names — agents and Cogs, MCP servers, models, Frames, Guards,
 * Gates, Tracks — what a field means, and on which line a problem is.
 *
 * A component of the surface (`interface.surface.components`) is completed
 * from the catalog of visual components: its `component` from the
 * catalog's ids, then its properties from that component's JSON Schema —
 * the schema its properties form is drawn from and the Canvas checks it
 * against — with their choices and their meanings.
 *
 * Read from the schema agentspecs publishes and the catalogues
 * agent-runtimes generates, so that what is completed is what the spec
 * accepts. Pure: the editor wires it into CodeMirror.
 *
 * @module apps/composer/appSpecLanguage
 */

import {
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  type Node as YamlNode,
} from 'yaml';
import { APPSPEC_SCHEMA, type JsonSchema } from '../../specs/appspecSchema';
import { AGENTSPECS } from '../../specs/agents';
import { TEAM_SPECS } from '../../specs/teams';
import { COG_CATALOGUE } from '../../specs/cogs';
import { MCP_SERVER_LIBRARY } from '../../specs/mcpServers';
import { AI_MODEL_CATALOGUE } from '../../specs/models';
import { FRAME_CATALOGUE } from '../../specs/frames';
import { GUARD_CATALOGUE } from '../../specs/guards';
import { GATE_CATALOGUE } from '../../specs/gates';
import { TRACK_CATALOGUE } from '../../specs/tracks';
import { SKILLS_CATALOG } from '../../specs/skills';
import { BACKEND_TOOL_CATALOG } from '../../specs/backendTools';
import { MEMORY_CATALOGUE } from '../../specs/memory';
import { NOTIFICATION_CATALOG } from '../../specs/notifications';
import { getComponent, listComponents } from '../../specs/ui';

/** A list item, in a path of keys. */
export const ITEM = '[]';

export type SpecContext = {
  /** The keys from the top to the mapping the cursor is in; `[]` for a list item. */
  path: string[];
  /** Writing a key, or the value of `key`. */
  mode: 'key' | 'value';
  key?: string;
  /** What is typed of the word, and where it starts. */
  prefix: string;
  from: number;
};

const indentOf = (line: string): number =>
  line.length - line.trimStart().length;

/** Where the cursor is in an Appspec's YAML. */
export function contextAt(text: string, offset: number): SpecContext {
  const before = text.slice(0, offset);
  const lines = before.split('\n');
  const current = lines[lines.length - 1];
  let indent = indentOf(current);
  const path: string[] = [];
  // A list item opens a mapping two columns further in.
  const item = /^(\s*)- ?/.exec(current);
  if (item) {
    path.unshift(ITEM);
    indent = item[0].length;
  }
  const body = item ? current.slice(item[0].length) : current.trimStart();
  const pair = /^([\w-]+):\s*(.*)$/.exec(body);
  let mode: SpecContext['mode'] = 'key';
  let key: string | undefined;
  let prefix = body;
  if (pair) {
    mode = 'value';
    key = pair[1];
    prefix = pair[2].replace(/^["']/, '');
  } else if (item && !/[\w-]*$/.test(body)) {
    prefix = '';
  }
  prefix = (/[^\s"'[\],]*$/.exec(prefix) ?? [''])[0];
  // Up the file: each line further out that opens a block names a parent.
  let need = item ? indentOf(current) + 1 : indent;
  for (let index = lines.length - 2; index >= 0 && need > 0; index -= 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith('#')) {
      continue;
    }
    const at = indentOf(line);
    if (at >= need) {
      continue;
    }
    const opened = /^\s*(- )?([\w-]+):\s*(#.*)?$/.exec(line);
    const listed = /^\s*- /.exec(line);
    if (opened) {
      path.unshift(opened[2]);
      if (opened[1]) {
        path.unshift(ITEM);
      }
    } else if (listed) {
      path.unshift(ITEM);
    }
    need = at + (listed && !opened ? 1 : 0);
    if (listed && !opened) {
      need = at;
    }
  }
  return { path, mode, key, prefix, from: offset - prefix.length };
}

/** The schema of what a reference points at, `$ref` and `anyOf` read through — in the Appspec's schema, or in another's (the scene's). */
export function concrete(
  node: JsonSchema | undefined,
  schema: JsonSchema = APPSPEC_SCHEMA,
): JsonSchema | undefined {
  let current = node;
  for (let guard = 0; current && guard < 8; guard += 1) {
    if (current.$ref) {
      const name = current.$ref.split('/').pop() ?? '';
      current = schema.$defs?.[name];
      continue;
    }
    if (current.anyOf) {
      current = current.anyOf.find(option => option.type !== 'null');
      continue;
    }
    return current;
  }
  return current;
}

/** The schema at a path of keys, or undefined where the spec has nothing: the Appspec's schema, or another's (the scene's). */
export function schemaAt(
  path: string[],
  schema: JsonSchema = APPSPEC_SCHEMA,
): JsonSchema | undefined {
  let node = concrete(schema, schema);
  for (const segment of path) {
    if (!node) {
      return undefined;
    }
    node =
      segment === ITEM
        ? concrete(node.items, schema)
        : concrete(node.properties?.[segment], schema);
  }
  return node;
}

/** The catalogue a reference field names, by the field's name and where it is. */
export function referencesFor(
  path: string[],
  key: string | undefined,
): string[] {
  const named = [...path, ...(key ? [key] : [])].filter(
    segment => segment !== ITEM,
  );
  const field = named[named.length - 1];
  const parent = named[named.length - 2];
  const ids = (catalogue: Record<string, unknown>) =>
    Object.keys(catalogue).sort();
  switch (field) {
    case 'agent':
      return [...ids(AGENTSPECS), ...ids(COG_CATALOGUE)];
    case 'team':
      return ids(TEAM_SPECS);
    case 'model':
      return ids(AI_MODEL_CATALOGUE);
    case 'server':
      return parent === 'connections' ? ids(MCP_SERVER_LIBRARY) : [];
    case 'context':
      return ids(FRAME_CATALOGUE);
    case 'skills':
      return ids(SKILLS_CATALOG);
    case 'backend_tools':
      return ids(BACKEND_TOOL_CATALOG);
    case 'guards':
      return ids(GUARD_CATALOGUE);
    case 'gates':
      return ids(GATE_CATALOGUE);
    case 'track':
      return ids(TRACK_CATALOGUE);
    case 'memory':
      return ids(MEMORY_CATALOGUE);
    case 'notifications':
      return ids(NOTIFICATION_CATALOG);
    default:
      return [];
  }
}

/** Where a component of the surface is written: an item of `interface.surface.components`. */
const COMPONENT_ITEM = ['interface', 'surface', 'components', ITEM];

const isComponentItem = (path: string[]): boolean =>
  path.length === COMPONENT_ITEM.length &&
  path.every((segment, index) => segment === COMPONENT_ITEM[index]);

/** The keys every component of a surface may take besides its own properties. */
const NODE_KEYS: Record<string, string> = {
  id: 'Its id on the surface, unique; root is where the surface starts.',
  component: 'The component, by its id in the catalog of visual components.',
  visible_when:
    'Shown only while the value at this path is true or not empty: {path: …}.',
  weight: 'Its share of the room in a Row or a Column.',
};

/** The catalog's component the list item at an offset names (`component: Table`), if any. */
export function componentAt(text: string, offset: number): string | undefined {
  const lines = text.split('\n');
  let line = text.slice(0, offset).split('\n').length - 1;
  // Up to the line that starts the item.
  let start = -1;
  for (let index = line; index >= 0; index -= 1) {
    if (/^\s*- /.test(lines[index])) {
      start = index;
      break;
    }
  }
  if (start < 0) {
    return undefined;
  }
  const inside = indentOf(lines[start]) + 2;
  for (line = start; line < lines.length; line += 1) {
    // The item ends where a line is written further out: the next item, or what follows the list.
    if (line > start && lines[line].trim() && indentOf(lines[line]) < inside) {
      break;
    }
    const named = /^\s*(?:- )?component:\s*["']?([\w-]+)/.exec(lines[line]);
    if (named) {
      return named[1];
    }
  }
  return undefined;
}

type FieldSchema = {
  type?: string;
  enum?: unknown[];
  title?: string;
  description?: string;
};

/** A component's own properties, from the catalog's JSON Schema. */
const fieldsOf = (id: string | undefined): Record<string, FieldSchema> => {
  const spec = id ? getComponent(id) : undefined;
  return (spec?.properties.properties ?? {}) as Record<string, FieldSchema>;
};

/** What a key of a component may be: its own properties, its bindings, its action, then every node's. */
function componentKeys(id: string | undefined): SpecCompletion[] {
  const spec = id ? getComponent(id) : undefined;
  const required = new Set((spec?.properties.required ?? []) as string[]);
  const own = Object.entries(fieldsOf(id)).map(([label, field]) => ({
    label,
    detail: field.enum
      ? field.enum.join(' | ')
      : field.type === 'array'
        ? 'list'
        : String(field.type ?? ''),
    info: `${field.title ? `${field.title}: ` : ''}${field.description ?? ''}${required.has(label) ? ' Required.' : ''}`,
    type: 'property' as const,
  }));
  const bound = spec?.bindings
    ? [...new Set([...spec.bindings.shows, ...spec.bindings.sends])].map(
        label => ({
          label,
          detail: '{path}',
          info: spec.bindings!.shows.includes(label)
            ? 'What it shows: {path: …}.'
            : 'Where what a person does is written: {path: …}.',
          type: 'property' as const,
        }),
      )
    : [];
  const action =
    spec && !('action' in fieldsOf(id)) && spec.events.length
      ? [
          {
            label: 'action',
            detail: 'mapping',
            info: 'What it dispatches: {event: {name, context}}.',
            type: 'property' as const,
          },
        ]
      : [];
  const node = Object.entries(NODE_KEYS)
    .filter(([label]) => id === undefined || label !== 'component')
    .map(([label, info]) => ({ label, info, type: 'property' as const }));
  return [...node, ...own, ...bound, ...action];
}

export type SpecCompletion = {
  label: string;
  detail?: string;
  info?: string;
  type: 'property' | 'enum' | 'constant';
};

/** What may be written where the cursor is, with references from the catalogues. */
export function completionsAt(
  text: string,
  offset: number,
): { from: number; options: SpecCompletion[] } {
  const context = contextAt(text, offset);
  if (isComponentItem(context.path)) {
    const id = componentAt(text, offset);
    if (context.mode === 'key') {
      return { from: context.from, options: componentKeys(id) };
    }
    if (context.key === 'component') {
      return {
        from: context.from,
        options: listComponents().map(spec => ({
          label: spec.id,
          detail: spec.name,
          info: spec.description,
          type: 'constant' as const,
        })),
      };
    }
    const choices = fieldsOf(id)[context.key ?? '']?.enum ?? [];
    return {
      from: context.from,
      options: choices.map(value => ({
        label: String(value),
        type: 'enum' as const,
      })),
    };
  }
  if (context.mode === 'key') {
    const node = schemaAt(context.path);
    const options = Object.entries(node?.properties ?? {}).map(
      ([label, prop]) => ({
        label,
        detail: describeType(prop),
        info: prop.description,
        type: 'property' as const,
      }),
    );
    // A list of references completes its items with the catalogue's ids.
    if (!options.length && context.path[context.path.length - 1] === ITEM) {
      const list = referencesFor(context.path, undefined);
      return {
        from: context.from,
        options: list.map(label => ({ label, type: 'constant' as const })),
      };
    }
    return { from: context.from, options };
  }
  const field = schemaAt([...context.path, context.key ?? '']);
  const choices = (field?.enum ?? []).filter(value => value !== '').map(String);
  const references = referencesFor(context.path, context.key);
  return {
    from: context.from,
    options: [
      ...choices.map(label => ({ label, type: 'enum' as const })),
      ...references.map(label => ({ label, type: 'constant' as const })),
    ],
  };
}

/** A field's kind in a word: its choices, `list`, `mapping`, or its type. */
export function describeType(
  prop: JsonSchema,
  schema: JsonSchema = APPSPEC_SCHEMA,
): string {
  const node = concrete(prop, schema);
  if (!node) {
    return '';
  }
  if (node.enum) {
    return node.enum.filter(value => value !== '').join(' | ');
  }
  return node.type === 'array'
    ? 'list'
    : node.type === 'object'
      ? 'mapping'
      : String(node.type ?? '');
}

/** What the key under the cursor means, or null. */
export function hoverAt(
  text: string,
  offset: number,
): { from: number; to: number; text: string } | null {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const lineEnd = text.indexOf('\n', offset);
  const line = text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
  const match = /^(\s*(?:- )?)([\w-]+):/.exec(line);
  if (!match) {
    return null;
  }
  const from = lineStart + match[1].length;
  const to = from + match[2].length;
  if (offset < from || offset > to) {
    return null;
  }
  const context = contextAt(text, from);
  if (isComponentItem(context.path)) {
    const field = fieldsOf(componentAt(text, from))[match[2]];
    const said = field
      ? `${field.title ? `${field.title}: ` : ''}${field.description ?? ''}`
      : NODE_KEYS[match[2]];
    return said ? { from, to, text: said } : null;
  }
  const prop = schemaAt([...context.path, match[2]]);
  const description =
    (context.path.length || match[1].includes('-')
      ? schemaAt(context.path)?.properties?.[match[2]]?.description
      : APPSPEC_SCHEMA.properties?.[match[2]]?.description) ??
    prop?.description;
  if (!description) {
    return null;
  }
  const kind = prop ? describeType(prop) : '';
  // The schema's descriptions are Markdown; a tooltip shows plain text.
  const plain = description.replace(/`/g, '');
  return {
    from,
    to,
    text:
      kind && !plain.includes(kind.split(' | ')[0])
        ? `${plain} — ${kind}`
        : plain,
  };
}

/**
 * The line a dotted path names, walked through the document: `stage.positions.sales.x`
 * is the `x` under `sales` under `positions` under `stage` — not the first
 * `x:` anywhere. A scene says `who:` on seventeen lines and `what:` on sixteen,
 * so the first one is rarely the one a refusal is about. Null when the path
 * leads nowhere in this text.
 */
function lineOfPath(text: string, segments: readonly string[]): number | null {
  let node: unknown;
  try {
    node = parseDocument(text).contents;
  } catch {
    return null;
  }
  let at: number | undefined;
  for (const segment of segments) {
    if (isMap(node)) {
      const pair = node.items.find(
        item => isScalar(item.key) && String(item.key.value) === segment,
      );
      if (!pair || !isScalar(pair.key)) {
        return null;
      }
      at = pair.key.range?.[0];
      node = pair.value;
    } else if (isSeq(node) && /^\d+$/.test(segment)) {
      const item = node.items[Number(segment)] as YamlNode | undefined;
      if (!item) {
        return null;
      }
      at = item.range?.[0];
      node = item;
    } else {
      return null;
    }
  }
  return at === undefined ? null : text.slice(0, at).split('\n').length;
}

/** The line a problem is about, 1-based, or null when it is about the whole. */
export function lineOfProblem(text: string, problem: string): number | null {
  const lines = text.split('\n');
  const numbered = /^Line (\d+):/.exec(problem);
  if (numbered) {
    return Number(numbered[1]);
  }
  /*
    A shape problem names its place — `connections.0.access: …` — and a
    scene's, agentspecs prefixes with the scene's id:
    `sales-accounting: stage.positions.sales.x: …`. Read as one path, that id
    leads nowhere, and every scene refusal was dropped from the editor while
    its panel listed them all (seen 2026-10-10). Each leading `a.b.c:` is
    tried as a path through the document, in order, and the first that leads
    somewhere is the line.
  */
  for (const [path] of problem.matchAll(
    /(?<=^|: )[\w-]+(?:\.[\w-]+)*(?=: )/g,
  )) {
    const line = lineOfPath(text, path.split('.'));
    if (line !== null) {
      return line;
    }
  }
  // A path the document does not hold, by the last key it names.
  const placed = /^([\w-]+(?:\.[\w-]+)*): /.exec(problem);
  if (placed) {
    const segments = placed[1].split('.');
    const last = [...segments]
      .reverse()
      .find(segment => !/^\d+$/.test(segment));
    if (last) {
      const index = lines.findIndex(line =>
        new RegExp(`^\\s*(- )?${last}:`).test(line),
      );
      if (index >= 0) {
        return index + 1;
      }
    }
  }
  // A reference problem names what does not resolve: “nowhere”.
  const named = /“([^”]+)”/.exec(problem);
  if (named) {
    const index = lines.findIndex(line => line.includes(named[1]));
    if (index >= 0) {
      return index + 1;
    }
  }
  /*
    agentspecs names a member in straight quotes — `member 'sales' talks to
    itself` — and the name may sit inside another (`sales` in
    `sales-accounting`), so it is found as a whole word: the first line that
    names it, which in a scene is where its cast puts it.
  */
  const quoted = /'([\w.:-]+)'/.exec(problem);
  if (quoted) {
    const whole = new RegExp(
      `(^|[^\\w-])${quoted[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w-]|$)`,
    );
    const index = lines.findIndex(line => whole.test(line));
    if (index >= 0) {
      return index + 1;
    }
  }
  return null;
}
