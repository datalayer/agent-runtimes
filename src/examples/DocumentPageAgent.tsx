/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A document as a page, with an agent writing in it.
 *
 * The same page layout as `NotebookPageAgent`, opened on the document
 * editor instead of the notebook: a sheet at reading width, the composer
 * docked above it at that same width, the conversation in a side panel. Ask for a
 * paragraph, a heading, a code block that runs — the agent writes it into
 * the document on the page, with the document's own tools, and the result
 * is a document a reader can keep editing by hand.
 *
 * Reactor plugins only: `pageLayout` mounts the layout plugin, the Loop
 * Shell's agent drives the document tools, and the loop turns in the
 * browser.
 *
 * @module examples/DocumentPageAgent
 */

import React from 'react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { LoopEmbed } from '../loop';

const DocumentPageAgent: React.FC = () => (
  <ThemedProvider>
    <Box sx={{ height: '100vh', minHeight: 0 }}>
      <LoopEmbed
        target="browser"
        /* The Loop Shell's agent: it drives the document tools — insert a
           block, run a code block, read the document — as readily as the
           notebook's, and its openers work on either. */
        agentId="loop-shell"
        localAgentSpec="loop-shell"
        teamId=""
        /* The document, open on the page. */
        defaultEditor="document"
        pageLayout
        /* The composer as a draggable card over the top of the page rather
           than the docked band. */
        pageLayoutPrompt="floating"
        showHeader
        editorSelector
        commandPalette
        agentSummary={false}
      />
    </Box>
  </ThemedProvider>
);

export default DocumentPageAgent;
