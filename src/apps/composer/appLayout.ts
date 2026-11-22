/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * How an application is laid out, as the Canvas sees it: a page
 * composed for a `chat` layout — the conversation alone — is not drawn, which
 * agent-runtimes says in a sentence (`surfaceUnshown`), and the fix is one
 * edit of the spec, to `page`, the page with the composer over it.
 *
 * @module apps/composer/appLayout
 */

import { surfaceUnshown } from '../plugins/app-page/appPageModel';
import type { AppLayout } from '../../types/agentspecs';
import type { AppDraft } from './draft';

/** Why the page composed for the application is not shown, or `null` when it is. */
export const layoutUnshown = (definition: AppDraft): string | null =>
  definition.spec ? surfaceUnshown(definition.spec) : null;

/** The definition laid out another way; the rest of its spec untouched. */
export function withLayout<D extends AppDraft>(
  definition: D,
  layout: AppLayout,
): D {
  if (!definition.spec) {
    return definition;
  }
  return {
    ...definition,
    spec: {
      ...definition.spec,
      interface: { ...definition.spec.interface, layout },
    },
  };
}
