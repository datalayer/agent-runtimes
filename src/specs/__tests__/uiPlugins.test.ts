/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * UI plugins: a catalogue of their own, and what an agent spec names.
 *
 * They were UI extensions, and the agent field `uiExtension`, before
 * agentspecs 0.0.11.
 */

import { describe, expect, it } from 'vitest';
import { listAgentspecs } from '../agents';
import { UI_PLUGIN_CATALOGUE, getUIPlugin, listUIPlugins } from '../uiPlugins';

describe('the UI plugin catalogue', () => {
  it('lists every plugin, saying whether it is enabled', () => {
    expect(Object.keys(UI_PLUGIN_CATALOGUE)).toEqual(
      expect.arrayContaining(['a2ui', 'mcp-apps', 'mcp-ui']),
    );
    for (const plugin of listUIPlugins()) {
      expect(plugin.name).toBeTruthy();
      expect(plugin.docsUrl).toMatch(/^https:\/\//);
      expect(typeof plugin.enabled).toBe('boolean');
    }
    expect(getUIPlugin('a2ui')?.enabled).toBe(true);
    expect(getUIPlugin('nope')).toBeUndefined();
  });

  it('is what an agent spec names, under uiPlugin', () => {
    const named = listAgentspecs().filter(spec => spec.uiPlugin);
    expect(named.length).toBeGreaterThan(0);
    for (const spec of named) {
      expect(getUIPlugin(spec.uiPlugin as string)).toBeDefined();
      expect('uiExtension' in spec).toBe(false);
    }
  });
});
