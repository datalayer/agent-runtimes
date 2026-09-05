/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An example nobody can reach is not an example.
 *
 * The header menu, the home cards and the `EXAMPLES` loader map all read one
 * registry, so an entry missing from it is invisible everywhere at once — and
 * nothing else fails when it is. That is what these check.
 */

import { describe, expect, it } from 'vitest';

import { EXAMPLES, getExampleEntries } from '../example-selector';

describe('the example registry', () => {
  it('lists every example exactly once', () => {
    const ids = getExampleEntries().map(entry => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives the loader map an entry per example', () => {
    for (const entry of getExampleEntries()) {
      expect(EXAMPLES[entry.id], entry.id).toBeTypeOf('function');
    }
  });

  it('describes every example, since the home cards show it', () => {
    for (const entry of getExampleEntries()) {
      expect(entry.description, entry.id).toBeTruthy();
    }
  });
});

describe('the A2UI Jupyter output example', () => {
  const entry = () =>
    getExampleEntries().find(e => e.id === 'A2UiJupyterOutputExample');

  it('is registered', () => {
    expect(entry()).toBeDefined();
  });

  it('is titled for a reader rather than for the file system', () => {
    expect(entry()?.title).toBe('A2UI Jupyter Output');
  });

  it('is loadable', () => {
    expect(EXAMPLES.A2UiJupyterOutputExample).toBeTypeOf('function');
  });

  it('lands in the A2UI group, by the id the grouping reads', () => {
    // `getExampleGroup` in the shell keys off this prefix.
    expect(entry()?.id.startsWith('A2Ui')).toBe(true);
  });
});
