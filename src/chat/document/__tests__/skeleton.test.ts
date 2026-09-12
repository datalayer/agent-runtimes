/*
 * Copyright (c) 2023-2026 Datalayer, Inc.
 *
 * BSD 3-Clause License
 */

/**
 * What the ephemeral document shows before it is there.
 *
 * It arrives two ways, and both used to be a gap: a room that had not sent
 * its first snapshot was an empty editor with a placeholder, and a runtime
 * still starting was a spinner beside a sentence. Both are the document
 * skeleton now — the package's own, so this document and one in the
 * library look like the same application waiting.
 *
 * The document needs a room and a runtime, so this reads its source.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(__dirname, '..', 'EphemeralDocument.tsx'),
  'utf8',
);

describe('the ephemeral document before it is there', () => {
  it('draws the document skeleton until its room has sent the snapshot', () => {
    // The room tells the document, and the document remembers which room.
    expect(source).toContain('onInitialization={onRoomInitialization}');
    expect(source).toContain('initializedRoom === roomId');
    const gate = source.indexOf('{documentReady ? (');
    expect(gate).toBeGreaterThan(-1);
    const otherwise = source.indexOf(') : (', gate);
    const editor = source.indexOf('<ContentEditable', gate);
    expect(editor).toBeGreaterThan(gate);
    expect(editor).toBeLessThan(otherwise);
    expect(source.indexOf('<DocumentSkeleton', otherwise)).toBeGreaterThan(
      otherwise,
    );
  });

  it('draws it while the runtime starts too, on the document’s own ground', () => {
    const starting = source.indexOf('isRuntimeStarting ? (');
    expect(starting).toBeGreaterThan(-1);
    const next = source.indexOf(') : null}', starting);
    const branch = source.slice(starting, next);
    expect(branch).toContain('<DocumentSkeleton');
    expect(branch).toContain('backgroundColor: themeBackground');
    expect(branch).toContain('<ThemeRoot');
  });

  it('takes the skeleton from the package and never spins', () => {
    expect(source).toMatch(
      /import \{[^}]*\bDocumentSkeleton\b[^}]*\} from '@datalayer\/jupyter-lexical'/,
    );
    expect(source).not.toMatch(/\bSpinner\b/);
  });
});
