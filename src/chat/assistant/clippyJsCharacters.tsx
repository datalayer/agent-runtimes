/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The characters clippy.js publishes — Clippy, Merlin, Links, Rover and the
 * others — as avatars of the floating assistant, one per character, each
 * fetched from the `clippyjs` package on jsDelivr when it is first drawn and
 * read through the same clippy.js reader a person's files go through.
 *
 * Nothing of them is in this repository: clippy.js's licence covers its code
 * only, and the characters, their names and their drawings are Microsoft's.
 * The page fetches them when one is shown and keeps them in memory.
 *
 * The package ships each character as ES modules: `agent.mjs` exports the
 * character's data, `map.mjs` its sprite sheet as a data URL. Both are read as
 * text, never run: the data is rewritten as the `clippy.ready(...)` call the
 * reader expects. Sounds are left out.
 *
 * A character that cannot be fetched (offline, jsDelivr down) is drawn as
 * the paper clip, with a sentence that says why.
 *
 * @module chat/assistant/clippyJsCharacters
 */

import { useEffect, useState, type JSX } from 'react';
import {
  ASSISTANT_CHARACTERS,
  type AssistantCharacter,
  type AssistantDrawingProps,
} from './characters';
import { readClippyCharacter } from './formats/clippy';
import type { AssistantCharacterData } from './formats/types';
import { SpriteCharacter } from './SpriteCharacter';

/** The version of `clippyjs` the characters are read from. */
export const CLIPPY_JS_VERSION = '0.1.0';

/** Where they are fetched from. */
export const CLIPPY_JS_SOURCE = `jsDelivr (clippyjs ${CLIPPY_JS_VERSION})`;

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

/** The id a clippy.js character is chosen by: `clippy-js-merlin`. */
export const clippyJsCharacterId = (name: ClippyJsCharacterName): string =>
  `clippy-js-${name.toLowerCase()}`;

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
 * Each character fetched once for the page, and kept: every avatar drawing
 * it shares the read. One that failed is forgotten, so the next drawing of
 * it tries again.
 */
const FETCHED = new Map<
  ClippyJsCharacterName,
  Promise<AssistantCharacterData>
>();

/** A clippy.js character, fetched once for the page. */
export function fetchClippyJsCharacter(
  name: ClippyJsCharacterName,
): Promise<AssistantCharacterData> {
  let read = FETCHED.get(name);
  if (!read) {
    read = readClippyJsCharacter(name);
    FETCHED.set(name, read);
    read.catch(() => FETCHED.delete(name));
  }
  return read;
}

/** What is said when a clippy.js character cannot be fetched. */
export function clippyJsProblem(
  name: ClippyJsCharacterName,
  error: unknown,
): string {
  const why = error instanceof Error ? error.message : String(error);
  return `${name} could not be fetched from ${CLIPPY_JS_SOURCE}: ${why} The paper clip stands in for it.`;
}

/** One clippy.js character as it is being fetched: read, or why not. */
export function useClippyJsCharacter(name: ClippyJsCharacterName): {
  character?: AssistantCharacterData;
  problem?: string;
} {
  const [read, setRead] = useState<{
    character?: AssistantCharacterData;
    problem?: string;
  }>({});
  useEffect(() => {
    let cancelled = false;
    setRead({});
    fetchClippyJsCharacter(name).then(
      character => !cancelled && setRead({ character }),
      error => !cancelled && setRead({ problem: clippyJsProblem(name, error) }),
    );
    return () => {
      cancelled = true;
    };
  }, [name]);
  return read;
}

const PaperClip = ASSISTANT_CHARACTERS[0].Drawing;

function clippyJsDrawing(name: ClippyJsCharacterName) {
  return function ClippyJsDrawing({
    size,
    mode,
    state = 'idle',
    mouthLevel,
  }: AssistantDrawingProps): JSX.Element {
    const { character, problem } = useClippyJsCharacter(name);
    if (problem) {
      return (
        <span
          title={problem}
          data-assistant-fetch-problem={clippyJsCharacterId(name)}
          style={{ display: 'block', width: size, height: size }}
        >
          <PaperClip size={size} mode={mode} />
          <span
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
              whiteSpace: 'nowrap',
            }}
          >
            {problem}
          </span>
        </span>
      );
    }
    if (!character) {
      return (
        <span
          aria-busy="true"
          data-assistant-fetching={clippyJsCharacterId(name)}
          style={{ display: 'block', width: size, height: size }}
        />
      );
    }
    return (
      <SpriteCharacter
        character={character}
        state={state}
        size={size}
        mouthLevel={mouthLevel}
      />
    );
  };
}

/** The clippy.js characters as avatars, one per character, in the package's order. */
export const CLIPPY_JS_ASSISTANT_CHARACTERS: readonly AssistantCharacter[] =
  CLIPPY_JS_CHARACTERS.map(name => ({
    id: clippyJsCharacterId(name),
    name,
    family: 'clippy-js' as const,
    fetchedFrom: CLIPPY_JS_SOURCE,
    Drawing: clippyJsDrawing(name),
  }));
