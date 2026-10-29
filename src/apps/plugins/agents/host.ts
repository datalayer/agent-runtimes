/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the page the agent is drawn in can offer, asked in one place.
 *
 * A local agent and the Jupyter server it starts run beside JupyterLab, not
 * in a web page (`heldTargetReason`). The question is jupyter-react's; it is
 * asked here so that a test can answer it without loading jupyter-react.
 *
 * @module apps/plugins/agents/host
 */

import { loadJupyterConfig } from '@datalayer/jupyter-react';

/** Whether the page is JupyterLab's own. */
export const insideJupyterLab = (): boolean =>
  loadJupyterConfig().insideJupyterLab;
