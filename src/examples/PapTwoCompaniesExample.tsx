/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** PAP Two Companies, replayed from a PAP demo-world trace, as a Reactor workspace plugin. */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { LoopEmbed } from '../apps';
import { definePapExamplePlugin } from '../apps/plugins/pap-example';
import { ThemedProvider } from './utils/themedProvider';

setupPrimerPortals();

const PapTwoCompaniesPlugin = definePapExamplePlugin({
  key: 'two-companies',
  title: 'PAP Two Companies',
  description:
    'Ledgerly, a company to Atlas and a personal agent at Northwind Bank, pays for Ada.',
  load: () => import('./pap/PapTwoCompaniesView'),
});

const PapTwoCompaniesExample: React.FC = () => {
  const plugins = useMemo(() => [PapTwoCompaniesPlugin], []);
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

export default PapTwoCompaniesExample;
