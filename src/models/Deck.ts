/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { IItem } from './Item';

/**
 * A deck: a presentation described as data, on the `@datalayer/decks`
 * engine. `spec` is the deck specification the engine renders — the
 * item's content, the way `nbformat` is a notebook's — present when the
 * item was read on its own and absent in a listing.
 */
export type IBaseDeck = IItem & {
  spec?: any;
};

export type IDeck = IBaseDeck & {
  type: 'deck';
};

export default IDeck;
