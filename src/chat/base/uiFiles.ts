/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A conversation's files as references (REACTOR_UI RU-6).
 *
 * What the page holds of a file it was given — File upload and the composer
 * read it as `{name, type, data_url}` — is uploaded to the application's
 * runtime before the run that names it (Reactor's `uploadFile`), and the run
 * carries the ref it answers (`forwardedProps.loop.files`): a file's bytes
 * never ride in the run.
 *
 * @module chat/base/uiFiles
 */

import { isFileRef, type FileRef } from '@datalayer/reactor/ui';

/** How a file is uploaded to the conversation: its ref. */
export type UploadToConversation = (
  file: Blob & { name: string },
) => Promise<FileRef>;

/** A file's bytes from the data URL the page read it as. */
export function blobOfDataUrl(
  dataUrl: string,
  name: string,
  type?: string,
): Blob & { name: string } {
  const [head, body] = [
    dataUrl.slice(0, dataUrl.indexOf(',')),
    dataUrl.slice(dataUrl.indexOf(',') + 1),
  ];
  if (!head.startsWith('data:') || dataUrl.indexOf(',') < 0) {
    throw new Error(`${name} could not be read: it is not a data URL.`);
  }
  const mediaType = type || head.slice('data:'.length).split(';')[0];
  let bytes: Uint8Array;
  if (head.endsWith(';base64')) {
    const binary = atob(body);
    bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(body));
  }
  return Object.assign(new Blob([bytes], { type: mediaType }), { name });
}

/** Whether a run's `forwardedProps` names files. */
export function namesFiles(
  forwardedProps: Record<string, unknown> | undefined,
): boolean {
  const files = (forwardedProps?.loop as { files?: unknown } | undefined)
    ?.files;
  return Array.isArray(files) && files.length > 0;
}

/**
 * The run's `forwardedProps` with its files uploaded: each file the page
 * holds replaced by the ref its upload answered, a ref kept as it is.
 *
 * @throws for a file that is neither, or an upload refused (its sentence).
 */
export async function withUploadedFiles(
  forwardedProps: Record<string, unknown>,
  upload: UploadToConversation,
): Promise<Record<string, unknown>> {
  const loop = forwardedProps.loop as Record<string, unknown>;
  const files = loop.files as unknown[];
  const refs: FileRef[] = [];
  for (const given of files) {
    if (isFileRef(given)) {
      refs.push(given);
      continue;
    }
    const held = given as {
      name?: unknown;
      type?: unknown;
      data_url?: unknown;
    };
    if (typeof held.name !== 'string' || typeof held.data_url !== 'string') {
      throw new Error('A file given is neither the page’s nor a ref.');
    }
    refs.push(
      await upload(
        blobOfDataUrl(
          held.data_url,
          held.name,
          typeof held.type === 'string' ? held.type : undefined,
        ),
      ),
    );
  }
  return { ...forwardedProps, loop: { ...loop, files: refs } };
}
