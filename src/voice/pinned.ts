/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The browser's models, from Datalayer's origin and as pinned (VOICE.md
 * VO-49, VO-03): every file a model is made of is fetched from the models'
 * origin, laid out as the pinned store is (`<model id>/<path>`), and its
 * SHA-256 checked against the catalogue before anything reads it. A file
 * that is not the one pinned is refused; nothing is asked of another origin.
 *
 * @module voice/pinned
 */

import { SPEECH_MODEL_CATALOGUE, type PinnedFile } from '../specs/voices';

/** A file of a model that is not the one the catalogue pins, or not reachable. */
export class PinRefused extends Error {}

/** The pinned file at a URL under the models' origin, if it is one. */
export function pinOf(base: string, url: string): PinnedFile | undefined {
  const root = base.replace(/\/+$/, '') + '/';
  if (!url.startsWith(root)) {
    return undefined;
  }
  const [model, ...rest] = url.slice(root.length).split('?')[0].split('/');
  const path = rest.join('/');
  return SPEECH_MODEL_CATALOGUE[model]?.files.find(file => file.path === path);
}

/** The SHA-256 of some bytes, in hex. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * A `fetch` that reaches the models' origin only, and answers a model's
 * file only once its hash is the one pinned. The runtime's own files
 * (onnxruntime-web's WASM, under `onnxruntime-web/`) come from the same
 * origin, at the version the page bundles.
 */
export function pinnedFetch(
  base: string,
  fetcher: typeof fetch = (input, init) => fetch(input, init),
): (input: string | URL, init?: RequestInit) => Promise<Response> {
  const root = base.replace(/\/+$/, '') + '/';
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.startsWith(root)) {
      throw new PinRefused(
        `Voice reads its models from ${root} only, not ${url}.`,
      );
    }
    const answered = await fetcher(url, init);
    const pin = pinOf(base, url);
    if (!pin || !answered.ok) {
      return answered;
    }
    const bytes = await answered.arrayBuffer();
    if (
      bytes.byteLength !== pin.size ||
      (await sha256Hex(bytes)) !== pin.sha256
    ) {
      throw new PinRefused(
        `${url.slice(root.length)} is not the file the voice catalogue pins: refused.`,
      );
    }
    return new Response(bytes, {
      status: answered.status,
      headers: answered.headers,
    });
  };
}

/** A model's file as bytes, checked against its pin. */
export async function pinnedBytes(
  base: string,
  url: string,
  fetcher?: typeof fetch,
): Promise<ArrayBuffer> {
  const answered = await pinnedFetch(base, fetcher)(url);
  if (!answered.ok) {
    throw new PinRefused(`${url} could not be read (${answered.status}).`);
  }
  return answered.arrayBuffer();
}

/** What a first use downloads for a model, in bytes. */
export function downloadSize(modelId: string): number {
  return (SPEECH_MODEL_CATALOGUE[modelId]?.files ?? []).reduce(
    (total, file) => total + file.size,
    0,
  );
}
