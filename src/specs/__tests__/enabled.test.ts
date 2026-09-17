/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Every catalogue entry says whether the platform offers it.
 *
 * The integrations page tells enabled from not-available by these flags, so
 * a spec without one would be drawn as whatever the page assumes. Models say
 * `available`; MCP servers, skills and outputs say `enabled`, generated from
 * the YAML and off unless the spec says otherwise.
 */

import { describe, expect, it } from 'vitest';
import { AI_MODEL_CATALOGUE } from '../models';
import { MCP_SERVER_LIBRARY } from '../mcpServers';
import { SKILLS_CATALOG } from '../skills';
import { OUTPUT_CATALOG } from '../outputs';

describe('the catalogues say what is offered', () => {
  it('every model says whether it is available', () => {
    const models = Object.values(AI_MODEL_CATALOGUE);
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(typeof model.available).toBe('boolean');
    }
  });

  it.each([
    ['MCP server', MCP_SERVER_LIBRARY],
    ['skill', SKILLS_CATALOG],
    ['output', OUTPUT_CATALOG],
  ])('every %s says whether it is enabled', (_kind, catalogue) => {
    const entries = Object.values(
      catalogue as Record<string, { id: string; enabled?: unknown }>,
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(typeof entry.enabled).toBe('boolean');
    }
  });
});
