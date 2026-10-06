/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The files a person picked, read as one character (LOOP T-26): one
 * Microsoft Agent `.acs`, or a clippy.js character's `agent.js` and map
 * image (and its sounds file, if there is one). Read in the page; nothing is
 * sent anywhere.
 *
 * @module chat/assistant/formats/files
 */

import { readAcsCharacter } from './acs';
import { readClippyCharacter } from './clippy';
import {
  AssistantCharacterFormatError,
  type AssistantCharacterData,
} from './types';

/** What a file picker for a character accepts. */
export const CHARACTER_FILES_ACCEPT = '.acs,.js,.png,.gif,.webp,.jpg,.jpeg';

/** The sentence for a pick that is not a character. */
export const CHARACTER_FILES_EXPECTED =
  'Pick one .acs file, or a clippy.js character: its agent.js and its map image (and a sounds file if you have one).';

/** A picked file, as much of `File` as the reader needs. */
export type PickedFile = Blob & { name: string };

/** Which of the picked files make the character, or why none do. */
export function characterFilesOf(files: ReadonlyArray<PickedFile>):
  | { kind: 'acs'; acs: PickedFile }
  | {
      kind: 'clippy';
      agentJs: PickedFile;
      map: PickedFile;
      sounds?: PickedFile;
    }
  | { problem: string } {
  const acs = files.find(file => file.name.toLowerCase().endsWith('.acs'));
  if (acs) {
    return { kind: 'acs', acs };
  }
  const agentJs = files.find(file => file.name.toLowerCase() === 'agent.js');
  const map = files.find(file => /\.(png|gif|webp|jpe?g)$/i.test(file.name));
  const sounds = files.find(file => /^sounds-.*\.js$/i.test(file.name));
  if (!agentJs || !map) {
    return { problem: CHARACTER_FILES_EXPECTED };
  }
  return { kind: 'clippy', agentJs, map, ...(sounds ? { sounds } : {}) };
}

/** Read the picked files as a character; refuses in a sentence. */
export async function readCharacterFiles(
  files: ReadonlyArray<PickedFile>,
): Promise<AssistantCharacterData> {
  const picked = characterFilesOf(files);
  if ('problem' in picked) {
    throw new AssistantCharacterFormatError(picked.problem);
  }
  if (picked.kind === 'acs') {
    return readAcsCharacter(await picked.acs.arrayBuffer());
  }
  return readClippyCharacter({
    agentJs: await picked.agentJs.text(),
    mapPng: picked.map,
    soundsJs: picked.sounds ? await picked.sounds.text() : undefined,
  });
}
