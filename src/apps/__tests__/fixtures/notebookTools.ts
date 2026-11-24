/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The page notebook's tools, real in a mocked `@datalayer/jupyter-react`.
 *
 * The setup mocks the package without its notebook tools, so the page
 * notebook's plugin registered no tools, no bindings and no extras there.
 * Imported first by a test that mounts the UI plugins, this fills the mock
 * with the package's real definitions and operations, from its `tools`
 * entry (schemas and operations, nothing of JupyterLab), before any plugin
 * module is fetched.
 *
 * @module apps/__tests__/fixtures/notebookTools
 */

import * as jupyterReact from '@datalayer/jupyter-react';
import {
  notebookToolDefinitions,
  notebookToolOperations,
} from '@datalayer/jupyter-react/tools';

const definitions = jupyterReact.notebookToolDefinitions as unknown[];
if (definitions.length === 0) {
  definitions.push(...notebookToolDefinitions);
  Object.assign(jupyterReact.notebookToolOperations, notebookToolOperations);
}
