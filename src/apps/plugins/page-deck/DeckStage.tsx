/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The deck drawn, as Datalayer Decks draws one: reached only through the
 * card's lazy import, so the decks library is not in a chat's bundle until
 * a deck is on screen.
 *
 * The theme a deck asks for (`deck_set_theme`) is the deck's alone here: it
 * is handed to the library as its host's theme, and never to the page, so a
 * dark deck does not turn the conversation dark.
 *
 * @module apps/plugins/page-deck/DeckStage
 */

import { useMemo, type JSX } from 'react';
import { useThemeStore } from '@datalayer/primer-addons';
import {
  DecksHostProvider,
  DeckView,
  type DeckControl,
  type DeckSpec,
  type DecksTheme,
} from '@datalayer/decks';

/** What a deck built in the page offers: its notes, and presenting it full screen. */
export const PAGE_DECK_CONTROLS: readonly DeckControl[] = ['notes', 'present'];

/** The spec the page draws, and the theme it is drawn in: the deck's own asked apart. */
export function stagedDeck(spec: DeckSpec): {
  spec: DeckSpec;
  theme?: string;
  colorMode?: string;
} {
  const { theme, colorMode, ...deck } = spec.deck;
  return { spec: { ...spec, deck }, theme, colorMode };
}

export default function DeckStage({
  spec,
  moves,
  shown,
}: {
  spec: DeckSpec;
  moves: number;
  /** The slide to show, from 1; the last when left out. */
  shown?: number;
}): JSX.Element {
  const staged = useMemo(() => stagedDeck(spec), [spec]);
  const host = useMemo(
    () => ({
      useTheme: (): DecksTheme => {
        const page = useThemeStore();
        return {
          theme: (staged.theme ?? page.theme) as DecksTheme['theme'],
          colorMode: (staged.colorMode ??
            page.colorMode) as DecksTheme['colorMode'],
        };
      },
    }),
    [staged.theme, staged.colorMode],
  );
  return (
    <DecksHostProvider host={host}>
      {/* Keyed by the move: a change redraws the deck on the slide it was about. */}
      <DeckView
        key={moves}
        spec={staged.spec}
        controls={PAGE_DECK_CONTROLS}
        slide={shown ?? staged.spec.slides.length}
      />
    </DecksHostProvider>
  );
}
