/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** The PAP sign-in card drawn from a tool result's display, as a Reactor workspace plugin. */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { LoopEmbed } from '../apps';
import { definePapExamplePlugin } from '../apps/plugins/pap-example';
import { ThemedProvider } from './utils/themedProvider';

setupPrimerPortals();

const PapSignInDisplayPlugin = definePapExamplePlugin({
  key: 'sign-in-display',
  title: 'PAP Sign-In Display',
  description:
    'A sign-in tool’s PapSignIn display: the model reads its model view, the page draws the card.',
  load: () => import('./pap/PapSignInDisplayView'),
});

const PapSignInDisplayExample: React.FC = () => {
  const plugins = useMemo(() => [PapSignInDisplayPlugin], []);
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

export default PapSignInDisplayExample;
