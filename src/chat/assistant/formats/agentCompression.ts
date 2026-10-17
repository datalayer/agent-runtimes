/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The compression of Microsoft Agent character data, after Lebeau's public
 * description (MSAgent Character Data Specification 1.3, "Compression
 * Algorithm"): a leading 0x00, then a bit stream read least significant bit
 * first, where 0 is a literal byte and 1 a copy from earlier in the output,
 * ended by a 20-bit offset of 0xFFFFF.
 *
 * @module chat/assistant/formats/agentCompression
 */

import { AssistantCharacterFormatError } from './types';

const OFFSET_TIERS: ReadonlyArray<readonly [bits: number, add: number]> = [
  [6, 1],
  [9, 65],
  [12, 577],
  [20, 4673],
];

/**
 * Decompress `input` into exactly `size` bytes; `what` names the data in
 * error messages. Anything that does not decode to that size is refused.
 */
export function decompressAgentData(
  input: Uint8Array,
  size: number,
  what: string,
): Uint8Array {
  const fail = (reason: string): never => {
    throw new AssistantCharacterFormatError(
      `${what} is compressed but cannot be decompressed: ${reason}.`,
    );
  };
  if (input.length === 0 || input[0] !== 0) {
    fail('it does not start with the 0x00 byte of the format');
  }
  const out = new Uint8Array(size);
  let written = 0;
  let byte = 1;
  let bit = 0;
  const total = input.length * 8;

  const pop = (): number => {
    const at = byte * 8 + bit;
    if (at >= total) fail('the data ends before its end marker');
    const v = (input[byte] >> bit) & 1;
    if (++bit === 8) {
      bit = 0;
      byte++;
    }
    return v;
  };
  const popBits = (count: number): number => {
    let v = 0;
    for (let k = 0; k < count; k++) {
      v |= pop() << k;
    }
    return v >>> 0;
  };

  for (;;) {
    if (pop() === 0) {
      if (written >= size)
        fail(`it holds more than the ${size} bytes announced`);
      out[written++] = popBits(8);
      continue;
    }
    let ones = 0;
    while (ones < 3 && pop() === 1) ones++;
    const [bits, add] = OFFSET_TIERS[ones];
    const raw = popBits(bits);
    let count = 2;
    if (bits === 20) {
      if (raw === 0xfffff) break;
      count++;
    }
    const offset = raw + add;
    if (offset > written) fail('a copy reaches before the start of the data');
    let lengthBits = 0;
    while (pop() === 1) {
      if (++lengthBits > 11) fail('a copy length is malformed');
    }
    count += (1 << lengthBits) - 1 + popBits(lengthBits);
    if (written + count > size)
      fail(`it holds more than the ${size} bytes announced`);
    for (let k = 0; k < count; k++, written++) {
      out[written] = out[written - offset];
    }
  }
  if (written !== size) {
    fail(`it holds ${written} bytes where ${size} were announced`);
  }
  return out;
}
