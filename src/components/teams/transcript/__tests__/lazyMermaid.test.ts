/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * mermaid never rides with the graph (SCENES S2-02): no module of the
 * teams component imports it statically; `SequenceDiagram` alone loads it,
 * with `import('mermaid')`, when the view opens.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HERE } from './fixture';

const TEAMS = resolve(HERE, '../..');

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' ? [] : sources(path);
    }
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('mermaid is lazy', () => {
  it('is imported statically by no module of the teams component', () => {
    const offenders = sources(TEAMS).filter(path =>
      /^\s*(import|export)\s[^;]*from\s+['"]mermaid['"]/m.test(
        readFileSync(path, 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('is loaded by SequenceDiagram alone, dynamically', () => {
    const loaders = sources(TEAMS).filter(path =>
      /import\(\s*['"]mermaid['"]\s*\)/.test(readFileSync(path, 'utf8')),
    );
    expect(loaders.map(path => path.slice(TEAMS.length + 1))).toEqual([
      'transcript/SequenceDiagram.tsx',
    ]);
  });
});
