// @vitest-environment jsdom
/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Character files a person brings (T-26): clippy.js maps and Microsoft Agent
 * .acs files, and .acf files with their .aca files, from small synthetic
 * fixtures built here — no character of Microsoft's is in the repository.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AssistantCharacterFormatError,
  CHARACTER_FILES_EXPECTED,
  characterFilesOf,
  readCharacterFiles,
  type AssistantCharacterData,
  composeAcsCell,
  decodeAcsImage,
  decompressAgentData,
  parseAca,
  parseAcf,
  parseAcs,
  readAcfCharacter,
  readAcsCharacter,
  readClippyCharacter,
  stateAnimations,
} from '../assistant/formats';

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

let urls: Blob[];
beforeEach(() => {
  urls = [];
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL =
    (b: Blob) => {
      urls.push(b);
      return `blob:test/${urls.length}`;
    };
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected a rejection');
}

function thrown(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected a throw');
}

// ---------------------------------------------------------------- clippy.js

const AGENT_JS = `
// A tiny character in the clippy.js shape.
clippy.ready('Paperclip', {
  overlayCount: 2,
  sounds: ['1'],
  framesize: [124, 93],
  animations: {
    'Idle1_1': { frames: [
      { duration: 100, images: [[0, 0]] },
      { duration: 200, images: [[124, 0], [248, 0]], sound: '1',
        branching: { branches: [{ frameIndex: 0, weight: 40 }] }, exitBranch: 0 },
    ] },
    "Wave": { frames: [ { duration: 50 }, ], },
    /* trailing commas and comments are fine */
    Thinking: { frames: [ { "duration": 120, "images": [[0, 93]] } ] },
  },
});
`;

describe('the files a person picked (readCharacterFiles)', () => {
  // jsdom's Blob has no text(): the agent.js's is given.
  const named = (name: string, parts: BlobPart[] = []) =>
    Object.assign(new Blob(parts), {
      name,
      text: async () => parts.map(String).join(''),
    });

  it('takes an .acs alone, or a clippy.js agent.js with its map and sounds', () => {
    const acs = named('Peedy.ACS');
    expect(characterFilesOf([named('x.png'), acs])).toEqual({
      kind: 'acs',
      acs,
    });
    const agentJs = named('agent.js');
    const map = named('map.png');
    const sounds = named('sounds-mp3.js');
    expect(characterFilesOf([map, sounds, agentJs])).toEqual({
      kind: 'clippy',
      agentJs,
      map,
      sounds,
    });
  });

  it('refuses a map without its agent.js, in a sentence', async () => {
    expect(characterFilesOf([named('map.png')])).toEqual({
      problem: CHARACTER_FILES_EXPECTED,
    });
    const error = await rejection(readCharacterFiles([named('map.png')]));
    expect(error).toBeInstanceOf(AssistantCharacterFormatError);
    expect(error.message).toBe(CHARACTER_FILES_EXPECTED);
  });

  it('reads a clippy.js character from its files', async () => {
    const character = await readCharacterFiles([
      named('agent.js', [AGENT_JS]),
      named('map.png', [PNG]),
    ]);
    expect(character.name).toBe('Paperclip');
    expect(character.sprite).toBe('blob:test/1');
  });
});

describe('readClippyCharacter', () => {
  it('reads the agent, the sprite and the sounds', async () => {
    const character = await readClippyCharacter({
      agentJs: AGENT_JS,
      mapPng: new Blob([PNG]),
      soundsJs: `clippy.soundsReady("Paperclip", { "1": "data:audio/mpeg;base64,AAAA" });`,
    });
    expect(character.name).toBe('Paperclip');
    expect(character.frameSize).toEqual({ width: 124, height: 93 });
    expect(character.sprite).toBe('blob:test/1');
    expect(urls[0].type).toBe('image/png');
    expect(Object.keys(character.animations)).toEqual([
      'Idle1_1',
      'Wave',
      'Thinking',
    ]);
    expect(character.animations.Idle1_1.frames[1]).toEqual({
      duration: 200,
      images: [
        { x: 124, y: 0 },
        { x: 248, y: 0 },
      ],
      sound: '1',
      branching: [{ frameIndex: 0, weight: 40 }],
      exitBranch: 0,
    });
    expect(character.animations.Wave.frames[0]).toEqual({
      duration: 50,
      images: [],
    });
    expect(character.sounds).toEqual({ '1': 'data:audio/mpeg;base64,AAAA' });
  });

  it('accepts clippy.agent.ready and a plain JSON file', async () => {
    const json =
      '{"framesize":[10,10],"animations":{"Idle1_1":{"frames":[{"duration":1,"images":[[0,0]]}]}}}';
    const a = await readClippyCharacter({
      agentJs: `clippy.agent.ready('A', ${json});`,
      mapPng: new Blob([PNG]),
    });
    expect(a.name).toBe('A');
    const b = await readClippyCharacter({
      agentJs: json,
      mapPng: new Blob([PNG]),
    });
    expect(b.name).toBe('Character');
    expect(b.sounds).toBeUndefined();
  });

  it('never runs the file: code where data is expected is refused', async () => {
    const error = await rejection(
      readClippyCharacter({
        agentJs: `clippy.ready('X', { framesize: [1, 1], animations: steal(document.cookie) })`,
        mapPng: new Blob([PNG]),
      }),
    );
    expect(error).toBeInstanceOf(AssistantCharacterFormatError);
    expect(error.message).toBe(
      'agent.js cannot be read at line 1: "steal" is code, not data, and is not run.',
    );
  });

  it.each([
    ['not a clippy.js file', 'var x = 1;', 'agent.js is not a clippy.js file'],
    [
      'no framesize',
      `clippy.ready('X', { animations: {} })`,
      'agent.js has no framesize',
    ],
    [
      'no animations',
      `clippy.ready('X', { framesize: [1, 1], animations: {} })`,
      'agent.js has no animations.',
    ],
    [
      'no duration',
      `clippy.ready('X', { framesize: [1, 1], animations: { A: { frames: [{ images: [[0, 0]] }] } } })`,
      'agent.js: frame 0 of the animation A has no duration in milliseconds.',
    ],
    [
      'a bad offset',
      `clippy.ready('X', { framesize: [1, 1], animations: { A: { frames: [{ duration: 1, images: [[0]] }] } } })`,
      'agent.js: image 0 of frame 0 of the animation A is not an [x, y] sprite offset.',
    ],
    [
      'a branch out of the animation',
      `clippy.ready('X', { framesize: [1, 1], animations: { A: { frames: [{ duration: 1, branching: { branches: [{ frameIndex: 3, weight: 1 }] } }] } } })`,
      'agent.js: branch 0 of frame 0 of the animation A is not a frame of its animation with a weight.',
    ],
    [
      'an unclosed object',
      `clippy.ready('X', { framesize: [1, 1]`,
      'agent.js cannot be read at line 1',
    ],
  ])('fails with a sentence on %s', async (_label, agentJs, message) => {
    const error = await rejection(
      readClippyCharacter({ agentJs, mapPng: new Blob([PNG]) }),
    );
    expect(error).toBeInstanceOf(AssistantCharacterFormatError);
    expect(error.message).toContain(message);
  });

  it('refuses a map that is not an image, and a sound the sounds file lacks', async () => {
    const notImage = await rejection(
      readClippyCharacter({ agentJs: AGENT_JS, mapPng: new Blob(['hello']) }),
    );
    expect(notImage.message).toBe(
      'map.png is not an image (PNG, GIF, JPEG or WebP).',
    );
    const noSound = await rejection(
      readClippyCharacter({
        agentJs: AGENT_JS,
        mapPng: new Blob([PNG]),
        soundsJs: `clippy.soundsReady('P', {})`,
      }),
    );
    expect(noSound.message).toBe(
      'Frame 1 of the animation Idle1_1 plays the sound 1, which the sounds file does not hold.',
    );
    expect(urls).toHaveLength(0);
  });
});

// ------------------------------------------------------- the compression

/** Encode bytes as literals only, with the end marker: valid Agent data. */
function compressLiterals(data: number[]): Uint8Array {
  const bits: number[] = [];
  for (const b of data) {
    bits.push(0);
    for (let k = 0; k < 8; k++) bits.push((b >> k) & 1);
  }
  bits.push(1, 1, 1, 1);
  for (let k = 0; k < 20; k++) bits.push(1);
  const out = [0];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let k = 0; k < 8 && i + k < bits.length; k++) byte |= bits[i + k] << k;
    out.push(byte);
  }
  return new Uint8Array(out);
}

