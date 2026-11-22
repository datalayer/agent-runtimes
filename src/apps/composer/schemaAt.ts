/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Where a part is in a spec, and what its schema says of it — the
 * introspection the designer's property grid is drawn from.
 *
 * A spec — an application, a scene — comes with a JSON Schema generated from
 * agentspecs, every part of it a `$ref` into `$defs`. Given a path into the
 * spec (`['connections', 2]`, `['tests', 'cases', 0]`), this finds the schema
 * of what is there, through a reference, an object's properties, a list's
 * items, a map's values and `X | null`; reads the part; and writes it back,
 * copying only the containers on the way. A part made of some of an object's
 * keys (the agent: its name, its instructions, its goal) is a pick of them.
 *
 * Pure: no React, no network.
 *
 * @module apps/composer/schemaAt
 */

import type { JsonSchema } from '../../specs/appspecSchema';

/** A path into a spec: keys of objects, indexes of lists. */
export type SpecPath = readonly (string | number)[];

/** A part's schema, and the name of the model it is when it is one (`AppRule`). */
export type SchemaAt = { schema: JsonSchema; model?: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What a `$ref` names in the root's `$defs`, followed until it is not a reference. */
function followed(root: JsonSchema, schema: JsonSchema): SchemaAt {
  let current = schema;
  let model: string | undefined;
  for (let hops = 0; typeof current.$ref === 'string' && hops < 16; hops += 1) {
    model = current.$ref.split('/').pop();
    const found = model ? root.$defs?.[model] : undefined;
    if (!found) {
      return { schema: current, model };
    }
    current = found;
  }
  return { schema: current, model };
}

/** `X | null` is X, read as optional; any other union is left as it is. */
function nonNull(root: JsonSchema, schema: JsonSchema): SchemaAt {
  const branches = Array.isArray(schema.anyOf) ? schema.anyOf : undefined;
  if (branches) {
    const real = branches.filter(branch => branch.type !== 'null');
    if (real.length === 1) {
      return followed(root, real[0]);
    }
  }
  return followed(root, schema);
}

/** The schema of the part at a path, or undefined where the schema says nothing is. */
export function schemaAt(
  root: JsonSchema,
  path: SpecPath,
): SchemaAt | undefined {
  let here = nonNull(root, root);
  for (const step of path) {
    const { schema } = here;
    if (typeof step === 'number') {
      if (!schema.items) {
        return undefined;
      }
      here = nonNull(root, schema.items);
    } else if (schema.properties && step in schema.properties) {
      here = nonNull(root, schema.properties[step]);
    } else if (isObject(schema.additionalProperties)) {
      here = nonNull(root, schema.additionalProperties as JsonSchema);
    } else {
      return undefined;
    }
  }
  return here;
}

/**
 * A part's schema standing on its own: the root's `$defs` carried with it, so
 * that the references inside it resolve when it is drawn alone, and its
 * description kept as what the form says of it.
 */
export function standalone(root: JsonSchema, schema: JsonSchema): JsonSchema {
  return root.$defs ? { ...schema, $defs: root.$defs } : schema;
}

/** An object's schema reduced to some of its keys, in the order the schema gives them. */
export function picked(
  schema: JsonSchema,
  keys: readonly string[],
): JsonSchema {
  const properties = Object.fromEntries(
    Object.entries(schema.properties ?? {}).filter(([key]) =>
      keys.includes(key),
    ),
  );
  const required = Array.isArray(schema.required)
    ? (schema.required as string[]).filter(key => keys.includes(key))
    : [];
  return {
    ...schema,
    properties,
    ...(required.length ? { required } : { required: undefined }),
    additionalProperties: undefined,
  };
}

/** The part at a path; undefined where nothing is. */
export function valueAt(data: unknown, path: SpecPath): unknown {
  let here: unknown = data;
  for (const step of path) {
    if (typeof step === 'number') {
      here = Array.isArray(here) ? here[step] : undefined;
    } else {
      here = isObject(here) ? here[step] : undefined;
    }
    if (here === undefined) {
      return undefined;
    }
  }
  return here;
}

/** Some keys of an object, as a part of their own. */
export const pickedValue = (
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> =>
  isObject(value)
    ? Object.fromEntries(
        keys.filter(key => key in value).map(key => [key, value[key]]),
      )
    : {};

/**
 * The data with the part at a path replaced: every container on the way
 * copied, nothing beside it touched. A container missing on the way is made —
 * a list where the next step is an index, an object otherwise.
 */
export function withValueAt(
  data: unknown,
  path: SpecPath,
  value: unknown,
): unknown {
  if (!path.length) {
    return value;
  }
  const [step, ...rest] = path;
  if (typeof step === 'number') {
    const list = Array.isArray(data) ? [...data] : [];
    list[step] = withValueAt(list[step], rest, value);
    return list;
  }
  const object = isObject(data) ? { ...data } : {};
  object[step] = withValueAt(object[step], rest, value);
  return object;
}

/** The data with some keys of the object at a path replaced by a part's, the others kept. */
export function withPickedAt(
  data: unknown,
  path: SpecPath,
  keys: readonly string[],
  part: Record<string, unknown>,
): unknown {
  const here = valueAt(data, path);
  const kept = isObject(here)
    ? Object.fromEntries(
        Object.entries(here).filter(([key]) => !keys.includes(key)),
      )
    : {};
  return withValueAt(data, path, { ...kept, ...pickedValue(part, keys) });
}

/** Where a part is: a path into the document, and the keys it is made of when it is some of an object's. */
export type PartAt = { path: SpecPath; keys?: readonly string[] };

/** Fields a person writes sentences in, drawn as a box of lines rather than one line. */
const PROSE = new Set([
  'instructions',
  'prompt',
  'description',
  'expect',
  'ask',
  'brief',
  'goal',
  'line',
  'holds',
  'what',
]);

/**
 * The grid's uiSchema: no submit button (every change is kept as it is
 * made), a list's items without the index rjsf labels them with, and the
 * fields a person writes sentences in as boxes of lines.
 */
export function gridUiSchema(schema: JsonSchema): Record<string, unknown> {
  const ui: Record<string, unknown> = {
    'ui:submitButtonOptions': { norender: true },
  };
  for (const [name, field] of Object.entries(schema.properties ?? {})) {
    if (field.type === 'array') {
      ui[name] = { items: { 'ui:label': false } };
    } else if (PROSE.has(name)) {
      ui[name] = { 'ui:widget': 'textarea', 'ui:options': { rows: 3 } };
    }
  }
  return ui;
}

/** A part's schema and its value, as the grid draws them. */
export function partOf(
  root: JsonSchema,
  data: unknown,
  at: PartAt,
): { schema: JsonSchema; model?: string; value: unknown } | undefined {
  const found = schemaAt(root, at.path);
  if (!found) {
    return undefined;
  }
  const value = valueAt(data, at.path);
  if (at.keys) {
    return {
      schema: standalone(root, picked(found.schema, at.keys)),
      model: found.model,
      value: pickedValue(value, at.keys),
    };
  }
  return { schema: standalone(root, found.schema), model: found.model, value };
}

/** The document with a part replaced by what the grid holds. */
export const documentWith = (
  data: unknown,
  at: PartAt,
  value: unknown,
): unknown =>
  at.keys
    ? withPickedAt(
        data,
        at.path,
        at.keys,
        (value ?? {}) as Record<string, unknown>,
      )
    : withValueAt(data, at.path, value);
