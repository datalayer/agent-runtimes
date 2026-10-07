/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The A2UI schema of a component of Datalayer's own, read from the catalog
 * (LOOP C-13, C-18): each property its JSON Schema declares, typed as it
 * says; each thing it shows or sends a binding into the data model — a path
 * the application publishes, or a value given in place; its `action`, what
 * it dispatches when a person acts on it, written as A2UI writes a Button's.
 *
 * A2UI's renderer reads a component's schema to tell its properties apart —
 * a binding it resolves and writes back through, an action it dispatches, a
 * plain value it hands over — so the schema is built with the zod A2UI reads
 * (v3), from the catalog, and cannot drift from what the Canvas, the YAML
 * and Python check a component against.
 *
 * @module components/a2ui/datalayer/schema
 */

import { z } from 'zod/v3';
import { ActionSchema, DataBindingSchema } from '@a2ui/web_core/v0_9';
import type { ComponentSpec } from '../../../types/agentspecs';
import { COMPONENT_CATALOGUE } from '../../../specs/uiPlugins';

/** The components of Datalayer's own the catalog has, by id. */
export const OWN_COMPONENT_IDS = Object.values(COMPONENT_CATALOGUE)
  .filter(component => !component.standard)
  .map(component => component.id);

/** A component of Datalayer's own, from the catalog; it throws for any other. */
export function ownComponent(id: string): ComponentSpec {
  const component = COMPONENT_CATALOGUE[id];
  if (!component) {
    throw new Error(`The catalog has no component ${id}.`);
  }
  if (component.standard || !component.properties || !component.bindings) {
    throw new Error(
      `${id} is A2UI's own: its schema is the basic catalog's, not Datalayer's.`,
    );
  }
  return component;
}

/**
 * What a component shows or sends: a list, a record, words, a number, true
 * or false given in place, or a path into the data model. A2UI resolves it
 * — and gives the component a setter for it when it is a path.
 */
const BindingSchema = z
  .union([
    z.array(z.any()),
    z.record(z.string(), z.unknown()),
    z.string(),
    z.number(),
    z.boolean(),
    DataBindingSchema as unknown as z.ZodTypeAny,
  ])
  .describe(
    'REF:#/$defs/DynamicValue|Datalayer: what the component shows or sends — a path the application publishes or takes, or a value given in place.',
  );

type JsonProperty = {
  type?: string;
  enum?: string[];
};

/** A property as its JSON Schema types it. */
function propertySchema(name: string, property: JsonProperty): z.ZodTypeAny {
  if (property.enum) {
    return z.enum(property.enum as [string, ...string[]]);
  }
  switch (property.type) {
    case 'string':
      return z.string();
    case 'integer':
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(z.any());
    case 'object':
      return z.record(z.string(), z.unknown());
    default:
      throw new Error(
        `${name} is typed ${String(property.type)}, which a component's property cannot be.`,
      );
  }
}

/** The names a component shows and sends through, each once. */
export function bindingNames(component: ComponentSpec): string[] {
  const { shows, sends } = component.bindings!;
  return [...new Set([...shows, ...sends])];
}

/**
 * The A2UI schema of a component of Datalayer's own: its properties as its
 * JSON Schema has them, its bindings, its `action`, and the `weight` every
 * basic component takes inside a Row or a Column. Strict, as the basic
 * catalog's are: a key it does not declare refuses the tree.
 */
export function ownComponentSchema(id: string) {
  return componentSchemaOf(ownComponent(id));
}

/**
 * The A2UI schema of a component of Datalayer's own kind, from its entry in
 * the catalog — one of Datalayer's own, or one an application's developer
 * wrote (LOOP P-17), listed as the catalog lists a component.
 */
export function componentSchemaOf(component: ComponentSpec) {
  const id = component.id;
  if (!component.bindings) {
    throw new Error(`${id} says nothing of what it shows or sends.`);
  }
  const json = component.properties as {
    properties?: Record<string, JsonProperty>;
    required?: string[];
  };
  const required = new Set(json.required ?? []);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [name, property] of Object.entries(json.properties ?? {})) {
    const schema = propertySchema(name, property);
    shape[name] = required.has(name) ? schema : schema.optional();
  }
  for (const name of bindingNames(component)) {
    if (name in shape) {
      throw new Error(
        `${id} both declares ${name} as a property and binds through it.`,
      );
    }
    shape[name] = BindingSchema.optional();
  }
  shape.action = (ActionSchema as unknown as z.ZodTypeAny)
    .describe('REF:#/$defs/Action|What it dispatches when a person acts on it.')
    .optional();
  shape.weight = z
    .number()
    .describe('The relative weight of this component within a Row or Column.')
    .optional();
  return z.object(shape).strict();
}
