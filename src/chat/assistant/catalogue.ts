/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Every avatar this package draws by id, in the order a picker lists them:
 * Datalayer's orb, the clippy.js characters (Microsoft's, fetched from
 * jsDelivr when drawn), then Datalayer's drawings. The 3D models are named
 * by an object (`{kind: model3d}`), not by an id.
 *
 * @module chat/assistant/catalogue
 */

import {
  ASSISTANT_CHARACTERS,
  type AssistantCharacter,
  type AssistantCharacterFamily,
} from './characters';
import { CLIPPY_JS_ASSISTANT_CHARACTERS } from './clippyJsCharacters';
import { ASSISTANT_ORB_CHARACTERS } from './orbCharacters';

/** The avatars drawn by id, in a picker's order. */
export const SHIPPED_ASSISTANT_CHARACTERS: readonly AssistantCharacter[] = [
  ...ASSISTANT_ORB_CHARACTERS,
  ...CLIPPY_JS_ASSISTANT_CHARACTERS,
  ...ASSISTANT_CHARACTERS,
];

/** The family a character is listed under: a drawing when it says none. */
export const familyOf = (character: {
  family?: AssistantCharacterFamily;
}): AssistantCharacterFamily => character.family ?? 'drawing';

/** An avatar drawn by id; an unknown id is an error, said plainly. */
export function shippedAssistantCharacter(id: string): AssistantCharacter {
  const found = SHIPPED_ASSISTANT_CHARACTERS.find(
    character => character.id === id,
  );
  if (!found) {
    throw new Error(
      `There is no assistant avatar "${id}"; the avatars are ${SHIPPED_ASSISTANT_CHARACTERS.map(c => c.id).join(', ')}.`,
    );
  }
  return found;
}
