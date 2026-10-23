/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** PAP company discovery mounted as a Reactor workspace plugin. */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { LoopEmbed } from '../apps';
import { definePapExamplePlugin } from '../apps/plugins/pap-example';
import { ThemedProvider } from './utils/themedProvider';

setupPrimerPortals();

const PapCompanyPlugin = definePapExamplePlugin({
  key: 'company-discovery',
  title: 'PAP Company Discovery',
  description: 'Verified company metadata reduced to a model-safe summary.',
  load: () => import('./pap/PapCompanyDiscoveryView'),
});

const PapCompanyDiscoveryExample: React.FC = () => {
  const plugins = useMemo(() => [PapCompanyPlugin], []);
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

export default PapCompanyDiscoveryExample;