describe('decompressAgentData', () => {
  it("decodes the specification's example", () => {
    const input = new Uint8Array([
      0x00, 0x40, 0x00, 0x04, 0x10, 0xd0, 0x90, 0x80, 0x42, 0xed, 0x98, 0x01,
      0xb7, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    ]);
    const expected = new Uint8Array(32);
    expected[0] = 0x20;
    expected[4] = 0x01;
    expected[12] = 0xa8;
    expect(decompressAgentData(input, 32, 'Region')).toEqual(expected);
  });

  it('decodes literals', () => {
    expect(
      Array.from(decompressAgentData(compressLiterals([1, 2, 3]), 3, 'Data')),
    ).toEqual([1, 2, 3]);
  });

  it('refuses malformed data with a sentence', () => {
    expect(
      thrown(() => decompressAgentData(new Uint8Array([1, 2]), 2, 'Image 4'))
        .message,
    ).toBe(
      'Image 4 is compressed but cannot be decompressed: it does not start with the 0x00 byte of the format.',
    );
    expect(
      thrown(() => decompressAgentData(new Uint8Array([0, 0x02]), 4, 'Image 4'))
        .message,
    ).toBe(
      'Image 4 is compressed but cannot be decompressed: the data ends before its end marker.',
    );
    expect(
      thrown(() =>
        decompressAgentData(compressLiterals([1, 2, 3]), 4, 'Image 4'),
      ).message,
    ).toBe(
      'Image 4 is compressed but cannot be decompressed: it holds 3 bytes where 4 were announced.',
    );
    // A copy (bit 1, offset tier 0, offset 1) with nothing written yet.
    expect(
      thrown(() =>
        decompressAgentData(new Uint8Array([0, 0x01, 0, 0, 0]), 4, 'Image 4'),
      ).message,
    ).toBe(
      'Image 4 is compressed but cannot be decompressed: a copy reaches before the start of the data.',
    );
  });
});

