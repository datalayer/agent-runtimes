/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Components a developer writes (LOOP P-17): an A2UI component of one
 * application only, declared in its Appspec (`interface.custom_components`)
 * with its name, its properties as a JSON Schema, what it shows and sends,
 * and the address of the built ES module that draws it.
 *
 * Reviewed like any component of the catalog — what agentspecs refuses is
 * refused here in the same sentences — and listed beside the catalog's for
 * that application alone (`appComponents`): the catalog grows for it, it
 * does not open. How it is drawn, in a sandboxed frame of no origin, is
 * `components/a2ui/custom`.
 *
 * @module loop/apps/customComponents
 */

import { getComponent } from '../../specs/uiPlugins';
import type {
  AppCustomComponentSpec,
  AppSpec,
  ComponentSpec,
} from '../../types/agentspecs';

/** Its name: a word starting with a capital letter, as the catalog's are named. */
export const CUSTOM_COMPONENT_NAME = /^[A-Z][A-Za-z0-9]{0,63}$/;

/** What one of its properties may be typed: what the renderer tells apart. */
export const CUSTOM_PROPERTY_TYPES = [
  'string',
  'integer',
  'number',
  'boolean',
  'array',
  'object',
] as const;

/** What every component of a surface already has, and a custom one cannot declare. */
export const CUSTOM_RESERVED_NAMES = [
  'id',
  'component',
  'action',
  'weight',
  'visible_when',
  'children',
  'child',
] as const;

/**
 * Where its module is loaded from: an address served over HTTPS, or this
 * machine while it is written. A file of the application's folder waits for
 * its packaging (P-29).
 */
export const CUSTOM_SOURCE =
  /^(?:https:\/\/[A-Za-z0-9.-]+(?::\d+)?|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)\/\S*$/;

/** A Subresource Integrity hash: the module as it was reviewed. */
export const INTEGRITY = /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/;

const PROPERTY_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

