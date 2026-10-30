/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** PAP Session JWT creation mounted as a Reactor workspace plugin. */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { LoopEmbed } from '../apps';
import { definePapExamplePlugin } from '../apps/plugins/pap-example';
import { ThemedProvider } from './utils/themedProvider';

setupPrimerPortals();

const PapSessionJwtPlugin = definePapExamplePlugin({
  key: 'session-jwt',
  title: 'PAP Session JWT',
  description:
    'Fresh request-bound Session JWTs kept outside model and UI state.',
  load: () => import('./pap/PapSessionJwtView'),
});

const PapSessionJwtExample: React.FC = () => {
  const plugins = useMemo(() => [PapSessionJwtPlugin], []);
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

export default PapSessionJwtExample;
