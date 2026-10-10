/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Where the files of an application's folder are served (LOOP P-29), as a
 * contribution point, re-exported by `apps/core`.
 *
 * A component its developer wrote may be a file of its folder (`source:
 * gauge.js`). `loop apps package` puts the folder's files in the
 * application's wheel, beside a generated page-side plugin
 * (`loop-app-<id>/page`, `agent_runtimes/loop/apps/packaging.py`) whose one
 * contribution is to this point: the address its own directory is served at
 * by the server the wheel is installed beside. The page installs that plugin
 * through Reactor's `bootstrapExtensions` (`AppRuntimePlugins`), and a file
 * of the folder is fetched from there and drawn in its sandboxed frame.
 *
 * The plugin is a plain object of no import, so the point is named by its
 * id: `loop.app.files` is what the generated module says too.
 *
 * @module apps/core/appFiles
 */

import { defineContributionPoint } from '@datalayer/reactor';

export type AppFilesContribution = {
  /** The application whose folder it is, by id. */
  app: string;
  /** The absolute address its folder's files are served under, ending in `/`. */
  base: string;
};

export const LoopAppFiles =
  defineContributionPoint<AppFilesContribution>('loop.app.files');
