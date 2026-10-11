/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** PAP Operations, replayed from a PAP demo-world trace, as a Reactor workspace plugin. */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { LoopEmbed } from '../apps';
import { definePapExamplePlugin } from '../apps/plugins/pap-example';
import { ThemedProvider } from './utils/themedProvider';

setupPrimerPortals();

const PapOperationsPlugin = definePapExamplePlugin({
  key: 'operations',
  title: 'PAP Operations',
  description:
    'Exact approval of one revision, terms changes, and confirmation at most once.',
  load: () => import('./pap/PapOperationsView'),
});

const PapOperationsExample: React.FC = () => {
  const plugins = useMemo(() => [PapOperationsPlugin], []);
  return (
    <ThemedProvider>
      <Box height="100vh" minHeight={0}>
        <LoopEmbed
          target="browser"
          agentId="loop-shell"
          defaultEditor="none"
          showHeader
          plugins={plugins}
        />
      </Box>
    </ThemedProvider>
  );
};

export default PapOperationsExample;
