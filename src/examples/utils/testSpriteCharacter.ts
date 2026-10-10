/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A small character of our own in the clippy.js shape (LOOP T-26), for the
 * floating assistant's gallery: an `agent.js` and a `map.png` sprite sheet
 * of ten 48×48 cells, read through the same reader a person's files go
 * through (`readClippyCharacter`). It is a test sprite drawn for Datalayer —
 * no file of Microsoft's is in the repository (§6.9).
 *
 * Its animations carry the names the Office characters use, so the reader's
 * `stateAnimations` gives every state of the assistant one of its own:
 * `Idle1_1` idles, `Thinking`, `Processing`, `GetAttention`, `Sleep`,
 * `Greeting`, `Explain` and `GoodBye`.
 *
 * @module examples/utils/testSpriteCharacter
 */

import { readClippyCharacter } from '../../chat/assistant/formats/clippy';
import type { AssistantCharacterData } from '../../chat/assistant/formats/types';

/** The character's `agent.js`, as clippy.js registers one. */
export const TEST_SPRITE_AGENT_JS = `
clippy.ready('Pixel', {
  overlayCount: 1,
  framesize: [48, 48],
  animations: {
    Idle1_1: { frames: [{ duration: 1200, images: [[0, 0]] }] },
    Thinking: { frames: [{ duration: 1200, images: [[48, 0]] }] },
    Processing: { frames: [
      { duration: 240, images: [[96, 0]] },
      { duration: 240, images: [[144, 0]] },
    ] },
    GetAttention: { frames: [{ duration: 900, images: [[192, 0]] }] },
    Sleep: { frames: [{ duration: 1600, images: [[240, 0]] }] },
    Greeting: { frames: [{ duration: 900, images: [[288, 0]] }] },
    Explain: { frames: [
      { duration: 200, images: [[336, 0]] },
      { duration: 200, images: [[384, 0]] },
    ] },
    GoodBye: { frames: [{ duration: 900, images: [[432, 0]] }] },
  },
});
`;

/** Its sprite sheet, `map.png` (480×48), base64. */
export const TEST_SPRITE_MAP_PNG_BASE64 =
  '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';

/** The sprite sheet's bytes. */
export function testSpriteMapPng(): Uint8Array {
  const binary = atob(TEST_SPRITE_MAP_PNG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** The test sprite, read as a person's clippy.js files are. */
export function readTestSpriteCharacter(): Promise<AssistantCharacterData> {
  return readClippyCharacter({
    agentJs: TEST_SPRITE_AGENT_JS,
    mapPng: new Blob([testSpriteMapPng() as BlobPart], { type: 'image/png' }),
  });
}
