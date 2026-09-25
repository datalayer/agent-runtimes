/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A2UI Contact Card, as a reactor application.
 *
 * The scene lives in `./scenes/A2UiContactCardScene` and arrives as an A2UI scene
 * plugin — one workspace view, ordered ahead of the chat. The rest is the
 * standard chat plugins; there is no agent behind this scene, so the
 * workspace runs on the browser target and costs no server.
 *
 * @module examples/A2UiContactCardExample
 */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { LoopEmbed } from '../loop';
import { defineA2uiScenePlugin } from '../loop/plugins/a2ui-scene';

setupPrimerPortals();

const ScenePlugin = defineA2uiScenePlugin({
  key: 'contact-card',
  title: 'A2UI Contact Card',
  description:
    'A canned A2UI contact card: MessageProcessor + surface, native protocol messages.',
  load: () => import('./scenes/A2UiContactCardScene'),
});

const A2UiContactCardExample: React.FC = () => {
  const plugins = useMemo(() => [ScenePlugin], []);
  return (
    <ThemedProvider>
      <Box sx={{ height: '100vh', minHeight: 0 }}>
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

export default A2UiContactCardExample;
