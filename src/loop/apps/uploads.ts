/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a person sends (LOOP P-21), as rules: the kinds of file an
 * application takes in its composer without asking (`interface.uploads`),
 * each with its largest size, and how many at once — and why a file is
 * refused, in the sentence the runtime says when it was sent all the same.
 * agentspecs' own (`AppUploads.refusal`, `too_many`, `upload_kind_takes`),
 * said again for the page.
 *
 * Pure: no React, no network.
 *
 * @module loop/apps/uploads
 */

import type { AppSpec, AppUploadsSpec } from '../../types/agentspecs';

/** The largest file a person may send an application, in megabytes. */
export const MAX_UPLOAD_MB = 25;

/** What a kind takes when it does not say, in megabytes. */
export const DEFAULT_UPLOAD_MB = 10;

/** How many files go with one message when it does not say. */
export const DEFAULT_MAX_FILES = 5;

/** A media type, a family of them, or an extension, lowercase. */
export const UPLOAD_KIND =
  /^(?:[a-z0-9][a-z0-9.+-]*\/(?:\*|[a-z0-9][a-z0-9.+-]*)|\.[a-z0-9][a-z0-9_+-]*)$/;

/** A file as the person gives it: its name, its type, its size in bytes. */
export type SentFile = { name: string; type: string; size: number };

/**
 * Whether a kind of file takes a file: an extension (`.csv`) by its name, a
 * media type (`application/pdf`) or a family (`image/*`) by its type.
 */
export function kindTakes(
  kind: string,
  file: Pick<SentFile, 'name' | 'type'>,
): boolean {
  const wanted = kind.trim().toLowerCase();
  if (wanted.startsWith('.')) {
    return file.name.toLowerCase().endsWith(wanted);
  }
  const type = (file.type || '').split(';', 1)[0].trim().toLowerCase();
  if (wanted.endsWith('/*')) {
    return type.startsWith(wanted.slice(0, -1));
  }
  return type === wanted;
}

/** Whether any of `kinds` takes a file; any file when there are none. */
export const acceptsFile = (
  kinds: readonly string[] | undefined,
  file: Pick<SentFile, 'name' | 'type'>,
): boolean => !kinds?.length || kinds.some(kind => kindTakes(kind, file));

const megabytes = (size: number): string =>
  `${(size / (1024 * 1024)).toFixed(1)} MB`;

/** The `accept` of a file input for what the application takes. */
export const uploadsAccept = (uploads: AppUploadsSpec): string =>
  uploads.kinds.map(kind => kind.type).join(',');

/**
 * Why files sent without being asked are refused, in a sentence — the
 * runtime's — or `null` when the application takes every one of them.
 */
export function uploadsRefusal(
  app: Pick<AppSpec, 'name' | 'interface'>,
  files: readonly SentFile[],
): string | null {
  if (files.length === 0) {
    return null;
  }
  const uploads = app.interface.uploads;
  if (!uploads) {
    return `${app.name} takes no file sent with a message: its Appspec names none it takes (interface.uploads).`;
  }
  if (files.length > uploads.maxFiles) {
    return `${files.length} files were sent at once: ${app.name} takes at most ${uploads.maxFiles}.`;
  }
  for (const file of files) {
    const kind = uploads.kinds.find(candidate =>
      kindTakes(candidate.type, file),
    );
    if (!kind) {
      const taken = uploads.kinds.map(candidate => candidate.type).join(', ');
      return `${file.name} is not a kind of file ${app.name} takes: it takes ${taken}.`;
    }
    if (file.size > kind.maxMb * 1024 * 1024) {
      return `${file.name} is ${megabytes(file.size)}: ${app.name} takes ${kind.type} of at most ${kind.maxMb} MB.`;
    }
  }
  return null;
}

/** What the composer says it takes, in a sentence. */
export function uploadsInWords(uploads: AppUploadsSpec): string {
  const kinds = uploads.kinds
    .map(kind => `${kind.type} up to ${kind.maxMb} MB`)
    .join(', ');
  return `Takes ${kinds}; ${uploads.maxFiles} at most at once.`;
}
