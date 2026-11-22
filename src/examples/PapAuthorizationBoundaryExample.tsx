/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** PAP Session and Direct Sign-In boundaries as a Reactor workspace plugin. */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { AgentEmbed } from '../apps';
import { definePapExamplePlugin } from '../apps/plugins/pap-example';
import { ThemedProvider } from './utils/themedProvider';

setupPrimerPortals();

const PapAuthorizationPlugin = definePapExamplePlugin({
  key: 'authorization-boundary',
  title: 'PAP Authorization Boundary',
  description: 'Real Session and PKCE material kept outside model context.',
  load: () => import('./pap/PapAuthorizationBoundaryView'),
});

const PapAuthorizationBoundaryExample: React.FC = () => {
  const plugins = useMemo(() => [PapAuthorizationPlugin], []);
  return (
    <ThemedProvider>
      <Box height="100%" minHeight={0}>
        <AgentEmbed
          target="browser"
          agentId="agent-shell"
          defaultEditor="none"
          showHeader
          plugins={plugins}
        />
      </Box>
    </ThemedProvider>
  );
};

export default PapAuthorizationBoundaryExample;
