/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A component of Datalayer's own as A2UI's React renderer registers one: its
 * schema from the catalog, its view made by A2UI's own factory — the one
 * every basic component is made by — so its bindings resolve, its setters
 * write back and its action dispatches exactly as a basic component's do.
 *
 * @module components/a2ui/datalayer/implementation
 */

import type { FC } from 'react';
import {
  createComponentImplementation,
  type ReactA2uiComponentProps,
  type ReactComponentImplementation,
} from '@a2ui/react/v0_9';
import type { ComponentApi } from '@a2ui/web_core/v0_9';
import { ownComponentSchema } from './schema';

/** What every component of Datalayer's own receives besides its own properties. */
export type OwnCommon = {
  /** Dispatches its action, its context resolved at that moment; absent when it has none. */
  action?: () => void;
  weight?: number;
};

export function ownImplementation<P>(
  id: string,
  Render: FC<ReactA2uiComponentProps<P>>,
): ReactComponentImplementation {
  const api = { name: id, schema: ownComponentSchema(id) };
  return createComponentImplementation(
    api as unknown as ComponentApi,
    Render as unknown as Parameters<typeof createComponentImplementation>[1],
  );
}