// ---------------------------------------------------------------- .acs

/** A little-endian byte writer, with patchable locators. */
class Writer {
  bytes: number[] = [];
  get pos() {
    return this.bytes.length;
  }
  u8(v: number) {
    this.bytes.push(v & 0xff);
    return this;
  }
  u16(v: number) {
    return this.u8(v).u8(v >> 8);
  }
  u32(v: number) {
    return this.u16(v & 0xffff).u16((v >>> 16) & 0xffff);
  }
  raw(data: ArrayLike<number>) {
    for (let k = 0; k < data.length; k++) this.bytes.push(data[k]);
    return this;
  }
  str(s: string) {
    this.u32(s.length);
    if (s.length === 0) return this;
    for (const c of s) this.u16(c.charCodeAt(0));
    return this.u16(0);
  }
  /** Reserve a locator; returns a function that points it at [start, end). */
  locator() {
    const at = this.pos;
    this.u32(0).u32(0);
    return (start: number, end: number) => {
      const w = new Writer();
      w.u32(start).u32(end - start);
      this.bytes.splice(at, 8, ...w.bytes);
    };
  }
  buffer() {
    return new Uint8Array(this.bytes).buffer;
  }
}

interface AcsFixture {
  signature?: number;
  colours?: number;
  frameImage?: number;
  truncateAt?: number;
}

/**
 * A 4×2 character, palette [transparent, red, green, blue]; two images:
 * 0 a 4×2 red bitmap with a transparent pixel (uncompressed), 1 a 2×1 green
 * bar (compressed); one sound; animations Idle1_1 (images 1 over 0, then an
 * empty frame) and Greet.
 */
