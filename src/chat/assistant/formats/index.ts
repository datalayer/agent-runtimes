/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Character files a person brings (LOOP T-26): clippy.js sprite maps and
 * Microsoft Agent `.acs` files, read in the page into one shape.
 *
 * @module chat/assistant/formats
 */

export * from './types';
export {
  readClippyCharacter,
  readClippyAgent,
  readClippySounds,
} from './clippy';
export type { ClippyCharacterFiles } from './clippy';
export {
  readAcsCharacter,
  parseAcs,
  decodeAcsImage,
  layoutAcsSprite,
  composeAcsCell,
} from './acs';
export type { AcsFile, AcsAnimation, AcsFrame, AcsImage } from './acs';
export { decompressAgentData } from './agentCompression';
export { stateAnimations } from './stateAnimations';
export {
  CHARACTER_FILES_ACCEPT,
  CHARACTER_FILES_EXPECTED,
  characterFilesOf,
  readCharacterFiles,
} from './files';
export type { PickedFile } from './files';
