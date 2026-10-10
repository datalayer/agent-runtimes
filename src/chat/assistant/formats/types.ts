/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The one shape a character file is read into (LOOP T-26), whatever its
 * format: a sprite sheet, frames that index into it, animations by name.
 *
 * @module chat/assistant/formats/types
 */

/**
 * The shapes of a mouth while the character speaks, as Microsoft Agent
 * names its overlays: closed, wide open (four), medium, narrow.
 */
export type AssistantMouthShape =
  'closed' | 'wide1' | 'wide2' | 'wide3' | 'wide4' | 'medium' | 'narrow';

/** One frame of an animation. */
export interface AssistantCharacterFrame {
  /** How long the frame shows, in milliseconds. */
  duration: number;
  /**
   * The sprite offsets of the frame's images, layered bottom to top: each is
   * the top-left corner, in the sprite sheet, of a `frameSize` cell (drawn as
   * `background-position: -x px -y px`). An empty list is an empty frame.
   */
  images: Array<{ x: number; y: number }>;
  /** The id of the sound played when the frame shows, a key of `sounds`. */
  sound?: string;
  /** Where the animation may jump after this frame, weights in percent. */
  branching?: { frameIndex: number; weight: number }[];
  /** The frame to go to when the animation is asked to end early. */
  exitBranch?: number;
  /**
   * The frame with each mouth the character has for it, drawn while it
   * speaks in place of `images`: the sprite offset of each (Microsoft Agent's
   * mouth overlays, composited into the sheet). Most frames have none.
   */
  mouths?: Partial<Record<AssistantMouthShape, { x: number; y: number }>>;
}

/** A named sequence of frames. */
export interface AssistantCharacterAnimation {
  frames: AssistantCharacterFrame[];
}

/** A character, read from a file a person holds the rights to. */
export interface AssistantCharacterData {
  name: string;
  frameSize: { width: number; height: number };
  /** The sprite sheet: a URL (object URL or data URL) the frames' offsets index into. */
  sprite: string;
  animations: Record<string, AssistantCharacterAnimation>;
  /** Sound id to URL. */
  sounds?: Record<string, string>;
  /**
   * The character's own grouping of its animations into states, when the
   * format carries one (a Microsoft Agent character does: `Showing`,
   * `Hiding`, `Speaking`, `IdlingLevel1`…). Read by `stateAnimations`.
   */
  authoredStates?: Record<string, string[]>;
}

/** A character file that cannot be read: the message says what is wrong. */
export class AssistantCharacterFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssistantCharacterFormatError';
  }
}
