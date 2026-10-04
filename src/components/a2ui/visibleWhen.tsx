/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A block shown only under a condition: `visible_when`, on any component.
 *
 * A2UI has no visibility of its own — v0.9 has no such key, v1.0's
 * `accessibility.hidden` hides a block from assistive technologies only, and
 * `@a2ui/react` 0.12 draws v0.9 — and its component schemas are strict, so a
 * key the catalog does not declare refuses the whole tree. Datalayer's
 * renderer therefore draws from {@link datalayerCatalog}: the basic catalog,
 * each component's schema declaring `visible_when` as a `DynamicBoolean`, and
 * each component drawn inside a guard that reads it.
 *
 * The condition is what the application publishes, by path —
 * `{"path": "/chosen"}`, or `{"path": "isChosen"}` inside a List's template —
 * resolved by A2UI like any other binding, so the block appears and goes as
 * the data changes. A block is shown while the value is there: `true`, or a
 * value that is not empty. `false`, `''`, `0`, `null`, an empty list, or a
 * path with nothing published at it yet hide it. A block without
 * `visible_when` is always shown.
 *
 * @module components/a2ui/visibleWhen
 */

import type { FC } from 'react';
import {
  basicCatalog,
  useSignalValue,
  type NodeViewProps,
  type ReactComponentImplementation,
} from '@a2ui/react/v0_9';
import {
  Catalog,
  DynamicBooleanSchema,
  ResolvedBinding,
  isWritable,
} from '@a2ui/web_core/v0_9';
import { VISIBLE_WHEN, isShown } from './visibility';
import { OWN_COMPONENTS } from './datalayer';

/**
 * Whether a node's resolved properties let it be drawn: no condition, or one
 * that holds. A2UI resolves a dynamic property to a binding whether the block
 * gave it or not; a path's is writable, and its value may be nothing yet,
 * which hides the block. A literal or a function call that resolved to
 * nothing is a block without a condition.
 */
export function nodeIsShown(props: Record<string, unknown>): boolean {
  const condition = props[VISIBLE_WHEN];
  if (!(condition instanceof ResolvedBinding)) {
    throw new Error(
      `${VISIBLE_WHEN} resolved to ${String(condition)}, not a binding: the catalog's schema does not declare it.`,
    );
  }
  if (isWritable(condition)) {
    return isShown(condition.value);
  }
  return condition.value === undefined || isShown(condition.value);
}

const VISIBLE_WHEN_SCHEMA = DynamicBooleanSchema.describe(
  'REF:#/$defs/DynamicBoolean|Datalayer: the block is shown only while this is true or not empty — a path the application publishes.',
).optional();

/** A component, its schema declaring `visible_when`, drawn behind the guard. */
export function withVisibleWhen(
  component: ReactComponentImplementation,
): ReactComponentImplementation {
  const View = component.view;
  if (!View) {
    throw new Error(
      `${component.name} has no node view: visible_when is read from the node, and A2uiSurface draws through it.`,
    );
  }
  // A zod object: what every basic component's schema is.
  const schema = component.schema as unknown as {
    shape?: Record<string, unknown>;
    extend?: (shape: Record<string, unknown>) => typeof component.schema;
  };
  if (!schema.shape || typeof schema.extend !== 'function') {
    throw new Error(
      `${component.name}'s schema is not an object: visible_when cannot be declared on it.`,
    );
  }
  if (VISIBLE_WHEN in schema.shape) {
    throw new Error(`${component.name} already declares ${VISIBLE_WHEN}.`);
  }
  const Guarded: FC<NodeViewProps> = ({ node, buildChild }) => {
    const props = useSignalValue(node.props);
    return nodeIsShown(props) ? (
      <View node={node} buildChild={buildChild} />
    ) : null;
  };
  Guarded.displayName = `${component.name}.visibleWhen`;
  return {
    ...component,
    schema: schema.extend({ [VISIBLE_WHEN]: VISIBLE_WHEN_SCHEMA }),
    // A2uiSurface draws through the view; `render` is only its fallback for
    // a component without one, which this one is not.
    view: Guarded,
  };
}

/**
 * The catalog Datalayer's renderer draws from: A2UI's basic catalog and
 * Datalayer's own components (Table, Chart, File upload, Chat, Evidence,
 * Form — `./datalayer`), under the basic catalog's id — the payloads name
 * it — with `visible_when` on every component.
 */
export const datalayerCatalog = new Catalog<ReactComponentImplementation>(
  basicCatalog.id,
  basicCatalog.protocolVersion,
  [...basicCatalog.components.values(), ...OWN_COMPONENTS].map(withVisibleWhen),
  [...basicCatalog.functions.values()],
  basicCatalog.themeSchema,
  basicCatalog.instructions,
);

/**
 * Datalayer's catalog narrowed to the components named — what the enabled
 * plugins contribute as blocks (LOOP R-01b, `loop.canvas.block`), so that an
 * application's page draws what its Canvas can place and nothing else. Under
 * the same id; a name the catalog does not draw is an error.
 */
export function catalogOfBlocks(
  names: readonly string[],
): Catalog<ReactComponentImplementation> {
  const unknown = names.filter(name => !datalayerCatalog.components.has(name));
  if (unknown.length > 0) {
    throw new Error(
      `No renderer draws ${unknown.join(', ')}: a block is contributed by a plugin whose component the catalog draws.`,
    );
  }
  return new Catalog<ReactComponentImplementation>(
    datalayerCatalog.id,
    datalayerCatalog.protocolVersion,
    names.map(name => datalayerCatalog.components.get(name)!),
    [...datalayerCatalog.functions.values()],
    datalayerCatalog.themeSchema,
    datalayerCatalog.instructions,
  );
}
