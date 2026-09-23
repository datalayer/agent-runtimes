/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A2UI Viewer, as a reactor application.
 *
 * The scene lives in `./scenes/A2UiViewerScene` and arrives as an A2UI scene
 * plugin — one workspace view, ordered ahead of the chat. The rest is the
 * standard chat plugins.
 *
 * The workspace runs on whatever the header's target says, like the examples
 * with an agent of their own. It used to be pinned to the browser — there is
 * no agent behind the scene, so the page was the cheapest place — which left
 * the header's *Local* selected and ignored: the sandbox stayed in the page.
 * On Local the loop asks the local agent-runtimes server for its shell agent
 * and the Jupyter server that agent starts beside itself, which is what
 * choosing Local means everywhere else here.
 *
 * @module examples/A2UiViewerExample
 */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { LoopEmbed } from '../loop';
import { useRuntimeTargetStore } from './utils/runtimeTargetStore';
import { useExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
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
  // The header's choice; the shell remounts this example when it changes.
  const target = useRuntimeTargetStore(state => state.target);
  const serverUrl = useExampleAgentRuntimesUrl();
  return (
    <ThemedProvider>
      <Box sx={{ height: '100vh', minHeight: 0 }}>
        <LoopEmbed
          target={target}
          // An in-page agent has no server to ask; the others need to know
          // where theirs is.
          serverUrl={target === 'browser' ? undefined : serverUrl}
          // The Viewer's own agent: its suggestions ask for the four scenes.
          agentId="example-a2ui-viewer"
          // What lets the header's target take: without the choice the
          // sandbox plugin pins itself to the page, whatever `target` says.
          showAgentVariants
          defaultEditor="none"
          showHeader
          plugins={plugins}
        />
      </Box>
    </ThemedProvider>
  );
};

export default A2UiViewerExample;
