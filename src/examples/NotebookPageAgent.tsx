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
 * Reactor plugins only. `pageLayout` mounts `LoopPageLayoutPlugin`, which
 * hands the chat view's parts to primer-addons' page layout through the
 * `LoopChatLayout` point; the
 * `jupyter` team brings the Analyst, the Reviewer, the Writer and
 * the rest of the notebook's agents;
 * the loop turns in the browser, so nothing has to be installed or signed
 * into.
 *
 * @module examples/NotebookPageAgent
 */

import React from 'react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { LoopEmbed } from '../loop';

const NotebookPageAgent: React.FC = () => (
  <ThemedProvider>
    <Box sx={{ height: '100vh', minHeight: 0 }}>
      <LoopEmbed
        target="browser"
        /* The Analyst is the team's front door; the team puts the other
           members one click away in the composer's agents menu. */
        agentId="jupyter-data-analyst"
        teamId="jupyter"
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
