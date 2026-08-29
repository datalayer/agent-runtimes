/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The plugin graph, as a workspace view.
 *
 * `@datalayer/reactor-graph` is generic and knows nothing about a workspace: it
 * fills a `graph` slot and reads the platform it is rendered inside. This is
 * the twenty lines that put that slot where the workspace shows things — a
 * view — so the graph arrives through the same door as every other surface.
 *
 * The backend props are left out on purpose. They are what a host knows and the
 * graph cannot; a workspace whose server plugins are not tracked here is better
 * drawn as the frontend platform alone than as a frontend plus a guess.
 *
 * @module loop/plugins/graph/GraphView
 */

import { Box } from '@primer/react';
import { ReactorSlot } from '@datalayer/reactor/react';

export default function GraphView(): JSX.Element {
  return (
    <Box sx={{ height: '100%', overflowY: 'auto', px: 4, py: 3 }}>
      <ReactorSlot slot="graph" />
    </Box>
  );
}
