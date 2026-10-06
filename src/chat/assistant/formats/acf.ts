/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Microsoft Agent's character for the web (LOOP T-26): an `.acf` that holds
 * the character — its size, palette, states, names — and names one `.aca`
 * file per animation, each holding that animation's frames, images, sounds
 * and mouths. Read in the page after Lebeau's public description (MSAgent
 * Character Data Specification 1.3, "ACF Format", "ACA Format"), from the
 * files a person picked together; nothing is fetched and nothing is sent.
 *
 * An `.aca` frame is one image, the frame's images composited when the
 * file was compiled; its mouths are images of their own, drawn over the
 * frame's image or over a base image that stands for the frame without its
 * top image.
 *
 * Checked against hand-built files only, as the `.acs` reader was: no
 * character of Microsoft's is in the repository.
 *
 * @module chat/assistant/formats/acf
 */

import { decompressAgentData } from './agentCompression';
import {
  ACF_SIGNATURE,
  AgentReader,
  drawAgentCharacter,
  type AcsAnimation,
  type AcsFrame,
  type AcsImage,
  type AcsOverlay,
} from './acs';
import {
  AssistantCharacterFormatError,
  type AssistantCharacterData,
} from './types';

/** An animation the `.acf` names, and the `.aca` file that holds it. */
export interface AcfAnimationEntry {
  name: string;
  /** The `.aca` file's name, without a folder. */
  file: string;
  returnAnimation: string;
  checksum: number;
}

/** An `.acf` read: the character, and where its animations are. */
export interface AcfFile {
  version: { major: number; minor: number };
  name: string;
  width: number;
  height: number;
  transparentIndex: number;
  /** RGBA, one entry per palette index. */
  palette: Uint32Array;
  states: Record<string, string[]>;
  animations: AcfAnimationEntry[];
}

/** One `.aca` read: its frames index its own images and sounds. */
export interface AcaFile {
  version: { major: number; minor: number };
  checksum: number;
  transition: number;
  frames: AcsFrame[];
  images: AcsImage[];
  sounds: Uint8Array[];
}

/** No image, or no sound, in an `.aca` frame. */
const NONE = 0xffff;

/** A bottom-up 8-bit bitmap, its rows padded to four bytes, top row first. */
function topDown(
  bitmap: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const stride = (width + 3) & ~3;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const from = (height - 1 - y) * stride;
    pixels.set(bitmap.subarray(from, from + width), y * width);
  }
  return pixels;
}

const strideSize = (width: number, height: number): number =>
  ((width + 3) & ~3) * height;

/**
 * Read an `.acf`: its header, its character data (compressed or not), the
 * animations it names.
 */
export function parseAcf(buffer: ArrayBuffer): AcfFile {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 12) {
    throw new AssistantCharacterFormatError(
      `This is not a Microsoft Agent .acf: the file is ${bytes.length} bytes, shorter than its header.`,
    );
  }
  const header = new AgentReader(bytes, '.acf', false);
  const signature = header.u32('the signature');
  if (signature !== ACF_SIGNATURE) {
    throw new AssistantCharacterFormatError(
      `This is not a Microsoft Agent .acf: it starts with 0x${signature.toString(16).padStart(8, '0')}, not 0xabcdabc4.`,
    );
  }
  const size = header.u32('the header');
  const compressed = header.u32('the header');
  const data =
    compressed > 0
      ? decompressAgentData(
          header.take(compressed, 'the character data'),
          size,
          'The character data of this .acf',
        )
      : header.take(size, 'the character data');

  const r = new AgentReader(data, '.acf', false);
  const minor = r.u16('the version');
  const major = r.u16('the version');
  const animations: AcfAnimationEntry[] = [];
  const animationCount = r.u16('the animations');
  for (let k = 0; k < animationCount; k++) {
    const name = r.string('an animation name');
    const file = r.string(`the file of ${name}`);
    const returnAnimation = r.string(`the return animation of ${name}`);
    const checksum = r.u32(`the checksum of ${name}`);
    animations.push({ name, file, returnAnimation, checksum });
  }
  if (animations.length === 0) {
    throw new AssistantCharacterFormatError('This .acf has no animations.');
  }
  r.u32('the character style');
  r.skip(16, 'the character id');
  const names: { lang: number; name: string }[] = [];
  const nameCount = r.u16('the character names');
  for (let k = 0; k < nameCount; k++) {
    const lang = r.u16('a name language');
    const value = r.string('a character name');
    r.string('a character description');
    r.string('a character extra data');
    names.push({ lang, name: value });
  }
  const width = r.u16('the character width');
  const height = r.u16('the character height');
  const transparentIndex = r.u8('the transparent colour');
  if (width === 0 || height === 0) {
    throw new AssistantCharacterFormatError(
      `This .acf is damaged: its character is ${width}×${height} pixels.`,
    );
  }
  const colours = r.u32('the colour table');
  if (colours === 0 || colours > 256) {
    throw new AssistantCharacterFormatError(
      `This .acf is damaged or of an unknown version: its colour table says ${colours} colours, where 1 to 256 are expected.`,
    );
  }
  const palette = new Uint32Array(256);
  const table = r.take(colours * 4, 'the colour table');
  for (let k = 0; k < colours; k++) {
    // RGBQUAD is blue, green, red, reserved; kept as RGBA in little-endian order.
    palette[k] =
      (0xff << 24) |
      (table[k * 4] << 16) |
      (table[k * 4 + 1] << 8) |
      table[k * 4 + 2];
  }
  const states: Record<string, string[]> = {};
  const stateCount = r.u16('the states');
  for (let s = 0; s < stateCount; s++) {
    const state = r.string('a state name');
    const count = r.u16('the animations of a state');
    const list: string[] = [];
    for (let k = 0; k < count; k++) {
      list.push(r.string('an animation of a state'));
    }
    states[state] = list;
  }
  // English (0x09 primary language) when there is one, else the first.
  const name =
    (names.find(n => (n.lang & 0x3ff) === 0x09) ?? names[0])?.name ?? '';
  return {
    version: { major, minor },
    name: name.trim() || 'Character',
    width,
    height,
    transparentIndex,
    palette,
    states,
    animations,
  };
}

