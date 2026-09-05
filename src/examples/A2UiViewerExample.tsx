/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A2UI Viewer, as a reactor application.
 *
 * The scene lives in `./scenes/A2UiViewerScene` and arrives as an A2UI scene
 * plugin — one workspace view, ordered ahead of the chat. The rest is the
 * standard chat plugins; there is no agent behind this scene, so the
 * workspace runs on the browser target and costs no server.
 *
 * @module examples/A2UiViewerExample
 */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { LoopEmbed } from '../loop';
import { defineA2uiScenePlugin } from '../loop/plugins/a2ui-scene';

setupPrimerPortals();

const ScenePlugin = defineA2uiScenePlugin({
  key: 'viewer',
  title: 'A2UI Viewer',
  description:
    'Paste A2UI protocol messages and watch the surface they describe.',
  load: () => import('./scenes/A2UiViewerScene'),
});

const A2UiViewerExample: React.FC = () => {
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

export default A2UiViewerExample;
