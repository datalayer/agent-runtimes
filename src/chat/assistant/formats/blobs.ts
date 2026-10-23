/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Blobs to bytes and URLs, in the page: a character file is read where the
 * person picked it and is never uploaded.
 *
 * @module chat/assistant/formats/blobs
 */

import { AssistantCharacterFormatError } from './types';

/** The bytes of a blob. */
export async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** An object URL for a blob, which stays in the page. */
export function objectUrl(blob: Blob): string {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new AssistantCharacterFormatError(
      'This page cannot hold a picked file: it has no URL.createObjectURL.',
    );
  }
  return URL.createObjectURL(blob);
}

const IMAGE_SIGNATURES: Array<{ type: string; bytes: number[] }> = [
  {
    type: 'image/png',
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  { type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
];

/** The image type of the bytes, from their signature, if a known one. */
export function imageTypeOf(bytes: Uint8Array): string | undefined {
  for (const { type, bytes: signature } of IMAGE_SIGNATURES) {
    if (signature.every((b, i) => bytes[i] === b)) {
      return type;
    }
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return undefined;
}
