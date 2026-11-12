/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Two cases of the protocols integrated here, each explained as a deck.
 *
 * `@datalayer/agent-runtimes/lib/protocols/decks`: a deck is a specification,
 * its slides, their types and their words, in the format of `@datalayer/decks`,
 * written as YAML in a TypeScript file of its own, with `spec` the same deck
 * parsed. UCP's and PACT's cases are told here because this is where those
 * protocols are spoken; the Personal Agent Protocol's four are in
 * `@datalayer/personal-agent-protocol/decks`, in the same shape.
 *
 * This module imports nothing but `yaml`: the Datalayer home page loads it only
 * when a deck is opened.
 *
 * @module protocols/decks
 */

import { parse } from 'yaml';

import { yaml as personalAgentAtABusiness } from './pact-a-personal-agent-at-a-business.js';
import { yaml as purchaseApproved } from './ucp-a-purchase-approved.js';

/** The cases, in the order they are told. */
export const PROTOCOL_DECK_IDS = [
  'ucp-a-purchase-approved',
  'pact-a-personal-agent-at-a-business',
] as const;

export type ProtocolDeckId = (typeof PROTOCOL_DECK_IDS)[number];

/** One slide: its `type` says what else it holds (`SlideSpec` of `@datalayer/decks`). */
export type ProtocolDeckSlide = {
  type: string;
  id?: string;
  title?: string;
  notes?: string;
  [key: string]: unknown;
};

/** A deck's specification, assignable to `DeckSpec` of `@datalayer/decks`. */
export type ProtocolDeckSpec = {
  deck: {
    title: string;
    subtitle?: string;
    template: string;
    [key: string]: unknown;
  };
  slides: ProtocolDeckSlide[];
};

export type ProtocolDeck = {
  /** The case it explains. */
  id: ProtocolDeckId;
  /** The protocol it shows: none of these is the Personal Agent Protocol. */
  protocol: 'UCP' | 'PACT';
  /** The case's name. */
  title: string;
  /** The deck as YAML. */
  yaml: string;
  /** The same deck, parsed. */
  spec: ProtocolDeckSpec;
};

const SOURCES: Record<
  ProtocolDeckId,
  { protocol: ProtocolDeck['protocol']; yaml: string }
> = {
  'ucp-a-purchase-approved': { protocol: 'UCP', yaml: purchaseApproved },
  'pact-a-personal-agent-at-a-business': {
    protocol: 'PACT',
    yaml: personalAgentAtABusiness,
  },
};

/** Every deck, in the order of the cases. */
export const PROTOCOL_DECKS: readonly ProtocolDeck[] = PROTOCOL_DECK_IDS.map(
  id => {
    const { protocol, yaml } = SOURCES[id];
    const spec = parse(yaml) as ProtocolDeckSpec;
    return { id, protocol, title: spec.deck.title, yaml, spec };
  },
);

/** The deck of a case; refused when the case has none. */
export function protocolDeck(id: string): ProtocolDeck {
  const deck = PROTOCOL_DECKS.find(one => one.id === id);
  if (deck === undefined) {
    throw new Error(`There is no deck for the case "${id}".`);
  }
  return deck;
}