/** A DATABLOCK: a ULONG size, then the bytes. */
const dataBlock = (r: AgentReader, what: string): Uint8Array =>
  r.take(r.u32(what), what);

/**
 * Read one `.aca`, for a character of `width`×`height`: its sounds, its
 * images (frame-sized), its frames and their mouths. `file` names it in the
 * sentences that refuse it.
 */
export function parseAca(
  buffer: ArrayBuffer,
  width: number,
  height: number,
  file: string,
): AcaFile {
  const bytes = new Uint8Array(buffer);
  const header = new AgentReader(bytes, file, false);
  const minor = header.u16('the version');
  const major = header.u16('the version');
  const checksum = header.u32('the checksum');
  const compressed = header.u8('the compression flag') !== 0;
  let data: Uint8Array;
  if (compressed) {
    const size = header.u32('the size of the animation');
    const packed = header.u32('the size of the animation');
    data = decompressAgentData(
      header.take(packed, 'the animation'),
      size,
      `The animation in ${file}`,
    );
  } else {
    data = bytes.subarray(header.pos);
  }

  const r = new AgentReader(data, file, false);
  const sounds: Uint8Array[] = [];
  const soundCount = r.u16('the sounds');
  for (let k = 0; k < soundCount; k++) {
    sounds.push(dataBlock(r, `sound ${k}`));
  }
  const frameSize = strideSize(width, height);
  const images: AcsImage[] = [];
  const frameImage = (bitmap: Uint8Array, what: string): AcsImage => {
    if (bitmap.length !== frameSize) {
      throw new AssistantCharacterFormatError(
        `${file} is not of this character: ${what} holds ${bitmap.length} bytes, where a ${width}×${height} frame takes ${frameSize}.`,
      );
    }
    return { width, height, pixels: topDown(bitmap, width, height) };
  };
  const imageCount = r.u16('the images');
  for (let k = 0; k < imageCount; k++) {
    const size = r.u32(`image ${k}`);
    r.skip(1, `image ${k}`);
    images.push(frameImage(r.take(size, `image ${k}`), `image ${k}`));
    dataBlock(r, `the region of image ${k}`);
  }
  const transition = r.u8('the transition');
  const frames: AcsFrame[] = [];
  const frameCount = r.u16('the frames');
  for (let f = 0; f < frameCount; f++) {
    const where = `frame ${f}`;
    const image = r.u16(where);
    const sound = r.u16(where);
    const duration = r.u16(where);
    r.skip(4, where);
    const exitBranch = r.i16(where);
    const branches: AcsFrame['branches'] = [];
    const branchCount = r.u8(where);
    for (let k = 0; k < branchCount; k++) {
      branches.push({ frameIndex: r.u16(where), probability: r.u16(where) });
    }
    const overlays: AcsOverlay[] = [];
    const overlayCount = r.u8(where);
    for (let k = 0; k < overlayCount; k++) {
      const what = `a mouth of frame ${f}`;
      const replaceTop = r.u8(what) !== 0;
      let base: number | undefined;
      if (replaceTop) {
        // The frame without its top image, which the mouth is drawn over.
        images.push(frameImage(dataBlock(r, what), what));
        base = images.length - 1;
        dataBlock(r, what);
      }
      const type = r.u8(what);
      const size = r.u32(what);
      r.skip(1, what);
      const hasRegion = r.u8(what) !== 0;
      const x = r.i16(what);
      const y = r.i16(what);
      const halfWidth = r.u16(what);
      const halfHeight = r.u16(what);
      const bitmap = r.take(size, what);
      if (hasRegion) dataBlock(r, what);
      // Its size is said halved: the bytes say which it is.
      const [w, h] =
        strideSize(halfWidth * 2, halfHeight * 2) === size
          ? [halfWidth * 2, halfHeight * 2]
          : strideSize(halfWidth, halfHeight) === size
            ? [halfWidth, halfHeight]
            : [0, 0];
      if (w === 0 || h === 0) {
        throw new AssistantCharacterFormatError(
          `${file} is damaged: ${what} holds ${size} bytes, which an image of ${halfWidth * 2}×${halfHeight * 2} pixels does not.`,
        );
      }
      images.push({ width: w, height: h, pixels: topDown(bitmap, w, h) });
      overlays.push({
        type,
        replaceTop,
        image: images.length - 1,
        x,
        y,
        ...(base !== undefined ? { base: [{ image: base, x: 0, y: 0 }] } : {}),
      });
    }
    if (image !== NONE && image >= imageCount) {
      throw new AssistantCharacterFormatError(
        `${file} is damaged: frame ${f} draws image ${image}, and there are ${imageCount}.`,
      );
    }
    if (sound !== NONE && sound >= soundCount) {
      throw new AssistantCharacterFormatError(
        `${file} is damaged: frame ${f} plays sound ${sound}, and there are ${soundCount}.`,
      );
    }
    frames.push({
      images: image === NONE ? [] : [{ image, x: 0, y: 0 }],
      sound: sound === NONE ? -1 : sound,
      duration,
      exitBranch,
      branches,
      overlays,
    });
  }
  frames.forEach((frame, f) => {
    for (const branch of frame.branches) {
      if (branch.frameIndex >= frames.length) {
        throw new AssistantCharacterFormatError(
          `${file} is damaged: frame ${f} branches to frame ${branch.frameIndex}, and there are ${frames.length}.`,
        );
      }
    }
  });
  return {
    version: { major, minor },
    checksum,
    transition,
    frames,
    images,
    sounds,
  };
}