function buildAcs(options: AcsFixture = {}): ArrayBuffer {
  const w = new Writer();
  w.u32(options.signature ?? 0xabcdabc3);
  const character = w.locator();
  const animations = w.locator();
  const images = w.locator();
  const sounds = w.locator();

  // ACSCHARACTERINFO
  const characterStart = w.pos;
  w.u16(0).u16(2);
  const names = w.locator();
  w.raw(new Array(16).fill(7));
  w.u16(4).u16(2).u8(0); // width, height, transparent index
  w.u32(0x20 | 0x200); // voice and balloon
  w.u16(2).u16(0);
  // VOICEINFO with its extra data
  w.raw(new Array(32).fill(1))
    .u32(150)
    .u16(100)
    .u8(1)
    .u16(0x409)
    .str('')
    .u16(1)
    .u16(2)
    .str('');
  // BALLOONINFO
  w.u8(2)
    .u8(32)
    .raw([0, 0, 0, 0, 255, 255, 255, 0, 0, 0, 0, 0])
    .str('Arial')
    .u32(13)
    .u32(400)
    .u8(0)
    .u8(0);
  // Colour table: RGBQUAD is blue, green, red, reserved.
  const colours = options.colours ?? 4;
  w.u32(colours);
  const table = [
    [255, 0, 255, 0],
    [0, 0, 255, 0],
    [0, 255, 0, 0],
    [255, 0, 0, 0],
  ];
  for (let k = 0; k < Math.min(colours, 4); k++) w.raw(table[k]);
  w.u8(0); // no tray icon
  w.u16(2)
    .str('Showing')
    .u16(1)
    .str('Greet')
    .str('IdlingLevel1')
    .u16(1)
    .str('Idle1_1');
  character(characterStart, w.pos);

  const namesStart = w.pos;
  w.u16(2)
    .u16(0x40c)
    .str('Trombone')
    .str('')
    .str('')
    .u16(0x409)
    .str('Paperclip')
    .str('A test')
    .str('');
  names(namesStart, w.pos);

  // Images
  const image0 = w.pos;
  // 4×2, stride 4, bottom-up: the bottom row first.
  w.u8(0)
    .u16(4)
    .u16(2)
    .u8(0)
    .u32(8)
    .raw([1, 1, 1, 1])
    .raw([0, 1, 1, 1])
    .u32(0)
    .u32(0);
  const image0End = w.pos;
  const image1 = w.pos;
  const packed = compressLiterals([2, 2, 0, 0]); // 2×1, stride 4
  w.u8(0).u16(2).u16(1).u8(1).u32(packed.length).raw(packed).u32(0).u32(0);
  const image1End = w.pos;
  const imageList = w.pos;
  w.u32(2);
  w.locator()(image0, image0End);
  w.u32(0);
  w.locator()(image1, image1End);
  w.u32(0);
  images(imageList, w.pos);

  // Sounds
  const wav = w.pos;
  w.raw([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
  const wavEnd = w.pos;
  const soundList = w.pos;
  w.u32(1);
  w.locator()(wav, wavEnd);
  w.u32(0);
  sounds(soundList, w.pos);

  // Animations
  const idle = w.pos;
  w.str('IDLE1_1').u8(0).str('');
  w.u16(2);
  // frame 0: image 1 on top of image 0, sound 0, 0.1 s, exit to 1, a branch, a mouth overlay
  w.u16(2)
    .u32(options.frameImage ?? 1)
    .u16(1)
    .u16(1)
    .u32(0)
    .u16(0)
    .u16(0);
  w.u16(0).u16(10).u16(1);
  w.u8(1).u16(1).u16(60);
  w.u8(1)
    .u8(0)
    .u8(1)
    .u16(1)
    .u8(0)
    .u8(1)
    .u16(0)
    .u16(0)
    .u16(1)
    .u16(1)
    .u32(3)
    .raw([9, 9, 9]);
  // frame 1: empty, no sound, 0.25 s, no exit (-2)
  w.u16(0).u16(0xffff).u16(25).u16(0xfffe).u8(0).u8(0);
  const idleEnd = w.pos;
  const greet = w.pos;
  w.str('GREET').u8(2).str('');
  w.u16(1)
    .u16(1)
    .u32(0)
    .u16(0)
    .u16(0)
    .u16(0xffff)
    .u16(5)
    .u16(0xffff)
    .u8(0)
    .u8(0);
  const greetEnd = w.pos;
  const animationList = w.pos;
  w.u32(2);
  w.str('Idle1_1');
  w.locator()(idle, idleEnd);
  w.str('Greet');
  w.locator()(greet, greetEnd);
  animations(animationList, w.pos);

  if (options.truncateAt !== undefined) {
    w.bytes = w.bytes.slice(0, options.truncateAt);
  }
  return w.buffer();
}

describe('parseAcs', () => {
  it('reads the header, the character, the states and the frame tables', () => {
    const file = parseAcs(buildAcs());
    expect(file.version).toEqual({ major: 2, minor: 0 });
    expect(file.name).toBe('Paperclip');
    expect([file.width, file.height, file.transparentIndex]).toEqual([4, 2, 0]);
    expect(file.states).toEqual({
      Showing: ['Greet'],
      IdlingLevel1: ['Idle1_1'],
    });
    expect(file.images).toHaveLength(2);
    expect(file.sounds).toHaveLength(1);
    expect(file.animations.map(a => a.name)).toEqual(['Idle1_1', 'Greet']);
    expect(file.animations[0].frames).toEqual([
      {
        images: [
          { image: 1, x: 1, y: 1 },
          { image: 0, x: 0, y: 0 },
        ],
        sound: 0,
        duration: 10,
        exitBranch: 1,
        branches: [{ frameIndex: 1, probability: 60 }],
        overlays: [{ type: 0, replaceTop: true, image: 1, x: 0, y: 0 }],
      },
      {
        images: [],
        sound: -1,
        duration: 25,
        exitBranch: -2,
        branches: [],
        overlays: [],
      },
    ]);
    expect(file.animations[1].transition).toBe(2);
  });

  it('decodes images, uncompressed and compressed, top row first', () => {
    const file = parseAcs(buildAcs());
    expect(decodeAcsImage(file, 0)).toEqual({
      width: 4,
      height: 2,
      pixels: new Uint8Array([0, 1, 1, 1, 1, 1, 1, 1]),
    });
    expect(decodeAcsImage(file, 1)).toEqual({
      width: 2,
      height: 1,
      pixels: new Uint8Array([2, 2]),
    });
  });

  it('composites a frame as Agent does: the first image on top, the transparent colour clear', () => {
    const file = parseAcs(buildAcs());
    const rgba = composeAcsCell(file, file.animations[0].frames[0].images);
    const pixel = (x: number, y: number) =>
      Array.from(rgba.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 4));
    expect(pixel(0, 0)).toEqual([0, 0, 0, 0]); // transparent in image 0
    expect(pixel(1, 0)).toEqual([255, 0, 0, 255]); // red
    expect(pixel(1, 1)).toEqual([0, 255, 0, 255]); // green bar of image 1, on top
    expect(pixel(2, 1)).toEqual([0, 255, 0, 255]);
    expect(pixel(3, 1)).toEqual([255, 0, 0, 255]);
  });

  it.each<[string, AcsFixture | ArrayBuffer, string]>([
    [
      'a short file',
      new Uint8Array(10).buffer,
      'This is not a Microsoft Agent character: the file is 10 bytes, shorter than the header of an .acs.',
    ],
    [
      'another format',
      { signature: 0x04034b50 },
      'This is not a Microsoft Agent character (.acs): it starts with 0x04034b50, not 0xabcdabc3.',
    ],
    [
      'an .acf',
      { signature: 0xabcdabc4 },
      'This is a Microsoft Agent .acf, whose animations are in separate .aca files: pick the .acf together with its .aca files.',
    ],
    [
      'an empty colour table',
      { colours: 0 },
      'its colour table says 0 colours, where 1 to 256 are expected.',
    ],
    [
      'an image out of range',
      { frameImage: 9 },
      'This .acs is damaged: frame 0 of Idle1_1 draws image 9, and there are 2.',
    ],
    ['a truncated file', { truncateAt: 300 }, 'is said to be at byte'],
  ])('fails with a sentence on %s', (_label, fixture, message) => {
    const buffer = fixture instanceof ArrayBuffer ? fixture : buildAcs(fixture);
    const error = thrown(() => parseAcs(buffer));
    expect(error).toBeInstanceOf(AssistantCharacterFormatError);
    expect(error.message).toContain(message);
  });
});

describe('readAcsCharacter', () => {
  it('draws the sprite sheet in the page and maps the animations', async () => {
    const puts: Array<{ data: number[]; x: number; y: number }> = [];
    const sheets: string[] = [];
    class FakeOffscreenCanvas {
      constructor(
        public width: number,
        public height: number,
      ) {
        sheets.push(`${width}x${height}`);
      }
      getContext() {
        return {
          createImageData: (width: number, height: number) => ({
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4),
          }),
          putImageData: (
            image: { data: Uint8ClampedArray },
            x: number,
            y: number,
          ) => puts.push({ data: Array.from(image.data), x, y }),
        };
      }
      convertToBlob() {
        return Promise.resolve(new Blob(['sheet'], { type: 'image/png' }));
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    const character: AssistantCharacterData =
      await readAcsCharacter(buildAcs());
    expect(character.name).toBe('Paperclip');
    expect(character.frameSize).toEqual({ width: 4, height: 2 });
    expect(character.sprite).toBe('blob:test/1');
    // Two distinct frames and a mouth, laid out near square.
    expect(sheets).toEqual(['8x4']);
    expect(urls[0].type).toBe('image/png');
    expect(puts[1].data.slice(4, 8)).toEqual([255, 0, 0, 255]);
    expect(puts.map(p => [p.x, p.y])).toEqual([
      [0, 0],
      [4, 0],
      [0, 2],
    ]);
    // The mouth takes the place of the top image (the green bar): image 1
    // at (0, 0) over image 0, its first row green from x 0.
    expect(puts[2].data.slice(0, 4)).toEqual([0, 255, 0, 255]);
    expect(character.animations.Idle1_1.frames).toEqual([
      {
        duration: 100,
        images: [{ x: 0, y: 0 }],
        sound: '0',
        branching: [{ frameIndex: 1, weight: 60 }],
        exitBranch: 1,
        mouths: { closed: { x: 0, y: 2 } },
      },
      { duration: 250, images: [] },
    ]);
    expect(character.animations.Greet.frames).toEqual([
      { duration: 50, images: [{ x: 4, y: 0 }] },
    ]);
    expect(character.sounds).toEqual({ '0': 'blob:test/2' });
    expect(urls[1].type).toBe('audio/wav');
    expect(character.authoredStates).toEqual({
      Showing: ['Greet'],
      IdlingLevel1: ['Idle1_1'],
    });
  });
});

// ------------------------------------------------------------ the states

function character(
  names: string[],
  authoredStates?: Record<string, string[]>,
): AssistantCharacterData {
  return {
    name: 'C',
    frameSize: { width: 1, height: 1 },
    sprite: 'blob:x',
    animations: Object.fromEntries(
      names.map(n => [n, { frames: [{ duration: 1, images: [] }] }]),
    ),
    authoredStates,
  };
}

describe('stateAnimations', () => {
  it('maps the names of clippy.js characters, without case', () => {
    const states = stateAnimations(
      character([
        'Idle1_1',
        'IdleAtom',
        'IDLEEYEBROWRAISE',
        'IdleSnooze',
        'thinking',
        'Processing',
        'Writing',
        'GetAttention',
        'Greeting',
        'Wave',
        'GoodBye',
        'Explain',
        'Print',
      ]),
    );
    expect(states).toEqual({
      idle: ['Idle1_1', 'IdleAtom', 'IDLEEYEBROWRAISE', 'IdleSnooze'],
      thinking: ['thinking'],
      working: ['Processing', 'Writing'],
      waiting: ['GetAttention'],
      // Paused, it dozes with its own snooze when it has one.
      paused: ['IdleSnooze'],
      greeting: ['Greeting', 'Wave'],
      speaking: ['Explain'],
      goodbye: ['GoodBye', 'Wave'],
    });
  });

  it('maps the names of Agent characters, and the states they declare', () => {
    const states = stateAnimations(
      character(
        [
          'RestPose',
          'Think',
          'Processing',
          'Greet',
          'Hide',
          'Speak',
          'Blink',
          'Show',
          'Listen',
        ],
        {
          IdlingLevel1: ['Blink'],
          Listening: ['Listen'],
          Hiding: ['Hide'],
        },
      ),
    );
    expect(states.idle).toEqual(['RestPose', 'Blink']);
    expect(states.thinking).toEqual(['Think']);
    expect(states.working).toEqual(['Processing']);
    expect(states.waiting).toEqual(['Listen']);
    expect(states.greeting).toEqual(['Greet', 'Show']);
    expect(states.speaking).toEqual(['Speak']);
    expect(states.goodbye).toEqual(['Hide']);
    // No snooze of its own: paused, it stands in its rest pose.
    expect(states.paused).toEqual(['RestPose']);
  });

  it('falls back to the idle animations, then to the first animation, never empty', () => {
    expect(stateAnimations(character(['Idle2_1', 'Dance'])).thinking).toEqual([
      'Idle2_1',
    ]);
    const plain = stateAnimations(character(['Dance', 'Spin']));
    for (const list of Object.values(plain)) {
      expect(list).toEqual(['Dance']);
    }
  });
});

// ---------------------------------------------------------------- .acf

/** An .acf STRING: its count, its characters, no terminator. */
function acfString(w: Writer, s: string): Writer {
  w.u32(s.length);
  for (const c of s) w.u16(c.charCodeAt(0));
  return w;
}

const WAV = [0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x41, 0x56, 0x45];

/**
 * A 4×2 character for the web, palette [transparent, red, green, blue]: an
 * .acf naming Greet (greet.aca: a red frame with a sound and a wide-open
 * mouth over a blue base) and Idle1_1 (IDLE1_1.ACA, compressed: a green
 * frame branching to an empty one).
 */
function buildAcf(options: { compressed?: boolean } = {}): ArrayBuffer {
  const c = new Writer();
  c.u16(0).u16(2);
  c.u16(2);
  acfString(acfString(acfString(c, 'Greet'), 'greet.aca'), '').u32(0x1111);
  acfString(acfString(acfString(c, 'Idle1_1'), 'IDLE1_1.ACA'), 'IDLE1_1').u32(
    0x2222,
  );
  c.u32(0);
  c.raw(new Array(16).fill(7));
  c.u16(1).u16(0x409);
  acfString(acfString(acfString(c, 'Webby'), 'A test'), '');
  c.u16(4).u16(2).u8(0);
  c.u32(4).raw([255, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 0]);
  c.u16(1);
  acfString(c, 'Showing').u16(1);
  acfString(c, 'Greet');
  const w = new Writer();
  w.u32(0xabcdabc4).u32(c.bytes.length);
  if (options.compressed) {
    const packed = compressLiterals(c.bytes);
    w.u32(packed.length).raw(packed);
  } else {
    w.u32(0).raw(c.bytes);
  }
  return w.buffer();
}

function buildGreetAca(
  options: { checksum?: number; imageBytes?: number } = {},
) {
  const w = new Writer();
  w.u16(0)
    .u16(2)
    .u32(options.checksum ?? 0x1111)
    .u8(0);
  w.u16(1).u32(WAV.length).raw(WAV);
  // One frame image, 4×2 bottom-up: the bottom row red, the top row red
  // but for a transparent first pixel.
  const size = options.imageBytes ?? 8;
  w.u16(1).u32(size).u8(0);
  w.raw([1, 1, 1, 1, 0, 1, 1, 1].slice(0, size)).raw(
    new Array(Math.max(0, size - 8)).fill(1),
  );
  w.u32(0);
  w.u8(2);
  w.u16(1);
  // The frame: image 0, sound 0, 0.1 s, no exit, no branch, one mouth.
  w.u16(0).u16(0).u16(10).u32(0).u16(0xffff).u8(0);
  w.u8(1);
  // Wide open 1, in place of the top image: over a blue base.
  w.u8(1).u32(8).raw(new Array(8).fill(3)).u32(0);
  w.u8(1).u32(8).u8(0).u8(0).u16(1).u16(0).u16(1).u16(1);
  w.raw([2, 2, 0, 0, 2, 2, 0, 0]);
  return w.buffer();
}

function buildIdleAca(): ArrayBuffer {
  const d = new Writer();
  d.u16(0);
  d.u16(1).u32(8).u8(0).raw(new Array(8).fill(2)).u32(0);
  d.u8(0);
  d.u16(2);
  d.u16(0).u16(0xffff).u16(5).u32(0).u16(1).u8(1).u16(1).u16(50).u8(0);
  d.u16(0xffff).u16(0xffff).u16(5).u32(0).u16(0xfffe).u8(0).u8(0);
  const packed = compressLiterals(d.bytes);
  const w = new Writer();
  w.u16(0).u16(2).u32(0x2222).u8(1);
  w.u32(d.bytes.length).u32(packed.length).raw(packed);
  return w.buffer();
}

describe('parseAcf and parseAca', () => {
  it.each([false, true])(
    'reads the character and the animations it names (compressed: %s)',
    compressed => {
      const file = parseAcf(buildAcf({ compressed }));
      expect(file.name).toBe('Webby');
      expect(file.version).toEqual({ major: 2, minor: 0 });
      expect([file.width, file.height, file.transparentIndex]).toEqual([
        4, 2, 0,
      ]);
      expect(file.states).toEqual({ Showing: ['Greet'] });
      expect(file.animations).toEqual([
        {
          name: 'Greet',
          file: 'greet.aca',
          returnAnimation: '',
          checksum: 0x1111,
        },
        {
          name: 'Idle1_1',
          file: 'IDLE1_1.ACA',
          returnAnimation: 'IDLE1_1',
          checksum: 0x2222,
        },
      ]);
    },
  );

  it('reads an .aca: its sound, its frame image, its mouth over its base', () => {
    const aca = parseAca(buildGreetAca(), 4, 2, 'greet.aca');
    expect(aca.checksum).toBe(0x1111);
    expect(aca.transition).toBe(2);
    expect(aca.sounds).toHaveLength(1);
    expect(aca.images.map(i => [i.width, i.height])).toEqual([
      [4, 2],
      [4, 2],
      [2, 2],
    ]);
    expect(aca.images[0].pixels).toEqual(
      new Uint8Array([0, 1, 1, 1, 1, 1, 1, 1]),
    );
    expect(aca.frames).toEqual([
      {
        images: [{ image: 0, x: 0, y: 0 }],
        sound: 0,
        duration: 10,
        exitBranch: -1,
        branches: [],
        overlays: [
          {
            type: 1,
            replaceTop: true,
            image: 2,
            x: 1,
            y: 0,
            base: [{ image: 1, x: 0, y: 0 }],
          },
        ],
      },
    ]);
    const idle = parseAca(buildIdleAca(), 4, 2, 'IDLE1_1.ACA');
    expect(idle.frames.map(f => [f.images, f.sound, f.branches])).toEqual([
      [[{ image: 0, x: 0, y: 0 }], -1, [{ frameIndex: 1, probability: 50 }]],
      [[], -1, []],
    ]);
  });

  it('refuses, in a sentence, another file and an image of another size', () => {
    expect(thrown(() => parseAcf(buildAcs())).message).toBe(
      'This is not a Microsoft Agent .acf: it starts with 0xabcdabc3, not 0xabcdabc4.',
    );
    expect(
      thrown(() =>
        parseAca(buildGreetAca({ imageBytes: 12 }), 4, 2, 'greet.aca'),
      ).message,
    ).toBe(
      'greet.aca is not of this character: image 0 holds 12 bytes, where a 4×2 frame takes 8.',
    );
  });
});

describe('readAcfCharacter', () => {
  function fakeCanvas() {
    const puts: Array<{ data: number[]; x: number; y: number }> = [];
    const sheets: string[] = [];
    class FakeOffscreenCanvas {
      constructor(
        public width: number,
        public height: number,
      ) {
        sheets.push(`${width}x${height}`);
      }
      getContext() {
        return {
          createImageData: (width: number, height: number) => ({
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4),
          }),
          putImageData: (
            image: { data: Uint8ClampedArray },
            x: number,
            y: number,
          ) => puts.push({ data: Array.from(image.data), x, y }),
        };
      }
      convertToBlob() {
        return Promise.resolve(new Blob(['sheet'], { type: 'image/png' }));
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    return { puts, sheets };
  }

  it('draws the character from its .acf and .aca files, mouths and sounds included', async () => {
    const { puts, sheets } = fakeCanvas();
    const character = await readAcfCharacter(buildAcf(), {
      'GREET.ACA': buildGreetAca(),
      'idle1_1.aca': buildIdleAca(),
    });
    expect(character.name).toBe('Webby');
    expect(sheets).toEqual(['8x4']);
    expect(character.animations.Greet.frames).toEqual([
      {
        duration: 100,
        images: [{ x: 0, y: 0 }],
        sound: '0',
        mouths: { wide1: { x: 0, y: 2 } },
      },
    ]);
    expect(character.animations.Idle1_1.frames).toEqual([
      {
        duration: 50,
        images: [{ x: 4, y: 0 }],
        branching: [{ frameIndex: 1, weight: 50 }],
        exitBranch: 1,
      },
      { duration: 50, images: [] },
    ]);
    // The mouth's cell: the blue base, the green mouth from x 1.
    const mouth = puts.find(p => p.x === 0 && p.y === 2);
    expect(mouth?.data.slice(0, 4)).toEqual([0, 0, 255, 255]);
    expect(mouth?.data.slice(4, 8)).toEqual([0, 255, 0, 255]);
    expect(character.sounds).toEqual({ '0': 'blob:test/2' });
    expect(urls[1].type).toBe('audio/wav');
    expect(character.authoredStates).toEqual({ Showing: ['Greet'] });
  });

  it('refuses an .acf without every .aca it names, or with another one', async () => {
    fakeCanvas();
    expect(
      (
        await rejection(
          readAcfCharacter(buildAcf(), { 'greet.aca': buildGreetAca() }),
        )
      ).message,
    ).toBe(
      'This .acf names 1 animation file that was not picked (IDLE1_1.ACA): pick the .acf with every .aca beside it.',
    );
    expect(
      (
        await rejection(
          readAcfCharacter(buildAcf(), {
            'greet.aca': buildGreetAca({ checksum: 0x9999 }),
            'IDLE1_1.ACA': buildIdleAca(),
          }),
        )
      ).message,
    ).toBe(
      'greet.aca is not the one this .acf names for Greet: their checksums differ.',
    );
  });

  it('is read from the files a person picked: the .acf and its .aca files', async () => {
    fakeCanvas();
    const named = (name: string, buffer: ArrayBuffer) =>
      Object.assign(new Blob([buffer]), {
        name,
        arrayBuffer: async () => buffer,
      });
    const acf = named('Webby.acf', buildAcf());
    const greet = named('greet.aca', buildGreetAca());
    const idle = named('IDLE1_1.ACA', buildIdleAca());
    expect(
      characterFilesOf([
        named('x.png', PNG.buffer as ArrayBuffer),
        greet,
        acf,
        idle,
      ]),
    ).toEqual({
      kind: 'acf',
      acf,
      acas: [greet, idle],
    });
    const character = await readCharacterFiles([acf, greet, idle]);
    expect(Object.keys(character.animations)).toEqual(['Greet', 'Idle1_1']);
  });
});
