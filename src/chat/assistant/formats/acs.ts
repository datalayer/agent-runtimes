/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Microsoft Agent character format (`.acs`), read in the page after
 * Lebeau's public description (MSAgent Character Data Specification 1.3):
 * an ACSHEADER of four locators — the character (ACSCHARACTERINFO: size,
 * transparent colour, palette, states, names), the animations
 * (ACSANIMATIONINFO, each frame a list of images with offsets, a sound, a
 * duration in 1/100 s, branches), the images (ACSIMAGEINFO: 8-bit
 * bottom-up bitmaps, most compressed) and the sounds (RIFF WAVE).
 *
 * Each distinct frame is composited from its images, as Agent draws it, into
 * one cell of a sprite sheet, so a frame of the result is a single offset.
 *
 * @module chat/assistant/formats/acs
 */

import { decompressAgentData } from './agentCompression';
import { objectUrl } from './blobs';
import {
  AssistantCharacterFormatError,
  type AssistantCharacterAnimation,
  type AssistantCharacterData,
} from './types';

export const ACS_SIGNATURE = 0xabcdabc3;
export const ACF_SIGNATURE = 0xabcdabc4;

/** Character style flags (ACSCHARACTERINFO). */
const STYLE_VOICE = 0x20;
const STYLE_BALLOON = 0x200;

/** The widest a sprite sheet is laid out, and the largest it may be. */
const SHEET_MAX_WIDTH = 4096;
const SHEET_MAX_SIDE = 16384;

export interface AcsLocator {
  offset: number;
  size: number;
}

export interface AcsFrameImage {
  image: number;
  x: number;
  y: number;
}

export interface AcsFrame {
  /** Images, as stored: the first is drawn on top. */
  images: AcsFrameImage[];
  /** Index into the audio list, or -1. */
  sound: number;
  /** In 1/100 s. */
  duration: number;
  /** Frame index, or a negative value for none. */
  exitBranch: number;
  branches: { frameIndex: number; probability: number }[];
}

export interface AcsAnimation {
  name: string;
  transition: number;
  returnAnimation: string;
  frames: AcsFrame[];
}

export interface AcsImageEntry {
  locator: AcsLocator;
}

/** An `.acs` read into its tables, the images not yet decoded. */
export interface AcsFile {
  version: { major: number; minor: number };
  name: string;
  width: number;
  height: number;
  transparentIndex: number;
  /** RGBA, one entry per palette index. */
  palette: Uint32Array;
  states: Record<string, string[]>;
  animations: AcsAnimation[];
  images: AcsImageEntry[];
  sounds: AcsLocator[];
  bytes: Uint8Array;
}

/** A decoded image: palette indices, top row first, no padding. */
export interface AcsImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