type Field = { type?: unknown; enum?: unknown; default?: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isBound = (value: unknown): boolean => isRecord(value) && 'path' in value;

const quoted = (name: string): string => `'${name}'`;

/** Why a value is not one a property takes, or null. */
function valueRefused(name: string, field: Field, value: unknown): string | null {
  if (Array.isArray(field.enum)) {
    return field.enum.includes(value)
      ? null
      : `${quoted(name)} is one of ${field.enum.map(each => quoted(String(each))).join(', ')}`;
  }
  const kind = String(field.type);
  const takes: Record<string, (v: unknown) => boolean> = {
    string: v => typeof v === 'string',
    integer: v => typeof v === 'number' && Number.isInteger(v),
    number: v => typeof v === 'number',
    boolean: v => typeof v === 'boolean',
    array: v => Array.isArray(v),
    object: isRecord,
  };
  if (typeof value === 'boolean' && kind !== 'boolean') {
    return `${quoted(name)} is ${kind}, not true or false`;
  }
  return takes[kind]?.(value) ? null : `${quoted(name)} is ${kind}`;
}

/** Its properties, as its schema declares them. */
const fieldsOf = (component: AppCustomComponentSpec): Record<string, Field> =>
  (isRecord(component.props.properties)
    ? component.props.properties
    : {}) as Record<string, Field>;

/**
 * What its schema refuses of the properties given, in the words agentspecs
 * says them: one it does not have, a value of another type, one it needs.
 * `bound` are given elsewhere — bound to what the application publishes.
 */
export function customPropsRefused(
  component: AppCustomComponentSpec,
  props: Record<string, unknown>,
  bound: readonly string[] = [],
): string[] {
  const fields = fieldsOf(component);
  const problems = Object.keys(props)
    .filter(name => !(name in fields))
    .map(name => `it has no property ${quoted(name)}`);
  for (const [name, value] of Object.entries(props)) {
    if (name in fields && !isBound(value)) {
      const refused = valueRefused(name, fields[name], value);
      if (refused) {
        problems.push(refused);
      }
    }
  }
  const required = Array.isArray(component.props.required)
    ? (component.props.required as string[])
    : [];
  for (const name of required) {
    if (!(name in props) && !bound.includes(name)) {
      problems.push(`it needs ${quoted(name)}`);
    }
  }
  return problems;
}

/** What stops one component its developer wrote from being reviewed, in sentences. */
export function customComponentProblems(
  component: AppCustomComponentSpec,
): string[] {
  const said = `The component ${component.name || '(unnamed)'}`;
  const problems: string[] = [];
  if (!CUSTOM_COMPONENT_NAME.test(component.name)) {
    problems.push(
      `Cannot use “${component.name}” as a component's name: a word starting with a capital letter, as Gauge.`,
    );
  } else if (getComponent(component.name)) {
    problems.push(`${said} is a component of the catalog: name yours otherwise.`);
  }
  if (!component.description.trim()) {
    problems.push(`${said} says what it is for, under \`description\`.`);
  }
  if (!/^[a-z][a-z0-9+.-]*:/.test(component.source)) {
    problems.push(
      `${said}'s module “${component.source}” is a file of the application's folder: it is drawn once the application is packaged with it (LOOP P-29); give the address of a built ES module.`,
    );
  } else if (!CUSTOM_SOURCE.test(component.source)) {
    problems.push(
      `${said}'s module “${component.source}” is loaded over \`https://\`, or from \`http://localhost\` while it is written.`,
    );
  }
  if (component.integrity && !INTEGRITY.test(component.integrity)) {
    problems.push(
      `${said}'s integrity “${component.integrity}” is no Subresource Integrity hash: \`sha384-\` and the hash in base64.`,
    );
  }
  if (component.height < 40 || component.height > 2000) {
    problems.push(`${said} is between 40 and 2000 pixels high.`);
  }
  const schema = component.props;
  if (schema.type !== 'object' || !isRecord(schema.properties)) {
    problems.push(
      `${said}'s props are the JSON Schema of an object, with its \`properties\`.`,
    );
    return problems;
  }
  const fields = fieldsOf(component);
  for (const [name, field] of Object.entries(fields)) {
    if (
      !PROPERTY_NAME.test(name) ||
      (CUSTOM_RESERVED_NAMES as readonly string[]).includes(name)
    ) {
      problems.push(`${said} cannot have a property named ${quoted(name)}.`);
      continue;
    }
    if (!isRecord(field)) {
      problems.push(`${said}'s property ${quoted(name)} is not a schema.`);
      continue;
    }
    if ('enum' in field) {
      const values = field.enum;
      if (
        !Array.isArray(values) ||
        values.length === 0 ||
        !values.every(value => typeof value === 'string')
      ) {
        problems.push(
          `${said}'s property ${quoted(name)} is an \`enum\` of words, one at least.`,
        );
      }
    } else if (
      !(CUSTOM_PROPERTY_TYPES as readonly unknown[]).includes(field.type)
    ) {
      problems.push(
        `${said}'s property ${quoted(name)} is typed ${quoted(String(field.type))}: one of ${CUSTOM_PROPERTY_TYPES.join(', ')}, or an \`enum\`.`,
      );
      continue;
    }
    if ('default' in field) {
      const refused = valueRefused(name, field, field.default);
      if (refused) {
        problems.push(`${said}'s default for ${refused}.`);
      }
    }
  }
  const required = Array.isArray(schema.required)
    ? (schema.required as string[])
    : [];
  const missing = required.filter(name => !(name in fields));
  if (missing.length > 0) {
    problems.push(
      `${said} requires ${missing.map(quoted).join(', ')}, which its props do not have.`,
    );
  }
  for (const name of [...component.shows, ...component.sends]) {
    if (
      !PROPERTY_NAME.test(name) ||
      (CUSTOM_RESERVED_NAMES as readonly string[]).includes(name)
    ) {
      problems.push(`${said} cannot bind through ${quoted(name)}.`);
    } else if (name in fields) {
      problems.push(
        `${said} both has the property ${quoted(name)} and binds through it.`,
      );
    }
  }
  for (const [bindings, what] of [
    [component.shows, 'shows'],
    [component.sends, 'sends'],
  ] as const) {
    if (new Set(bindings).size !== bindings.length) {
      problems.push(`${said} ${what} the same binding twice.`);
    }
  }
  if (component.example) {
    const bindings = new Set([...component.shows, ...component.sends]);
    const given = Object.fromEntries(
      Object.entries(component.example).filter(([key]) => !bindings.has(key)),
    );
    const refused = customPropsRefused(component, given);
    if (refused.length > 0) {
      problems.push(`${said}'s example is refused: ${refused.join('; ')}.`);
    }
  }
  return problems;
}

/** What stops the components an application's developer wrote, in sentences. */
export function customComponentsProblems(app: AppSpec): string[] {
  const own = app.interface.customComponents ?? [];
  const problems = own.flatMap(customComponentProblems);
  const names = own.map(component => component.name);
  if (new Set(names).size !== names.length) {
    problems.push('Two of its own components have the same name.');
  }
  return problems;
}

/** A component its developer wrote, by name, or undefined. */
export function customComponentOf(
  app: Pick<AppSpec, 'interface'>,
  name: string,
): AppCustomComponentSpec | undefined {
  return (app.interface.customComponents ?? []).find(
    component => component.name === name,
  );
}

/**
 * It as the catalog lists a component (C-13): what the palette, the
 * components page and the checks read — under the application's version, its
 * category `custom`.
 */
export function customComponentEntry(
  component: AppCustomComponentSpec,
  version: string,
): ComponentSpec {
  return {
    id: component.name,
    name: component.name,
    description: component.description,
    category: 'custom',
    emoji: '🧩',
    version,
    standard: false,
    properties: component.props,
    bindings: { shows: [...component.shows], sends: [...component.sends] },
    events: component.sends.length > 0 ? ['send'] : [],
    ...(component.example ? { example: component.example } : {}),
  };
}

/**
 * The components an application may place: the catalog's own, given, and
 * those its developer wrote, for it alone. A name of its own that the
 * catalog has is not listed twice: the checks refuse it.
 */
export function appComponents(
  app: Pick<AppSpec, 'interface' | 'version'>,
  catalog: readonly ComponentSpec[],
): ComponentSpec[] {
  const names = new Set(catalog.map(component => component.id));
  return [
    ...catalog,
    ...(app.interface.customComponents ?? [])
      .filter(component => !names.has(component.name))
      .map(component => customComponentEntry(component, app.version)),
  ];
}

/** What its schema refuses of a node of a surface drawn by it, in sentences; empty when nothing. */
export function customNodeRefused(
  component: AppCustomComponentSpec,
  node: Record<string, unknown>,
): string[] {
  const skip = new Set<string>([
    ...CUSTOM_RESERVED_NAMES,
    ...component.shows,
    ...component.sends,
  ]);
  const given = Object.fromEntries(
    Object.entries(node).filter(([key]) => !skip.has(key)),
  );
  const bound = Object.entries(given)
    .filter(([, value]) => isBound(value))
    .map(([key]) => key);
  return customPropsRefused(component, given, bound);
}
