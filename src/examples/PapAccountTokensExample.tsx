/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** PAP Refresh Tokens, replayed from a PAP demo-world trace, as a Reactor workspace plugin. */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { AgentEmbed } from '../apps';
import { definePapExamplePlugin } from '../apps/plugins/pap-example';
import { ThemedProvider } from './utils/themedProvider';

setupPrimerPortals();

const PapAccountTokensPlugin = definePapExamplePlugin({
  key: 'account-tokens',
  title: 'PAP Refresh Tokens',
  description:
    'Refresh, rotate, narrow, and revoke a refresh token the host keeps by reference.',
  load: () => import('./pap/PapAccountTokensView'),
});

const PapAccountTokensExample: React.FC = () => {
  const plugins = useMemo(() => [PapAccountTokensPlugin], []);
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

export default PapAccountTokensExample;