/**
 * Read a Microsoft Agent character for the web: its `.acf` and the `.aca`
 * files it names, picked together (`acas` by file name, any case). Every
 * animation the `.acf` names has to be there, the one it names (by its
 * checksum); otherwise it is refused in a sentence. Drawn in the page as an
 * `.acs` is: a sprite sheet, its mouths, its sounds, all object URLs.
 */
export async function readAcfCharacter(
  acf: ArrayBuffer,
  acas: Readonly<Record<string, ArrayBuffer>>,
): Promise<AssistantCharacterData> {
  const file = parseAcf(acf);
  const byName = new Map(
    Object.entries(acas).map(([name, buffer]) => [name.toLowerCase(), buffer]),
  );
  const missing = file.animations.filter(
    entry => !byName.has(entry.file.toLowerCase()),
  );
  if (missing.length > 0) {
    const named = missing
      .slice(0, 3)
      .map(entry => entry.file)
      .join(', ');
    throw new AssistantCharacterFormatError(
      `This .acf names ${missing.length} animation file${missing.length === 1 ? '' : 's'} that ${missing.length === 1 ? 'was' : 'were'} not picked (${named}${missing.length > 3 ? '…' : ''}): pick the .acf with every .aca beside it.`,
    );
  }
  const images: AcsImage[] = [];
  const sounds: Uint8Array[] = [];
  const animations: AcsAnimation[] = file.animations.map(entry => {
    const aca = parseAca(
      byName.get(entry.file.toLowerCase()) as ArrayBuffer,
      file.width,
      file.height,
      entry.file,
    );
    if (aca.checksum !== entry.checksum) {
      throw new AssistantCharacterFormatError(
        `${entry.file} is not the one this .acf names for ${entry.name}: their checksums differ.`,
      );
    }
    const imageBase = images.length;
    const soundBase = sounds.length;
    images.push(...aca.images);
    sounds.push(...aca.sounds);
    const shift = (list: AcsFrame['images']) =>
      list.map(i => ({ ...i, image: i.image + imageBase }));
    return {
      name: entry.name,
      transition: aca.transition,
      returnAnimation: entry.returnAnimation,
      frames: aca.frames.map(frame => ({
        ...frame,
        images: shift(frame.images),
        sound: frame.sound < 0 ? -1 : frame.sound + soundBase,
        overlays: frame.overlays.map(overlay => ({
          ...overlay,
          image: overlay.image + imageBase,
          ...(overlay.base ? { base: shift(overlay.base) } : {}),
        })),
      })),
    };
  });
  return drawAgentCharacter({
    name: file.name,
    width: file.width,
    height: file.height,
    transparentIndex: file.transparentIndex,
    palette: file.palette,
    states: file.states,
    animations,
    decode: index => images[index],
    sound: index => sounds[index],
  });
}
