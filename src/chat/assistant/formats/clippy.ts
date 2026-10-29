/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The clippy.js character format: an `agent.js` that registers the
 * character's data (`clippy.ready('Name', {...})`), a `map.png` sprite sheet
 * the frames index into, and optionally a `sounds-*.js` that registers its
 * sounds as data URLs (`clippy.soundsReady('Name', {...})`). The JavaScript
 * is read as data, never run.
 *
 * @module chat/assistant/formats/clippy
 */

import { blobBytes, imageTypeOf, objectUrl } from './blobs';
import { type LiteralValue, readRegistrationCall } from './objectLiteral';
import {
  AssistantCharacterFormatError,
  type AssistantCharacterAnimation,
  type AssistantCharacterData,
  type AssistantCharacterFrame,
} from './types';

/** The files of a clippy.js character, as the person picked them. */
export interface ClippyCharacterFiles {
  /** The text of `agent.js`. */
  agentJs: string;
  /** The sprite sheet, `map.png`. */
  mapPng: Blob;
  /** The text of a `sounds-mp3.js` or `sounds-ogg.js`, if picked. */
  soundsJs?: string;
}

type LiteralObject = { [key: string]: LiteralValue };

function fail(message: string): never {
  throw new AssistantCharacterFormatError(message);
}

function isObject(value: LiteralValue): value is LiteralObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: LiteralValue): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function readFrame(
  raw: LiteralValue,
  where: string,
  frameCount: number,
  overlayCount: number,
): AssistantCharacterFrame {
  if (!isObject(raw)) fail(`agent.js: ${where} is not an object.`);
  const duration = raw.duration;
  if (
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    duration < 0
  ) {
    fail(`agent.js: ${where} has no duration in milliseconds.`);
  }
  const frame: AssistantCharacterFrame = { duration, images: [] };
  if (raw.images !== undefined) {
    if (!Array.isArray(raw.images))
      fail(`agent.js: the images of ${where} are not a list.`);
    if (overlayCount > 0 && raw.images.length > overlayCount) {
      fail(
        `agent.js: ${where} layers ${raw.images.length} images, more than its overlayCount of ${overlayCount}.`,
      );
    }
    frame.images = raw.images.map((image, k) => {
      if (
        !Array.isArray(image) ||
        image.length !== 2 ||
        !isCount(image[0]) ||
        !isCount(image[1])
      ) {
        return fail(
          `agent.js: image ${k} of ${where} is not an [x, y] sprite offset.`,
        );
      }
      return { x: image[0], y: image[1] };
    });
  }
  if (raw.sound !== undefined && raw.sound !== null) {
    if (typeof raw.sound !== 'string' && typeof raw.sound !== 'number') {
      fail(`agent.js: the sound of ${where} is not a sound id.`);
    }
    frame.sound = String(raw.sound);
  }
  if (raw.exitBranch !== undefined && raw.exitBranch !== null) {
    if (!isCount(raw.exitBranch) || raw.exitBranch >= frameCount) {
      fail(
        `agent.js: the exitBranch of ${where} is not a frame of its animation.`,
      );
    }
    frame.exitBranch = raw.exitBranch;
  }
  if (raw.branching !== undefined && raw.branching !== null) {
    const branches = isObject(raw.branching)
      ? raw.branching.branches
      : undefined;
    if (!Array.isArray(branches)) {
      fail(`agent.js: the branching of ${where} has no list of branches.`);
    }
    frame.branching = branches.map((branch, k) => {
      if (
        !isObject(branch) ||
        !isCount(branch.frameIndex) ||
        branch.frameIndex >= frameCount ||
        typeof branch.weight !== 'number' ||
        branch.weight < 0
      ) {
        return fail(
          `agent.js: branch ${k} of ${where} is not a frame of its animation with a weight.`,
        );
      }
      return { frameIndex: branch.frameIndex, weight: branch.weight };
    });
  }
  return frame;
}

