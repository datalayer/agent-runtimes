/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** PAP personal-agent identity mounted as a Reactor workspace plugin. */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { LoopEmbed } from '../apps';
import { definePapExamplePlugin } from '../apps/plugins/pap-example';
import { ThemedProvider } from './utils/themedProvider';

setupPrimerPortals();

const PapIdentityPlugin = definePapExamplePlugin({
  key: 'agent-identity',
  title: 'PAP Agent Identity',
  description: 'Verified client and signing policy without JWK coordinates.',
  load: () => import('./pap/PapAgentIdentityView'),
});

const PapAgentIdentityExample: React.FC = () => {
  const plugins = useMemo(() => [PapIdentityPlugin], []);
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

export default PapAgentIdentityExample;
