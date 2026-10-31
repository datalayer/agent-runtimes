/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The transcript as a JSON file (SCENES S3-03): the lines as they are,
 * under a version, so that `agent_runtimes` reads them back in Python
 * (`loop/scenes/transcript.py`, `lines_of_json`) and a problem seen on a
 * stage is replayed in a test.
 *
 * @module components/teams/transcript/transcriptExport
 */

import type { SceneTranscriptLine } from '../sceneTranscriptRules';

/** The file's version: refused when another is read. */
export const TRANSCRIPT_JSON_VERSION = 1;

/** What the file holds. */
export type TranscriptJson = {
  version: typeof TRANSCRIPT_JSON_VERSION;
  /** When it was exported, ISO. */
  exported: string;
  /** The scene, by id, when known. */
  scene?: string;
  lines: SceneTranscriptLine[];
};

/** The lines as JSON text, two spaces in. */
export function transcriptJson(
  lines: readonly SceneTranscriptLine[],
  options: { scene?: string; now?: () => number } = {},
): string {
  const now = options.now ?? Date.now;
  const file: TranscriptJson = {
    version: TRANSCRIPT_JSON_VERSION,
    exported: new Date(now()).toISOString(),
    ...(options.scene ? { scene: options.scene } : {}),
    lines: lines.map(line => ({ ...line })),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

const KINDS = new Set(['said', 'asked', 'called']);

/** The lines of a file written by {@link transcriptJson}; a sentence for anything else. */
export function linesOfTranscriptJson(text: string): SceneTranscriptLine[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The transcript file is not JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The transcript file is not an object.');
  }
  const file = parsed as Partial<TranscriptJson>;
  if (file.version !== TRANSCRIPT_JSON_VERSION) {
    throw new Error(
      `The transcript file is version ${String(file.version)}; this reads version ${TRANSCRIPT_JSON_VERSION}.`,
    );
  }
  if (!Array.isArray(file.lines)) {
    throw new Error('The transcript file has no lines.');
  }
  return file.lines.map((line, index) => {
    const at = line as Partial<SceneTranscriptLine>;
    if (
      typeof at.key !== 'string' ||
      typeof at.at !== 'number' ||
      typeof at.from !== 'string' ||
      typeof at.text !== 'string' ||
      !KINDS.has(String(at.kind))
    ) {
      throw new Error(
        `Line ${index + 1} of the transcript file is not a line.`,
      );
    }
    return {
      key: at.key,
      at: at.at,
      from: at.from,
      ...(typeof at.to === 'string' ? { to: at.to } : {}),
      kind: at.kind as SceneTranscriptLine['kind'],
      text: at.text,
      ...(at.open ? { open: true } : {}),
      ...(at.failed ? { failed: true } : {}),
      ...(typeof at.ended === 'number' ? { ended: at.ended } : {}),
    };
  });
}

/** The file's name: `<scene>-transcript.json`, or `transcript.json`. */
export function transcriptFileName(scene?: string): string {
  const slug = (scene ?? '')
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/^-|-$/g, '');
  return slug ? `${slug}-transcript.json` : 'transcript.json';
}

/** Hands the browser a file to save: a link to a blob, clicked. */
export function downloadText(
  name: string,
  text: string,
  type = 'application/json',
): void {
  const document = globalThis.document;
  if (!document || typeof URL.createObjectURL !== 'function') {
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
