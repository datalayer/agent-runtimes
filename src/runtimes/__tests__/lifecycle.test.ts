/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The TypeScript and Python statements of the vocabulary have to agree.
 *
 * They are two files, so nothing but a test keeps them the same. This reads the
 * Python one and compares, which is why a verb added on one side fails here
 * rather than quietly diverging until a caller builds the wrong URL.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  LIFECYCLE_OPERATIONS,
  runtimeCheckpointsUrl,
  runtimePauseUrl,
  runtimeResumeUrl,
  runtimeUrl,
  runtimesUrl,
  sandboxSnapshotUrl,
  sandboxSnapshotsUrl,
} from '../lifecycle';

const BASE = 'https://runtimes.example';

/** The verbs Python names, read out of `code_sandboxes/lifecycle.py`. */
function pythonOperations(): Record<string, string> {
  const source = readFileSync(
    join(
      __dirname,
      '../../../../code-sandboxes/code_sandboxes/lifecycle.py',
    ),
    'utf8',
  );
  const block = source.match(
    /LIFECYCLE_OPERATIONS: dict\[str, str\] = \{([\s\S]*?)\n\}/,
  );
  expect(block, 'LIFECYCLE_OPERATIONS not found in the Python module').toBeTruthy();
  const operations: Record<string, string> = {};
  for (const line of block![1].split('\n')) {
    const entry = line.match(/^\s*"([^"]+)":\s*"([^"]*)"/);
    if (entry) {
      operations[entry[1]] = entry[2];
    }
  }
  return operations;
}

describe('the vocabulary', () => {
  it('names the same verbs as the Python module', () => {
    expect(Object.keys(LIFECYCLE_OPERATIONS).sort()).toEqual(
      Object.keys(pythonOperations()).sort(),
    );
  });

  it('gives each verb the same REST spelling as the Python module', () => {
    expect({ ...LIFECYCLE_OPERATIONS }).toEqual(pythonOperations());
  });
});

describe('the runtime URLs', () => {
  it('builds each verb the path the vocabulary documents', () => {
    const built: Record<string, string> = {
      list: runtimesUrl(BASE),
      create: runtimesUrl(BASE),
      get: runtimeUrl(BASE, '{runtime_name}'),
      stop: runtimeUrl(BASE, '{runtime_name}'),
      update: runtimeUrl(BASE, '{runtime_name}'),
      pause: runtimePauseUrl(BASE, '{runtime_name}'),
      resume: runtimeResumeUrl(BASE, '{runtime_name}'),
      snapshot: sandboxSnapshotsUrl(BASE),
    };
    for (const [verb, url] of Object.entries(built)) {
      const path = LIFECYCLE_OPERATIONS[
        verb as keyof typeof LIFECYCLE_OPERATIONS
      ].split(' ').slice(1).join(' ');
      expect(url, verb).toBe(`${BASE}/api/runtimes/v1${path}`);
    }
  });

  it('does not mind a trailing slash on the base', () => {
    expect(runtimeUrl(`${BASE}/`, 'runtime-1')).toBe(
      runtimeUrl(BASE, 'runtime-1'),
    );
  });

  it('stops a paused runtime at the same URL as a running one', () => {
    // One `stop`, one path — the paused case has no endpoint of its own.
    expect(runtimeUrl(BASE, 'runtime-1')).toBe(
      `${BASE}/api/runtimes/v1/runtimes/runtime-1`,
    );
  });

  it('keeps snapshots and checkpoints as their own resources', () => {
    expect(sandboxSnapshotUrl(BASE, 'snap-1')).toBe(
      `${BASE}/api/runtimes/v1/sandbox-snapshots/snap-1`,
    );
    expect(runtimeCheckpointsUrl(BASE)).toBe(
      `${BASE}/api/runtimes/v1/runtime-checkpoints`,
    );
  });
});
