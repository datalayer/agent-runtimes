/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A scene's shape, refused as `loop` refuses it (plans/STUDIO.md S-10).
 *
 * agentspecs reads a scene with pydantic, which refuses a scene of the wrong
 * shape — a list where a word is written, a choice that is none of its
 * choices, a field the spec does not have — before any of agentspecs' own
 * rules is read: they are all `after` validators. And it says *every* issue
 * pydantic finds, joined by `; `, as `where: message`, or `where is missing`,
 * or `where is not a field of the spec`, after the scene's id.
 *
 * An editor had none of this. It accepted `audience.who: nobody-at-all` and
 * `rehearsal.within: soon`, which `loop` refuses, and a cast written as one
 * word made its reader throw (seen 2026-10-10). This walks the scene's
 * generated JSON Schema (`specs/sceneSchema`) over the text as agentspecs
 * spells it and says pydantic's sentences, in pydantic's order; the table
 * recorded from agentspecs holds it to them (`scene-checks.test.ts`).
 *
 * What it covers is what the scene's schema uses: types, required fields,
 * closed objects, choices, patterns, bounds, and `X | null`.
 *
 * @module apps/apps/sceneShape
 */

import type { JsonSchema } from '../../specs/appspecSchema';
import { SCENE_SCHEMA } from '../../specs/sceneSchema';
import { sectionOfKey, type SceneProblem } from './sceneChecks';

type Issue = {
  loc: readonly (string | number)[];
  kind: 'said' | 'missing' | 'extra';
  message?: string;
};

const DEFS = (SCENE_SCHEMA.$defs ?? {}) as Record<string, JsonSchema>;

/**
 * Field names pydantic also takes for an alias (`populate_by_name`): the
 * schema names `schema` and `as`, the model `schema_` and `shown_as`.
 */
const FIELD_NAMES: Readonly<Record<string, string>> = {
  schema_: 'schema',
  shown_as: 'as',
};

const isMapping = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A value as Python prints it in a choice: `'browser'`. */
const python = (value: unknown): string =>
  typeof value === 'string'
    ? `'${value}'`
    : value === null
      ? 'None'
      : typeof value === 'boolean'
        ? value
          ? 'True'
          : 'False'
        : String(value);

/** pydantic's list of choices: `'a'`, `'a' or 'b'`, `'a', 'b' or 'c'`. */
const choices = (values: readonly unknown[]): string =>
  values.length <= 1
    ? values.map(python).join('')
    : `${values.slice(0, -1).map(python).join(', ')} or ${python(values[values.length - 1])}`;

/** The definition a `$ref` names, and its name. */
const resolved = (
  schema: JsonSchema,
): { schema: JsonSchema; model?: string } => {
  if (typeof schema.$ref === 'string') {
    const model = schema.$ref.split('/').pop() ?? '';
    return { schema: DEFS[model] ?? {}, model };
  }
  return { schema };
};

const said = (loc: Issue['loc'], message: string): Issue[] => [
  { loc, kind: 'said', message },
];

/** A number as pydantic reads one in lax mode, or why it does not. */
function numberIssue(value: unknown, integer: boolean): string | undefined {
  if (typeof value === 'boolean') {
    return undefined;
  }
  if (typeof value === 'number') {
    return integer && !Number.isInteger(value)
      ? 'Input should be a valid integer, got a number with a fractional part'
      : undefined;
  }
  if (typeof value === 'string') {
    const read = Number(value.trim());
    if (value.trim() === '' || Number.isNaN(read)) {
      return integer
        ? 'Input should be a valid integer, unable to parse string as an integer'
        : 'Input should be a valid number, unable to parse string as a number';
    }
    return integer && !Number.isInteger(read)
      ? 'Input should be a valid integer, unable to parse string as an integer'
      : undefined;
  }
  return integer
    ? 'Input should be a valid integer'
    : 'Input should be a valid number';
}

