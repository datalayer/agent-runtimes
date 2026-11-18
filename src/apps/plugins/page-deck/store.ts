/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The conversation's deck and the tools bound to it: nothing here imports
 * the decks library, so a chat pays for it only once a deck is drawn.
 *
 * @module apps/plugins/page-deck/store
 */

import type { FrontendToolDefinition } from '../../../types/tools';
import { ConversationBound } from '../../pageTools/conversation';
import {
  DECK_TOOL_NAMES,
  DECK_WRITE_TOOL_NAMES,
  applyDeckCall,
  deckTools,
  emptyDeck,
  type DeckState,
} from '../../pageTools/deck';
import { PAGE_TOOL_RESULTS } from '../../toolCards/toolResults';

/** The deck of the conversation on the page. */
export const PAGE_DECK = new ConversationBound<DeckState>({
  fresh: () => emptyDeck(),
  writes: DECK_WRITE_TOOL_NAMES,
  replay: calls =>
    calls.reduce((state, call) => {
      try {
        return applyDeckCall(state, call.name, call.args);
      } catch {
        // What was refused then is refused now: the deck stands without it.
        return state;
      }
    }, emptyDeck()),
});

/** The deck's tools, bound to the conversation's deck. */
export function pageDeckTools(): FrontendToolDefinition[] {
  return deckTools({
    read: () => PAGE_DECK.read(),
    change: next => PAGE_DECK.set(next(PAGE_DECK.read())),
  }).map(tool => ({
    ...tool,
    handler: async (args: Record<string, unknown>) => {
      // A restored conversation's deck first, so that this call adds to it.
      await PAGE_DECK.sync(PAGE_TOOL_RESULTS.callsOf(DECK_TOOL_NAMES));
      return tool.handler?.(args);
    },
  }));
}
