/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The graph view's id, on its own.
 *
 * Split out so the button can name the view without importing the plugin that
 * declares it — which would be a cycle, since the plugin imports the button.
 *
 * @module loop/plugins/graph/viewType
 */

/** The view the graph plugin contributes. */
export const GRAPH_VIEW_TYPE = 'graph';
