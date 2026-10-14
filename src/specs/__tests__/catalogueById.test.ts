/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Code reads a catalogue entry by its id, never by a version-named constant
 * (decided 14 October 2026).
 *
 * `make specs` still generates `SALES_APP_0_0_3` and the like, for anyone
 * outside, but code here reads `APP_CATALOGUE['sales']`, `TEAM_SPECS[...]`,
 * `SCENE_CATALOGUE[...]` or `AGENTSPECS[...]`, so a version bump touches no
 * caller. Generated files (`src/specs/**` but its tests) and the generated
 * typedoc pages are not read.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../..');

/** The hand-written TypeScript roots of the repository. */
const SOURCE_ROOTS = ['src', 'examples/nextjs', 'docs/src', 'e2e', 'pictures'];

/** A version-named constant: `SALES_APP_0_0_3`, `JUPYTER_TEAM_SPEC_0_0_1`. */
const VERSION_NAMED = /\b[A-Z][A-Z0-9_]*_\d+_\d+_\d+\b/g;

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'lib', 'dist', 'build']);

/** Generated, or this file, which names the constants it refuses. */
function isSkipped(path: string): boolean {
  return (
    (path.startsWith('src/specs/') && !path.includes('/__tests__/')) ||
    path === relative(ROOT, __filename)
  );
}

function sourcesUnder(directory: string, found: string[] = []): string[] {
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch {
    return found;
  }
  for (const name of names) {
    if (SKIPPED_DIRECTORIES.has(name) || name.startsWith('.')) continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      sourcesUnder(path, found);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name) && !name.endsWith('.d.ts')) {
      found.push(path);
    }
  }
  return found;
}

/** The text without its string literals: a name said in a string is not a use. */
function withoutStrings(text: string): string {
  return text.replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, "''");
}

describe('catalogue entries are read by id', () => {
  it('no hand-written source names a version-named constant', () => {
    const files = SOURCE_ROOTS.flatMap(root => sourcesUnder(join(ROOT, root)));
    expect(files.length).toBeGreaterThan(100);
    const offenders: string[] = [];
    for (const file of files) {
      const path = relative(ROOT, file);
      if (isSkipped(path)) continue;
      withoutStrings(readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, index) => {
          for (const [name] of line.matchAll(VERSION_NAMED)) {
            offenders.push(`${path}:${index + 1} ${name}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  it('catches a version-named constant and lets a model id through', () => {
    const named = (text: string) =>
      [...withoutStrings(text).matchAll(VERSION_NAMED)].map(([name]) => name);
    expect(named("import { SALES_APP_0_0_3 } from '../specs/apps';")).toEqual([
      'SALES_APP_0_0_3',
    ]);
    expect(named('const team = SALES_AND_ACCOUNTING_TEAM_SPEC_0_0_1;')).toEqual(
      ['SALES_AND_ACCOUNTING_TEAM_SPEC_0_0_1'],
    );
    expect(named("const app = APP_CATALOGUE['sales'];")).toEqual([]);
    expect(named("expect(code).toContain('SALES_APP_0_0_3');")).toEqual([]);
    expect(
      named('AIModels.BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_5_20250929_V1_0'),
    ).toEqual([]);
  });
});
