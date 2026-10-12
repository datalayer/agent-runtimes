/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * UI specs: a catalogue of their own, and what an agent spec names.
 */

import { describe, expect, it } from 'vitest';
import { listAgentspecs } from '../agents';
import { UI_CATALOGUE, getUI, listUI } from '../ui';

describe('the UI catalogue', () => {
  it('lists every plugin, saying whether it is enabled', () => {
    expect(Object.keys(UI_CATALOGUE)).toEqual(
      expect.arrayContaining(['a2ui', 'mcp-apps', 'mcp-ui']),
    );
    for (const plugin of listUI()) {
      expect(plugin.name).toBeTruthy();
      expect(plugin.docsUrl).toMatch(/^https:\/\//);
      expect(typeof plugin.enabled).toBe('boolean');
    }
    expect(getUI('a2ui')?.enabled).toBe(true);
    expect(getUI('nope')).toBeUndefined();
  });

  it('is what an agent spec names, under ui', () => {
    const named = listAgentspecs().filter(spec => spec.ui);
    expect(named.length).toBeGreaterThan(0);
    for (const spec of named) {
      expect(getUI(spec.ui as string)).toBeDefined();
    }
  });
});
