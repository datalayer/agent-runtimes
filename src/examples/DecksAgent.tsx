/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A deck beside the chat, written by an agent.
 *
 * What this shows is a *plugin* joining a Loop: `@datalayer/decks` is a
 * Reactor plugin with a Python half of its own, and here it is mounted into
 * an agent workspace — its list in the sidebar, its view as an editor beside
 * the conversation, its commands in the palette and in a menu on the
 * composer, and its tools in the agent's hands. `worker-decks` writes a deck
 * as data, saves it, opens it, and steps through it while you talk.
 *
 * Everything runs in the browser: the agent on the Vercel AI harness, the
 * decks in the page's catalog. Point the plugin at a `datalayer-decks`
 * server (`backendUrl`) and the same decks are saved there.
 *
 * The sidebar is the plugins panel — switch the decks plugin off and the
 * Deck view, the menu and the tools all leave together — with the plugin
 * graph a click away, as in the reactor's music example.
 */

import React from 'react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { registerDecks } from '@datalayer/decks';
import { exampleDecks } from '@datalayer/decks/examples';
import { LoopEmbed } from '../loop';
import { DeckViewPlugin, LoopDecksPlugin } from '../loop/plugins/decks';

// The package's example decks, so the catalog has something to open and the
// agent's suggestions point at decks that exist. Once, at module load.
registerDecks(exampleDecks);

// Module-level, so the embed builds its reactor once rather than on every
// render of this component.
const DECK_PLUGINS = [LoopDecksPlugin, DeckViewPlugin];

const DecksAgent: React.FC = () => (
  <ThemedProvider>
    <Box sx={{ height: '100vh', minHeight: 0 }}>
      <LoopEmbed
        target="browser"
        agentId="worker-decks"
        /* The deck open beside the chat from the first frame. */
        defaultEditor="deck"
        /* The header carries the editor choice — deck, notebook, document, or
           the conversation alone. */
        showHeader
        editorSelector
        commandPalette
        /* The plugins panel in the sidebar, and the plugin graph behind its
           button. */
        pluginsPanel
        graph
        agentSummary={false}
        plugins={DECK_PLUGINS}
      />
    </Box>
  </ThemedProvider>
);

export default DecksAgent;
