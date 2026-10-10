/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** PAP signed-out Session lifecycle mounted as a Reactor workspace plugin. */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { LoopEmbed } from '../apps';
import { definePapExamplePlugin } from '../apps/plugins/pap-example';
import { ThemedProvider } from './utils/themedProvider';

setupPrimerPortals();

const PapSessionPlugin = definePapExamplePlugin({
  key: 'session-lifecycle',
  title: 'PAP Session Lifecycle',
  description: 'Start, nonce retry, and renewal with credentials host-owned.',
  load: () => import('./pap/PapSessionLifecycleView'),
});

const PapSessionLifecycleExample: React.FC = () => {
  const plugins = useMemo(() => [PapSessionPlugin], []);
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

export default PapSessionLifecycleExample;