function issuesOf(
  given: JsonSchema,
  value: unknown,
  loc: Issue['loc'],
): Issue[] {
  // `X | null`: nothing is fine, anything else is read as X.
  if (Array.isArray(given.anyOf)) {
    const branches = given.anyOf.filter(branch => branch.type !== 'null');
    if (value === null && branches.length < given.anyOf.length) {
      return [];
    }
    if (branches.length === 1) {
      return issuesOf(branches[0], value, loc);
    }
  }
  const { schema, model } = resolved(given);
  if (Array.isArray(schema.enum)) {
    return schema.enum.includes(value as never)
      ? []
      : said(loc, `Input should be ${choices(schema.enum)}`);
  }
  switch (schema.type) {
    case 'object':
      return objectIssues(schema, model, value, loc);
    case 'array': {
      if (!Array.isArray(value)) {
        return said(loc, 'Input should be a valid list');
      }
      const items = schema.items;
      return items
        ? value.flatMap((item, index) => issuesOf(items, item, [...loc, index]))
        : [];
    }
    case 'string': {
      if (typeof value !== 'string') {
        return said(loc, 'Input should be a valid string');
      }
      const pattern = schema.pattern;
      return typeof pattern === 'string' && !new RegExp(pattern).test(value)
        ? said(loc, `String should match pattern '${pattern}'`)
        : [];
    }
    case 'number':
    case 'integer': {
      const wrong = numberIssue(value, schema.type === 'integer');
      if (wrong) {
        return said(loc, wrong);
      }
      const read = Number(value);
      if (typeof schema.minimum === 'number' && read < schema.minimum) {
        return said(
          loc,
          `Input should be greater than or equal to ${schema.minimum}`,
        );
      }
      if (typeof schema.maximum === 'number' && read > schema.maximum) {
        return said(
          loc,
          `Input should be less than or equal to ${schema.maximum}`,
        );
      }
      return [];
    }
    case 'boolean':
      return typeof value === 'boolean'
        ? []
        : said(loc, 'Input should be a valid boolean');
    default:
      return [];
  }
}

function objectIssues(
  schema: JsonSchema,
  model: string | undefined,
  value: unknown,
  loc: Issue['loc'],
): Issue[] {
  if (!isMapping(value)) {
    return said(
      loc,
      model
        ? `Input should be a valid dictionary or instance of ${model}`
        : 'Input should be a valid dictionary',
    );
  }
  const properties = schema.properties;
  if (!properties) {
    // A mapping of one kind of thing: `positions`, each a place.
    const each = schema.additionalProperties;
    return typeof each === 'object' && each !== null
      ? Object.entries(value).flatMap(([key, item]) =>
          issuesOf(each as JsonSchema, item, [...loc, key]),
        )
      : [];
  }
  const given = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [FIELD_NAMES[key] ?? key, item]),
  );
  const required = Array.isArray(schema.required)
    ? (schema.required as string[])
    : [];
  // Each field in the model's order, then what the model has no field for.
  const issues = Object.entries(properties).flatMap(([key, field]) =>
    key in given
      ? issuesOf(field, given[key], [...loc, key])
      : required.includes(key)
        ? [{ loc: [...loc, key], kind: 'missing' as const }]
        : [],
  );
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(given)) {
      if (!(key in properties)) {
        issues.push({ loc: [...loc, key], kind: 'extra' });
      }
    }
  }
  return issues;
}

/** One issue as agentspecs says it (`_sentences`). */
const sentence = (issue: Issue): string => {
  const where = issue.loc.join('.');
  if (issue.kind === 'missing') {
    return `${where} is missing`;
  }
  if (issue.kind === 'extra') {
    return `${where} is not a field of the spec`;
  }
  return where ? `${where}: ${issue.message}` : (issue.message ?? '');
};

/**
 * What `loop` says of a scene's shape — every issue, after the scene's id —
 * filed under the part of the scene its first issue is about; nothing when
 * the shape is right. `data` is the text read as plain data, in agentspecs'
 * spelling.
 */
export function sceneShapeSays(data: unknown): SceneProblem | undefined {
  const issues = issuesOf(SCENE_SCHEMA, data, []);
  if (!issues.length) {
    return undefined;
  }
  const id =
    isMapping(data) && 'id' in data
      ? python(data.id).replace(/^'|'$/g, '')
      : 'the scene';
  const first = String(issues[0].loc[0] ?? '');
  return {
    says: `${id}: ${issues.map(sentence).join('; ')}`,
    section: sectionOfKey(first),
  };
}
