/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The characters clippy.js publishes as the avatar gallery shows them, all
 * fetched at the reader's request. The reading itself is the library's
 * (`chat/assistant/clippyJsCharacters`): fetched from the `clippyjs` package
 * on jsDelivr, read as text and never run, never kept in this repository —
 * the characters are Microsoft's.
 *
 * @module examples/utils/clippyJsCharacters
 */

import { useEffect, useState } from 'react';
import {
  CLIPPY_JS_CHARACTERS,
  CLIPPY_JS_VERSION,
  clippyJsCharacterId,
  fetchClippyJsCharacter,
  type ClippyJsCharacterName,
} from '../../chat/assistant/clippyJsCharacters';
import type { GalleryCharacter } from './AvatarGalleryGrid';

export {
  CLIPPY_JS_CHARACTERS,
  CLIPPY_JS_VERSION,
  readClippyJsCharacter,
  type ClippyJsCharacterName,
} from '../../chat/assistant/clippyJsCharacters';

/**
 * The clippy.js characters as the gallery shows them, fetched once `enabled`
 * and kept while it stays so; each as soon as it is read.
 */
export function useClippyJsCharacters(enabled: boolean): {
  characters: readonly GalleryCharacter[];
  loading: boolean;
  problem?: string;
} {
  const [read, setRead] = useState<GalleryCharacter[]>([]);
  const [pending, setPending] = useState(0);
  const [problem, setProblem] = useState<string>();
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    setRead([]);
    setProblem(undefined);
    setPending(CLIPPY_JS_CHARACTERS.length);
    for (const name of CLIPPY_JS_CHARACTERS) {
      fetchClippyJsCharacter(name).then(
        character => {
          if (cancelled) {
            return;
          }
          setRead(previous =>
            [
              ...previous,
              {
                id: clippyJsCharacterId(name),
                name: character.name,
                character,
                from: `clippy.js ${CLIPPY_JS_VERSION}`,
              },
            ].sort(
              (a, b) =>
                CLIPPY_JS_CHARACTERS.indexOf(a.name as ClippyJsCharacterName) -
                CLIPPY_JS_CHARACTERS.indexOf(b.name as ClippyJsCharacterName),
            ),
          );
          setPending(count => count - 1);
        },
        error => {
          if (cancelled) {
            return;
          }
          setProblem(
            `${name}: ${error instanceof Error ? error.message : String(error)}`,
          );
          setPending(count => count - 1);
        },
      );
    }
    // The characters are kept for the page (the library's fetch shares them
    // with the floating assistant): their object URLs are not revoked.
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return {
    characters: enabled ? read : [],
    loading: enabled && pending > 0,
    problem: enabled ? problem : undefined,
  };
}
