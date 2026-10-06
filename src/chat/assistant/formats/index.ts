/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Character files a person brings (LOOP T-26): clippy.js sprite maps and
 * Microsoft Agent `.acs` files, or `.acf` files with their `.aca` files,
 * read in the page into one shape.
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
  drawAgentCharacter,
  mouthImages,
  MOUTH_SHAPES,
} from './acs';
export type {
  AcsFile,
  AcsAnimation,
  AcsFrame,
  AcsImage,
  AcsOverlay,
  AgentCharacterSource,
} from './acs';
export { readAcfCharacter, parseAcf, parseAca } from './acf';
export type { AcfFile, AcfAnimationEntry, AcaFile } from './acf';
export { decompressAgentData } from './agentCompression';
export { stateAnimations } from './stateAnimations';
export {
  CHARACTER_FILES_ACCEPT,
  CHARACTER_FILES_EXPECTED,
  characterFilesOf,
  readCharacterFiles,
} from './files';
export type { PickedFile } from './files';
