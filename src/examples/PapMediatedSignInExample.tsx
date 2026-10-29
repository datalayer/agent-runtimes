/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** PAP Mediated Sign-In, replayed from a PAP demo-world trace, as a Reactor workspace plugin. */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { LoopEmbed } from '../apps';
import { definePapExamplePlugin } from '../apps/plugins/pap-example';
import { ThemedProvider } from './utils/themedProvider';

setupPrimerPortals();

const PapMediatedSignInPlugin = definePapExamplePlugin({
  key: 'mediated-sign-in',
  title: 'PAP Mediated Sign-In',
  description:
    "Credentials on the host's protected input, sent to one company endpoint once.",
  load: () => import('./pap/PapMediatedSignInView'),
});

const PapMediatedSignInExample: React.FC = () => {
  const plugins = useMemo(() => [PapMediatedSignInPlugin], []);
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

export default PapMediatedSignInExample;
