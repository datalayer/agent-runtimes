/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The catalog of visual components, as the Composer reads it: the
 * components the enabled UI specs render, grouped as the palette shows them, and written as a node of an
 * application's surface.
 *
 * @module apps/composer/componentCatalog
 */

import type { ComponentSpec } from '../../types/agentspecs';

/** The palette's groups, in the order a builder reaches for them. */
export const COMPONENT_GROUPS: { category: string; label: string }[] = [
  { category: 'conversation', label: 'Conversation' },
  { category: 'text', label: 'Text' },
  { category: 'input', label: 'Inputs' },
  { category: 'action', label: 'Actions' },
  { category: 'data', label: 'Data' },
  { category: 'media', label: 'Media' },
  { category: 'layout', label: 'Layout' },
  // The components an application's developer wrote: its own.
  { category: 'custom', label: 'Its own' },
];

/** The components of each group, by name; a group with none is left out. */
export function groupComponents(
  components: readonly ComponentSpec[],
): { label: string; components: ComponentSpec[] }[] {
  const known = new Set(COMPONENT_GROUPS.map(group => group.category));
  const stray = components.find(component => !known.has(component.category));
  if (stray) {
    throw new Error(
      `The component ${stray.id} is in the category ${stray.category}, which the palette has no group for.`,
    );
  }
  return COMPONENT_GROUPS.map(({ category, label }) => ({
    label,
    components: components
      .filter(component => component.category === category)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter(group => group.components.length > 0);
}

/** A configuration's values that differ from the defaults its schema gives. */
export function changedValues(
  component: ComponentSpec,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const fields = (component.properties?.properties ?? {}) as Record<
    string,
    { default?: unknown }
  >;
  return Object.fromEntries(
    Object.entries(values).filter(
      ([name, value]) =>
        value !== undefined &&
        value !== '' &&
        JSON.stringify(value) !== JSON.stringify(fields[name]?.default),
    ),
  );
}

/** A node of a surface: its id, the component it is, its properties. */
export type SurfaceNode = {
  id: string;
  component: string;
  [property: string]: unknown;
};

/**
 * Nodes of an application's surface, in YAML: each one's id, the component
 * it is, and the properties set. Values are written as JSON, which YAML reads
 * as it is.
 */
export function nodesYaml(nodes: readonly SurfaceNode[]): string {
  return nodes
    .map(({ id, component, ...properties }) =>
      [
        `- id: ${id}`,
        `  component: ${component}`,
        ...Object.entries(properties).map(
          ([name, value]) => `  ${name}: ${JSON.stringify(value)}`,
        ),
      ].join('\n'),
    )
    .join('\n');
}

/** The component as a node of an application's surface, with what differs from its defaults. */
export function surfaceNode(
  component: ComponentSpec,
  values: Record<string, unknown>,
  nodeId = component.id.toLowerCase(),
): SurfaceNode {
  return {
    id: nodeId,
    component: component.id,
    ...changedValues(component, values),
  };
}

/** The component as a node of an application's surface, in YAML. */
export function surfaceNodeYaml(
  component: ComponentSpec,
  values: Record<string, unknown>,
  nodeId = component.id.toLowerCase(),
): string {
  return nodesYaml([surfaceNode(component, values, nodeId)]);
}

/** A value as Python writes it: JSON, with Python's `True`, `False` and `None`. */
export function pythonLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return 'None';
  }
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }
  if (typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(pythonLiteral).join(', ')}]`;
  }
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${JSON.stringify(key)}: ${pythonLiteral(item)}`)
      .join(', ')}}`;
  }
  throw new Error(`A ${typeof value} has no Python literal.`);
}

/** The longest line a call is written on before its arguments go one per line. */
const PYTHON_LINE = 88;

/**
 * A component's typed call in Python: `Table` → `table`, `TextField` →
 * `text_field` — agent-runtimes' generated `SurfaceComponents`, `app.ui`.
 */
export const pythonCallName = (componentId: string): string =>
  componentId.replace(/(?<!^)(?=[A-Z])/g, '_').toLowerCase();

/**
 * Nodes of an application's surface as the Python that places them:
 * one typed call each, `app.ui.<component>(id, **properties)`, its properties
 * typed from the catalog's JSON Schema — the schema the form and the Canvas
 * check against — and checked against it again when the call is made.
 */
export function nodesPython(nodes: readonly SurfaceNode[]): string {
  return nodes
    .map(({ id, component, ...properties }) => {
      const call = `app.ui.${pythonCallName(component)}`;
      const args = [
        JSON.stringify(id),
        ...Object.entries(properties).map(([name, value]) => {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
            throw new Error(
              `${id}'s property ${name} is not a Python name: it cannot be written as an argument.`,
            );
          }
          return `${name}=${pythonLiteral(value)}`;
        }),
      ];
      const line = `${call}(${args.join(', ')})`;
      return line.length <= PYTHON_LINE
        ? line
        : `${call}(\n${args.map(arg => `    ${arg},`).join('\n')}\n)`;
    })
    .join('\n');
}

/** What it can be bound to, in a sentence; a standard one binds as its protocol says. */
export function bindingsSentence(component: ComponentSpec): string {
  if (!component.bindings) {
    return 'Its properties and bindings are A2UI’s own.';
  }
  const { shows, sends } = component.bindings;
  const parts = [
    shows.length ? `shows ${shows.join(', ')}` : '',
    sends.length ? `sends ${sends.join(', ')}` : '',
  ].filter(Boolean);
  return parts.length
    ? `It ${parts.join(' and ')}.`
    : 'It is bound to nothing.';
}
