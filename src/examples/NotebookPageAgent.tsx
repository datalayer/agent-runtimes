/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A notebook as a page, with a team of agents working in it.
 *
 * The page layout: the notebook on a centred sheet over a quiet canvas, like
 * a document application; the composer docked directly above the sheet and
 * exactly as wide, as its command line; the conversation in a panel at the
 * side, opened from the header when it is wanted. Ask the Analyst for an analysis and the cells
 * appear on the page; ask the Reviewer to check it and the verdict lands
 * beside them.
 *
 * Reactor plugins only. `pageLayout` mounts `PageLayoutPlugin`, which
 * arranges the chat view's parts through the `LoopChatLayout` point; the
 * `shared-notebook` team brings the Analyst, the Reviewer and the Writer;
 * the loop turns in the browser, so nothing has to be installed or signed
 * into.
 *
 * @module examples/NotebookPageAgent
 */

import React from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { LoopEmbed } from '../loop';

setupPrimerPortals();

const NotebookPageAgent: React.FC = () => (
  <ThemedProvider>
    <Box sx={{ height: '100vh', minHeight: 0 }}>
      <LoopEmbed
        target="browser"
        /* The Analyst is the team's front door; the team puts the Reviewer
           and the Writer one click away in the composer's agents menu. */
        agentId="notebook-analyst"
        teamId="shared-notebook"
        /* The notebook, open on the page. */
        defaultEditor="notebook"
        pageLayout
        /* The composer as a draggable card over the top of the page rather
           than the docked band. */
        pageLayoutPrompt="floating"
        /* The header carries the editor choice — notebook, document, or the
           conversation alone — and the page layout's conversation toggle. */
        showHeader
        editorSelector
        commandPalette
        agentSummary={false}
      />
    </Box>
  </ThemedProvider>
);

export default NotebookPageAgent;
