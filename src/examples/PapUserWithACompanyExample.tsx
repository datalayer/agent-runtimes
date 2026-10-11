/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** PAP User with a Company, replayed from a PAP demo-world trace, as a Reactor workspace plugin. */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { LoopEmbed } from '../apps';
import { definePapExamplePlugin } from '../apps/plugins/pap-example';
import { ThemedProvider } from './utils/themedProvider';

setupPrimerPortals();

const PapUserWithACompanyPlugin = definePapExamplePlugin({
  key: 'user-with-a-company',
  title: 'PAP User with a Company',
  description:
    'Ada, her personal agent and one company, from question to confirmed exchange.',
  load: () => import('./pap/PapUserWithACompanyView'),
});

const PapUserWithACompanyExample: React.FC = () => {
  const plugins = useMemo(() => [PapUserWithACompanyPlugin], []);
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

export default PapUserWithACompanyExample;
