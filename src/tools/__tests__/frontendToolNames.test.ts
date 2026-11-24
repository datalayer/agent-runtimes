/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, expect, it } from 'vitest';
import { namedFrontendTool } from '../frontendToolNames';
import type { FrontendToolDefinition } from '../../types/tools';

const tool = (name: string): FrontendToolDefinition => ({
  name,
  description: 'Changes the editor.',
  parameters: { type: 'object', properties: {} },
  handler: async () => undefined,
});

describe('model-facing frontend tool descriptions', () => {
  it('says documents can be created in a public demo without a filesystem', () => {
    const named = namedFrontendTool(tool('insertBlock'), 'document');
    expect(named.name).toBe('documentInsertBlock');
    expect(named.description).toContain('current in-page Document tab');
    expect(named.description).toContain('public demo');
    expect(named.description).toContain('call it immediately');
    expect(named.description).toContain('no filesystem access');
  });

  it('says notebooks can be created in the mounted page tab', () => {
    const named = namedFrontendTool(tool('insertCell'), 'notebook');
    expect(named.name).toBe('notebookInsertCell');
    expect(named.description).toContain('current in-page Notebook tab');
    expect(named.description).toContain('creating a notebook');
  });

  it('does not add editor claims to unrelated frontend tools', () => {
    const named = namedFrontendTool(tool('sheetCreate'));
    expect(named.description).toBe('Changes the editor.');
  });
});
