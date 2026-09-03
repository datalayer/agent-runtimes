/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A2UI Components Gallery, as a reactor application.
 *
 * The scene lives in `./scenes/A2UiComponentsGalleryScene` and arrives as an A2UI scene
 * plugin — one workspace view, ordered ahead of the chat. The rest is the
 * standard chat plugins; there is no agent behind this scene, so the
 * workspace runs on the browser target and costs no server.
 *
 * @module examples/A2UiComponentsGalleryExample
 */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { LoopEmbed } from '../loop';
import { defineA2uiScenePlugin } from '../loop/plugins/a2ui-scene';

setupPrimerPortals();

const ScenePlugin = defineA2uiScenePlugin({
  key: 'components-gallery',
  title: 'A2UI Components Gallery',
  description: 'Every A2UI component, rendered from canned protocol messages.',
  load: () => import('./scenes/A2UiComponentsGalleryScene'),
});

const A2UiComponentsGalleryExample: React.FC = () => {
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

export default A2UiComponentsGalleryExample;
