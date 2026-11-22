/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the Composer's editors read and write of an application: its Appspec,
 * the page its Canvas lays out, the components it may draw, the YAML its
 * builder wrote and, for an application written in Python, its `app.py`.
 *
 * A host keeps more beside it (its versions, its validation, who it was
 * cloned from): it hands its own object, which has these fields, and an
 * editor hands back the same object with the fields it changed — so
 * `{ ...draft, ...next }` is what a host keeps.
 *
 * @module apps/composer/draft
 */

import { parseAppspec } from '../apps/appspec';
import type { AppSpec } from '../../types/agentspecs';
import type { AppCodeFile } from './appCode';
import { parseInterface, type AppInterface } from './appInterface';

export type AppDraft = {
  /** Its Appspec; `null` for an application saved before it had one. */
  spec: AppSpec | null;
  /** The page its Canvas lays out (A2UI), or none. */
  interface: AppInterface | null;
  /** The interface components it may draw, by name. */
  components: string[];
  /** The spec as its builder wrote it, comments and order included. */
  source?: string;
  /** The `app.py` it is built from, when it is written in Python. */
  code?: AppCodeFile;
};

/**
 * An Appspec, as its file holds it or as a renderer draws it, as the
 * editors read it: what is missing takes its default.
 */
export function draftOfAppspec(document: unknown): AppDraft {
  const { app } = parseAppspec(document);
  return {
    spec: app,
    interface: parseInterface(app.interface.surface ?? null),
    components: [...app.interface.components],
    source: '',
  };
}
