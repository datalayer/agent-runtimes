/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * UI plugins and UI renderers (R8): two catalogues, and what an
 * agent spec names — UI plugins, each with a renderer it may be exposed
 * through.
 */

import { describe, expect, it } from 'vitest';
import { listAgentspecs } from '../agents';
import { UI_CATALOGUE, getUI, listUI } from '../ui';
import { UI_RENDERER_CATALOGUE, getUiRenderer } from '../uiRenderers';

describe('the UI catalogue', () => {
  it('lists the UI plugins, none of them a renderer', () => {
    expect(Object.keys(UI_CATALOGUE)).toEqual(
      expect.arrayContaining(['chat', 'notebook', 'a2ui-surface', 'app-page']),
    );
    for (const plugin of listUI()) {
      expect(plugin.name).toBeTruthy();
      expect(plugin.plugin).toMatch(/^@datalayer\/loop-plugin-/);
      expect(UI_RENDERER_CATALOGUE[plugin.id]).toBeUndefined();
      for (const renderer of plugin.renderers) {
        expect(getUiRenderer(renderer)).toBeDefined();
      }
    }
    expect(getUI('a2ui')).toBeUndefined();
  });

  it('lists the renderers apart: A2UI, MCP Apps and MCP UI', () => {
    expect(Object.keys(UI_RENDERER_CATALOGUE).sort()).toEqual([
      'a2ui',
      'mcp-apps',
      'mcp-ui',
    ]);
    expect(getUiRenderer('a2ui')?.enabled).toBe(true);
  });

  it('is what an agent spec names, under ui', () => {
    const named = listAgentspecs().filter(spec => (spec.ui ?? []).length > 0);
    expect(named.length).toBeGreaterThan(0);
    for (const spec of named) {
      for (const choice of spec.ui ?? []) {
        const plugin = getUI(choice.plugin);
        expect(plugin).toBeDefined();
        if (choice.renderer) {
          expect(plugin!.renderers).toContain(choice.renderer);
        }
      }
    }
  });
});
