/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The exported protocol and harness plugin manifests
 * (`pluginManifests.generated.*`) are the generated specs: every spec has
 * one manifest, its spec equal to the generated one once converted, and the
 * export is sorted and the same in both files. Python's
 * `test_plugin_manifests.py` holds the export to what the specs give.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listHarnesses } from '../harnesses';
import { listProtocolSpecs } from '../protocols';
import {
  harnessEngineManifestOf,
  harnessEngineManifests,
  protocolManifestOf,
  protocolManifests,
  specOfPython,
} from '../pluginManifests';
import { PLUGIN_MANIFESTS } from '../pluginManifests.generated';

const JSON_EXPORT = JSON.parse(
  readFileSync(resolve(__dirname, '../pluginManifests.generated.json'), 'utf8'),
);

const sorted = (ids: string[]): string[] => [...ids].sort();

describe('the exported plugin manifests', () => {
  it('are the same in the JSON and the TypeScript module', () => {
    expect(PLUGIN_MANIFESTS).toEqual(JSON_EXPORT);
  });

  it('give every protocol of the catalogue one manifest, its spec the generated one', () => {
    const ids = protocolManifests().map(manifest => manifest.protocol.id);
    expect(ids).toEqual(sorted(listProtocolSpecs().map(spec => spec.id)));
    for (const spec of listProtocolSpecs()) {
      const manifest = protocolManifestOf(spec.id);
      expect(manifest?.protocol).toEqual(spec);
      expect(manifest?.displayName).toBe(spec.name);
      expect(manifest?.package).toBe('agent-runtimes');
      expect(manifest?.tags).toEqual(['agent-protocols', spec.layer]);
      expect(manifest?.points.map(point => point.id)).toEqual(
        manifest?.contributionPoints,
      );
    }
  });

  it('give every harness of the catalogue one manifest, its spec the generated one', () => {
    const ids = harnessEngineManifests().map(manifest => manifest.harness.id);
    expect(ids).toEqual(sorted(listHarnesses().map(spec => spec.id)));
    for (const spec of listHarnesses()) {
      const manifest = harnessEngineManifestOf(spec.id);
      expect(manifest?.harness).toEqual(spec);
      expect(manifest?.name).toBe(`agent-runtimes.harnesses.${spec.id}`);
      expect(manifest?.displayName).toBe(spec.name);
      expect(manifest?.dependencies).toEqual(['agent-runtimes.sessions']);
    }
  });

  it('are sorted, their keys too, so the export is stable', () => {
    const keysSorted = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.every(keysSorted);
      if (value !== null && typeof value === 'object') {
        const keys = Object.keys(value);
        return (
          keys.join('\n') === sorted(keys).join('\n') &&
          Object.values(value).every(keysSorted)
        );
      }
      return true;
    };
    expect(keysSorted(JSON_EXPORT)).toBe(true);
    const text = readFileSync(
      resolve(__dirname, '../pluginManifests.generated.json'),
      'utf8',
    );
    expect(text).toBe(`${JSON.stringify(JSON_EXPORT, null, 2)}\n`);
  });

  it('converts a Python dump to the specs’ shape, names kept', () => {
    expect(
      specOfPython({
        fork_history: 'replay',
        unavailable_because: '',
        tier_restrictions: null,
        env: { NO_BROWSER: '1' },
        auto_run: ['^a'],
      }),
    ).toEqual({
      forkHistory: 'replay',
      unavailable_because: '',
      env: { NO_BROWSER: '1' },
      autoRun: ['^a'],
    });
    expect(protocolManifestOf('nope')).toBeUndefined();
    expect(harnessEngineManifestOf('nope')).toBeUndefined();
  });
});