/** Read the character data of an `agent.js` (no sprite, no sounds). */
export function readClippyAgent(agentJs: string): Omit<
  AssistantCharacterData,
  'sprite'
> & {
  overlayCount: number;
} {
  const { name, data } = readRegistrationCall(
    agentJs,
    /(?:[A-Za-z_$][\w$]*\.)*ready/,
    'agent.js',
  );
  if (!isObject(data))
    fail('agent.js does not register an object of character data.');
  const size = data.framesize;
  if (
    !Array.isArray(size) ||
    size.length !== 2 ||
    !isCount(size[0]) ||
    !isCount(size[1]) ||
    size[0] === 0 ||
    size[1] === 0
  ) {
    fail('agent.js has no framesize: a [width, height] in pixels is required.');
  }
  let overlayCount = 1;
  if (data.overlayCount !== undefined) {
    if (!isCount(data.overlayCount) || data.overlayCount === 0) {
      fail('agent.js: overlayCount is not a positive whole number.');
    }
    overlayCount = data.overlayCount;
  }
  if (!isObject(data.animations)) fail('agent.js has no animations.');
  const animations: Record<string, AssistantCharacterAnimation> = {};
  for (const [animationName, raw] of Object.entries(data.animations)) {
    if (
      !isObject(raw) ||
      !Array.isArray(raw.frames) ||
      raw.frames.length === 0
    ) {
      fail(`agent.js: the animation ${animationName} has no frames.`);
    }
    const frames = raw.frames;
    animations[animationName] = {
      frames: frames.map((frame, k) =>
        readFrame(
          frame,
          `frame ${k} of the animation ${animationName}`,
          frames.length,
          overlayCount,
        ),
      ),
    };
  }
  if (Object.keys(animations).length === 0) fail('agent.js has no animations.');
  return {
    name: name?.trim() || 'Character',
    frameSize: { width: size[0], height: size[1] },
    animations,
    overlayCount,
  };
}

/** Read the sounds of a `sounds-*.js`: sound id to (data) URL. */
export function readClippySounds(soundsJs: string): Record<string, string> {
  const { data } = readRegistrationCall(
    soundsJs,
    /(?:[A-Za-z_$][\w$]*\.)*soundsReady/,
    'The sounds file',
  );
  if (!isObject(data))
    fail('The sounds file does not register an object of sounds.');
  const sounds: Record<string, string> = {};
  for (const [id, url] of Object.entries(data)) {
    if (typeof url !== 'string' || !/^data:audio\//.test(url)) {
      fail(`The sounds file: sound ${id} is not an audio data URL.`);
    }
    sounds[id] = url;
  }
  return sounds;
}

/**
 * Read a clippy.js character from the files a person picked. Everything
 * stays in the page: the sprite becomes an object URL.
 */
export async function readClippyCharacter(
  files: ClippyCharacterFiles,
): Promise<AssistantCharacterData> {
  const agent = readClippyAgent(files.agentJs);
  const sounds =
    files.soundsJs !== undefined ? readClippySounds(files.soundsJs) : undefined;
  if (sounds) {
    for (const [animationName, animation] of Object.entries(agent.animations)) {
      animation.frames.forEach((frame, k) => {
        if (frame.sound !== undefined && !(frame.sound in sounds)) {
          fail(
            `Frame ${k} of the animation ${animationName} plays the sound ${frame.sound}, which the sounds file does not hold.`,
          );
        }
      });
    }
  }
  const head = await blobBytes(files.mapPng.slice(0, 16));
  const type = imageTypeOf(head);
  if (!type) fail('map.png is not an image (PNG, GIF, JPEG or WebP).');
  const sprite = objectUrl(
    files.mapPng.type === type
      ? files.mapPng
      : new Blob([files.mapPng], { type }),
  );
  const { overlayCount: _overlays, ...character } = agent;
  return { ...character, sprite, ...(sounds ? { sounds } : {}) };
}
