/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** A narrative PAP interaction mounted as a Reactor workspace plugin. */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { LoopEmbed } from '../apps';
import { definePapExamplePlugin } from '../apps/plugins/pap-example';
import { ThemedProvider } from './utils/themedProvider';

setupPrimerPortals();

const PapJourneyPlugin = definePapExamplePlugin({
  key: 'guided-journey',
  title: 'PAP Guided Journey',
  description: 'A visual return journey across discovery, sign-in, and action.',
  load: () => import('./pap/PapGuidedJourneyView'),
});

const PapGuidedJourneyExample: React.FC = () => {
  const plugins = useMemo(() => [PapJourneyPlugin], []);
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

export default PapGuidedJourneyExample;