class Reader {
  private readonly view: DataView;
  pos = 0;

  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  need(count: number, what: string): void {
    if (count < 0 || this.pos + count > this.bytes.length) {
      throw new AssistantCharacterFormatError(
        `This .acs ends early: ${what} at byte ${this.pos} runs past the end of the file.`,
      );
    }
  }
  seek(locator: AcsLocator, what: string): void {
    if (locator.offset + locator.size > this.bytes.length) {
      throw new AssistantCharacterFormatError(
        `This .acs is damaged: ${what} is said to be at byte ${locator.offset}, past the end of the file.`,
      );
    }
    this.pos = locator.offset;
  }
  u8(what: string): number {
    this.need(1, what);
    return this.view.getUint8(this.pos++);
  }
  u16(what: string): number {
    this.need(2, what);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  i16(what: string): number {
    this.need(2, what);
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u32(what: string): number {
    this.need(4, what);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  skip(count: number, what: string): void {
    this.need(count, what);
    this.pos += count;
  }
  take(count: number, what: string): Uint8Array {
    this.need(count, what);
    const out = this.bytes.subarray(this.pos, this.pos + count);
    this.pos += count;
    return out;
  }
  locator(what: string): AcsLocator {
    return { offset: this.u32(what), size: this.u32(what) };
  }
  /** STRING: a ULONG count of UTF-16 characters, then a null terminator. */
  string(what: string): string {
    const count = this.u32(what);
    if (count === 0) return '';
    this.need((count + 1) * 2, what);
    let out = '';
    for (let k = 0; k < count; k++) {
      out += String.fromCharCode(this.view.getUint16(this.pos + k * 2, true));
    }
    this.pos += (count + 1) * 2;
    return out;
  }
}

function readCharacterInfo(r: Reader, at: AcsLocator) {
  r.seek(at, 'the character information');
  const minor = r.u16('the version');
  const major = r.u16('the version');
  const localized = r.locator('the names locator');
  r.skip(16, 'the character id');
  const width = r.u16('the character width');
  const height = r.u16('the character height');
  const transparentIndex = r.u8('the transparent colour');
  const style = r.u32('the character style');
  r.skip(4, 'the animation set version');
  if (style & STYLE_VOICE) {
    r.skip(16 + 16 + 4 + 2, 'the voice');
    if (r.u8('the voice') !== 0) {
      r.skip(2, 'the voice language');
      r.string('the voice dialect');
      r.skip(4, 'the voice gender and age');
      r.string('the voice style');
    }
  }
  if (style & STYLE_BALLOON) {
    r.skip(2 + 12, 'the balloon');
    r.string('the balloon font');
    r.skip(4 + 4 + 1 + 1, 'the balloon font');
  }
  const colours = r.u32('the colour table');
  if (colours === 0 || colours > 256) {
    throw new AssistantCharacterFormatError(
      `This .acs is damaged or of an unknown version: its colour table says ${colours} colours, where 1 to 256 are expected.`,
    );
  }
  const palette = new Uint32Array(256);
  const table = r.take(colours * 4, 'the colour table');
  for (let k = 0; k < colours; k++) {
    // RGBQUAD is blue, green, red, reserved; stored as RGBA in little-endian order.
    const b = table[k * 4];
    const g = table[k * 4 + 1];
    const red = table[k * 4 + 2];
    palette[k] = (0xff << 24) | (b << 16) | (g << 8) | red;
  }
  if (r.u8('the tray icon flag') !== 0) {
    r.skip(r.u32('the tray icon'), 'the tray icon');
    r.skip(r.u32('the tray icon'), 'the tray icon');
  }
  const states: Record<string, string[]> = {};
  const stateCount = r.u16('the states');
  for (let s = 0; s < stateCount; s++) {
    const name = r.string('a state name');
    const count = r.u16('the animations of a state');
    const names: string[] = [];
    for (let k = 0; k < count; k++)
      names.push(r.string('an animation of a state'));
    states[name] = names;
  }
  let name = '';
  if (localized.size > 0) {
    r.seek(localized, 'the character names');
    const count = r.u16('the character names');
    const names: { lang: number; name: string }[] = [];
    for (let k = 0; k < count; k++) {
      const lang = r.u16('a name language');
      const value = r.string('a character name');
      r.string('a character description');
      r.string('a character extra data');
      names.push({ lang, name: value });
    }
    // English (0x09 primary language) when there is one, else the first.
    name = (names.find(n => (n.lang & 0x3ff) === 0x09) ?? names[0])?.name ?? '';
  }
  return {
    version: { major, minor },
    width,
    height,
    transparentIndex,
    palette,
    states,
    name: name.trim() || 'Character',
  };
}

function readFrames(r: Reader, animation: string): AcsFrame[] {
  const frameCount = r.u16(`the frames of ${animation}`);
  const frames: AcsFrame[] = [];
  for (let f = 0; f < frameCount; f++) {
    const where = `frame ${f} of ${animation}`;
    const imageCount = r.u16(where);
    const images: AcsFrameImage[] = [];
    for (let k = 0; k < imageCount; k++) {
      images.push({ image: r.u32(where), x: r.i16(where), y: r.i16(where) });
    }
    const sound = r.i16(where);
    const duration = r.u16(where);
    const exitBranch = r.i16(where);
    const branches: AcsFrame['branches'] = [];
    const branchCount = r.u8(where);
    for (let k = 0; k < branchCount; k++) {
      branches.push({ frameIndex: r.u16(where), probability: r.u16(where) });
    }
    const overlayCount = r.u8(where);
    for (let k = 0; k < overlayCount; k++) {
      // Mouth overlays, drawn only while Agent speaks: read past, not kept.
      // Type, replace flag, image index, an unknown byte; then the region flag.
      r.skip(5, where);
      const hasRegion = r.u8(where) !== 0;
      r.skip(8, where);
      if (hasRegion) r.skip(r.u32(where), where);
    }
    frames.push({ images, sound, duration, exitBranch, branches });
  }
  return frames;
}

/**
 * Read the tables of an `.acs`: the character, its animations and frames,
 * where its images and sounds are. Images are decoded by `decodeAcsImage`.
 */
export function parseAcs(buffer: ArrayBuffer): AcsFile {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 36) {
    throw new AssistantCharacterFormatError(
      `This is not a Microsoft Agent character: the file is ${bytes.length} bytes, shorter than the header of an .acs.`,
    );
  }
  const r = new Reader(bytes);
  const signature = r.u32('the signature');
  if (signature === ACF_SIGNATURE) {
    throw new AssistantCharacterFormatError(
      'This is a Microsoft Agent .acf, whose animations are in separate .aca files: .acf is not read yet, load the .acs of the character.',
    );
  }
  if (signature !== ACS_SIGNATURE) {
    throw new AssistantCharacterFormatError(
      `This is not a Microsoft Agent character (.acs): it starts with 0x${signature.toString(16).padStart(8, '0')}, not 0xabcdabc3.`,
    );
  }
  const characterAt = r.locator('the header');
  const animationsAt = r.locator('the header');
  const imagesAt = r.locator('the header');
  const soundsAt = r.locator('the header');

  const info = readCharacterInfo(r, characterAt);
  if (info.width === 0 || info.height === 0) {
    throw new AssistantCharacterFormatError(
      `This .acs is damaged: its character is ${info.width}×${info.height} pixels.`,
    );
  }

  r.seek(imagesAt, 'the image list');
  const imageCount = r.u32('the image list');
  r.need(imageCount * 12, 'the image list');
  const images: AcsImageEntry[] = [];
  for (let k = 0; k < imageCount; k++) {
    images.push({ locator: r.locator('the image list') });
    r.skip(4, 'the image list');
  }

  const sounds: AcsLocator[] = [];
  if (soundsAt.size > 0) {
    r.seek(soundsAt, 'the sound list');
    const soundCount = r.u32('the sound list');
    r.need(soundCount * 12, 'the sound list');
    for (let k = 0; k < soundCount; k++) {
      const locator = r.locator('the sound list');
      r.skip(4, 'the sound list');
      if (locator.offset + locator.size > bytes.length) {
        throw new AssistantCharacterFormatError(
          `This .acs is damaged: sound ${k} is said to be past the end of the file.`,
        );
      }
      sounds.push(locator);
    }
  }

  r.seek(animationsAt, 'the animation list');
  const animationCount = r.u32('the animation list');
  const entries: { name: string; at: AcsLocator }[] = [];
  for (let k = 0; k < animationCount; k++) {
    const name = r.string('an animation name');
    entries.push({ name, at: r.locator(`the locator of ${name}`) });
  }
  if (entries.length === 0) {
    throw new AssistantCharacterFormatError('This .acs has no animations.');
  }
  const animations: AcsAnimation[] = entries.map(({ name, at }) => {
    r.seek(at, `the animation ${name}`);
    r.string(`the animation ${name}`);
    const transition = r.u8(`the animation ${name}`);
    const returnAnimation = r.string(`the animation ${name}`);
    const frames = readFrames(r, `the animation ${name}`);
    frames.forEach((frame, f) => {
      for (const image of frame.images) {
        if (image.image >= images.length) {
          throw new AssistantCharacterFormatError(
            `This .acs is damaged: frame ${f} of ${name} draws image ${image.image}, and there are ${images.length}.`,
          );
        }
      }
      if (frame.sound >= sounds.length) {
        throw new AssistantCharacterFormatError(
          `This .acs is damaged: frame ${f} of ${name} plays sound ${frame.sound}, and there are ${sounds.length}.`,
        );
      }
      for (const branch of frame.branches) {
        if (branch.frameIndex >= frames.length) {
          throw new AssistantCharacterFormatError(
            `This .acs is damaged: frame ${f} of ${name} branches to frame ${branch.frameIndex}, and there are ${frames.length}.`,
          );
        }
      }
    });
    return { name, transition, returnAnimation, frames };
  });

  return {
    version: info.version,
    name: info.name,
    width: info.width,
    height: info.height,
    transparentIndex: info.transparentIndex,
    palette: info.palette,
    states: info.states,
    animations,
    images,
    sounds,
    bytes,
  };
}

/** Decode one image of an `.acs` into palette indices, top row first. */
export function decodeAcsImage(file: AcsFile, index: number): AcsImage {
  const entry = file.images[index];
  if (!entry) {
    throw new AssistantCharacterFormatError(`This .acs has no image ${index}.`);
  }
  const r = new Reader(file.bytes);
  const what = `image ${index}`;
  r.seek(entry.locator, what);
  r.skip(1, what);
  const width = r.u16(what);
  const height = r.u16(what);
  const compressed = r.u8(what) !== 0;
  const stride = (width + 3) & ~3;
  const size = stride * height;
  let bitmap: Uint8Array;
  if (compressed) {
    const data = r.take(r.u32(what), what);
    bitmap = decompressAgentData(data, size, `Image ${index} of this .acs`);
  } else {
    // The specification puts a DATABLOCK (a size, then the bits) here; take
    // the bits directly when the size is not there.
    const start = r.pos;
    const announced = r.pos + 4 <= file.bytes.length ? r.u32(what) : -1;
    if (announced !== size) r.pos = start;
    bitmap = r.take(size, what);
  }
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    // Bitmaps are stored bottom-up.
    pixels.set(
      bitmap.subarray(
        (height - 1 - y) * stride,
        (height - 1 - y) * stride + width,
      ),
      y * width,
    );
  }
  return { width, height, pixels };
}

/** One cell of the sprite sheet: the frames that look the same share it. */
export interface AcsSpriteLayout {
  columns: number;
  rows: number;
  /** The images of each cell, as stored in the frame (first on top). */
  cells: AcsFrameImage[][];
  /** For each animation, for each frame, its cell, or -1 for an empty frame. */
  frameCells: number[][];
}

/** Assign a cell to each distinct, non-empty frame. */
export function layoutAcsSprite(file: AcsFile): AcsSpriteLayout {
  const cells: AcsFrameImage[][] = [];
  const byKey = new Map<string, number>();
  const frameCells = file.animations.map(animation =>
    animation.frames.map(frame => {
      if (frame.images.length === 0) return -1;
      const key = frame.images.map(i => `${i.image},${i.x},${i.y}`).join(';');
      let cell = byKey.get(key);
      if (cell === undefined) {
        cell = cells.length;
        cells.push(frame.images);
        byKey.set(key, cell);
      }
      return cell;
    }),
  );
  const count = Math.max(1, cells.length);
  // Near square, and no wider than SHEET_MAX_WIDTH.
  const columns = Math.max(
    1,
    Math.min(
      Math.floor(SHEET_MAX_WIDTH / file.width),
      Math.ceil(Math.sqrt((count * file.height) / file.width)),
    ),
  );
  const rows = Math.ceil(count / columns);
  if (
    columns * file.width > SHEET_MAX_SIDE ||
    rows * file.height > SHEET_MAX_SIDE
  ) {
    throw new AssistantCharacterFormatError(
      `This .acs has ${cells.length} distinct frames of ${file.width}×${file.height} pixels, more than one sprite sheet can hold.`,
    );
  }
  return { columns, rows, cells, frameCells };
}

/**
 * Composite a cell as Agent draws a frame: its images from last to first,
 * each at its offset, the transparent colour left clear. RGBA, frame-sized.
 */
export function composeAcsCell(
  file: AcsFile,
  images: AcsFrameImage[],
  decode: (index: number) => AcsImage = index => decodeAcsImage(file, index),
): Uint8ClampedArray {
  const { width, height, transparentIndex, palette } = file;
  const out = new Uint32Array(width * height);
  for (let k = images.length - 1; k >= 0; k--) {
    const { image, x, y } = images[k];
    const decoded = decode(image);
    for (let row = 0; row < decoded.height; row++) {
      const ty = y + row;
      if (ty < 0 || ty >= height) continue;
      for (let col = 0; col < decoded.width; col++) {
        const tx = x + col;
        if (tx < 0 || tx >= width) continue;
        const index = decoded.pixels[row * decoded.width + col];
        if (index !== transparentIndex) {
          out[ty * width + tx] = palette[index];
        }
      }
    }
  }
  return new Uint8ClampedArray(out.buffer);
}

interface SheetCanvas {
  width: number;
  height: number;
}
interface SheetContext {
  createImageData(width: number, height: number): ImageData;
  putImageData(data: ImageData, x: number, y: number): void;
}

/** A canvas to draw the sheet on: an OffscreenCanvas, else a DOM canvas. */
function makeSheet(
  width: number,
  height: number,
): {
  context: SheetContext;
  toBlob: () => Promise<Blob>;
} {
  let canvas: SheetCanvas;
  let toBlob: () => Promise<Blob>;
  if (typeof OffscreenCanvas !== 'undefined') {
    const offscreen = new OffscreenCanvas(width, height);
    canvas = offscreen;
    toBlob = () => offscreen.convertToBlob({ type: 'image/png' });
  } else if (typeof document !== 'undefined') {
    const element = document.createElement('canvas');
    element.width = width;
    element.height = height;
    canvas = element;
    toBlob = () =>
      new Promise((resolve, reject) =>
        element.toBlob(
          blob =>
            blob
              ? resolve(blob)
              : reject(
                  new AssistantCharacterFormatError(
                    'The sprite sheet of this .acs could not be drawn.',
                  ),
                ),
          'image/png',
        ),
      );
  } else {
    throw new AssistantCharacterFormatError(
      'This page has no canvas to draw the character on.',
    );
  }
  const context = (canvas as OffscreenCanvas).getContext(
    '2d',
  ) as SheetContext | null;
  if (!context) {
    throw new AssistantCharacterFormatError(
      'This page has no 2D canvas to draw the character on.',
    );
  }
  return { context, toBlob };
}

/**
 * Read a Microsoft Agent character (`.acs`) a person picked: its animations,
 * a sprite sheet drawn in the page (an object URL), its sounds as object
 * URLs. Nothing leaves the page.
 */
export async function readAcsCharacter(
  buffer: ArrayBuffer,
): Promise<AssistantCharacterData> {
  const file = parseAcs(buffer);
  const layout = layoutAcsSprite(file);
  const { width, height } = file;

  const decoded = new Map<number, AcsImage>();
  const decode = (index: number): AcsImage => {
    let image = decoded.get(index);
    if (!image) {
      image = decodeAcsImage(file, index);
      decoded.set(index, image);
    }
    return image;
  };
  const sheet = makeSheet(layout.columns * width, layout.rows * height);
  const cellAt = (cell: number) => ({
    x: (cell % layout.columns) * width,
    y: Math.floor(cell / layout.columns) * height,
  });
  layout.cells.forEach((images, cell) => {
    const data = sheet.context.createImageData(width, height);
    data.data.set(composeAcsCell(file, images, decode));
    const { x, y } = cellAt(cell);
    sheet.context.putImageData(data, x, y);
  });
  const sprite = objectUrl(await sheet.toBlob());

  const used = new Set<number>();
  const animations: Record<string, AssistantCharacterAnimation> = {};
  file.animations.forEach((animation, a) => {
    animations[animation.name] = {
      frames: animation.frames.map((frame, f) => {
        const cell = layout.frameCells[a][f];
        if (frame.sound >= 0) used.add(frame.sound);
        return {
          duration: frame.duration * 10,
          images: cell < 0 ? [] : [cellAt(cell)],
          ...(frame.sound >= 0 ? { sound: String(frame.sound) } : {}),
          ...(frame.branches.length
            ? {
                branching: frame.branches.map(b => ({
                  frameIndex: b.frameIndex,
                  weight: b.probability,
                })),
              }
            : {}),
          ...(frame.exitBranch >= 0 &&
          frame.exitBranch < animation.frames.length
            ? { exitBranch: frame.exitBranch }
            : {}),
        };
      }),
    };
  });

  let sounds: Record<string, string> | undefined;
  if (used.size > 0) {
    sounds = {};
    for (const index of [...used].sort((x, y) => x - y)) {
      const { offset, size } = file.sounds[index];
      sounds[String(index)] = objectUrl(
        new Blob([file.bytes.slice(offset, offset + size)], {
          type: 'audio/wav',
        }),
      );
    }
  }

  return {
    name: file.name,
    frameSize: { width, height },
    sprite,
    animations,
    ...(sounds ? { sounds } : {}),
    authoredStates: file.states,
  };
}
