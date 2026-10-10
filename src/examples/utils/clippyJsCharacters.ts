/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The characters clippy.js publishes — Clippy, Merlin, Links, Rover and the
 * others — loaded into the floating assistant's gallery from the `clippyjs`
 * package on jsDelivr, at the reader's request, and read through the same
 * clippy.js reader a person's files go through.
 *
 * Nothing of them is in this repository: clippy.js's licence covers its code
 * only, and the characters, their names and their drawings are Microsoft's
 * (§6.9). The page fetches them when asked and keeps them in memory.
 *
 * The package ships each character as ES modules: `agent.mjs` exports the
 * character's data, `map.mjs` its sprite sheet as a data URL. Both are read as
 * text, never run: the data is rewritten as the `clippy.ready(...)` call the
 * reader expects. Sounds are left out.
 *
 * @module examples/utils/clippyJsCharacters
 */

import { useEffect, useState } from 'react';
import { readClippyCharacter } from '../../chat/assistant/formats/clippy';
import type { AssistantCharacterData } from '../../chat/assistant/formats/types';
import type { GalleryCharacter } from './AssistantGalleryGrid';

/** The version of `clippyjs` the characters are read from. */
export const CLIPPY_JS_VERSION = '0.1.0';

const BASE = `https://cdn.jsdelivr.net/npm/clippyjs@${CLIPPY_JS_VERSION}/dist/agents`;

/** The characters the package publishes: their names, and their folders. */
export const CLIPPY_JS_CHARACTERS = [
  'Clippy',
  'Merlin',
  'Links',
  'Rover',
  'Genie',
  'Genius',
  'F1',
  'Peedy',
  'Rocky',
  'Bonzi',
] as const;

export type ClippyJsCharacterName = (typeof CLIPPY_JS_CHARACTERS)[number];

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}.`);
  }
  return response.text();
}

/** The value a module exports by default: `var x = <value>;\nexport …`. */
function defaultExportText(module: string, what: string): string {
  const match = /^var [A-Za-z_$][\w$]* = ([\s\S]*?);\s*export\s*\{/m.exec(
    module,
  );
  if (!match) {
    throw new Error(`${what} does not export its value as clippy.js 0.1 does.`);
  }
  return match[1];
}

/** One clippy.js character, fetched and read. */
export async function readClippyJsCharacter(
  name: ClippyJsCharacterName,
): Promise<AssistantCharacterData> {
  const folder = `${BASE}/${name.toLowerCase()}`;
  const [agentModule, mapModule] = await Promise.all([
    fetchText(`${folder}/agent.mjs`),
    fetchText(`${folder}/map.mjs`),
  ]);
  const data = defaultExportText(agentModule, `${name}'s agent.mjs`);
  const mapUrl = defaultExportText(mapModule, `${name}'s map.mjs`);
  if (
    !/^"data:image\/(png|gif|webp|jpeg);base64,[A-Za-z0-9+/=]+"$/.test(mapUrl)
  ) {
    throw new Error(`${name}'s map.mjs does not hold an image.`);
  }
  const mapPng = await (await fetch(mapUrl.slice(1, -1))).blob();
  return readClippyCharacter({
    agentJs: `clippy.ready(${JSON.stringify(name)}, ${data});`,
    mapPng,
  });
}

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
    const loaded: AssistantCharacterData[] = [];
    setRead([]);
    setProblem(undefined);
    setPending(CLIPPY_JS_CHARACTERS.length);
    for (const name of CLIPPY_JS_CHARACTERS) {
      readClippyJsCharacter(name).then(
        character => {
          if (cancelled) {
            URL.revokeObjectURL(character.sprite);
            return;
          }
          loaded.push(character);
          setRead(previous =>
            [
              ...previous,
              {
                id: `clippy-js-${name.toLowerCase()}`,
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
    // The object URLs live as long as the characters are shown.
    return () => {
      cancelled = true;
      for (const character of loaded) {
        URL.revokeObjectURL(character.sprite);
      }
    };
  }, [enabled]);
  return {
    characters: enabled ? read : [],
    loading: enabled && pending > 0,
    problem: enabled ? problem : undefined,
  };
}
