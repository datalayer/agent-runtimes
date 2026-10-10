/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import { MCP_SERVER_LIBRARY } from '../../../specs/mcpServers';
import { SKILLS_CATALOG } from '../../../specs/skills';
import { FRONTEND_TOOL_CATALOG } from '../../../specs/frontendTools';
import { BACKEND_TOOL_CATALOG } from '../../../specs/backendTools';
import { ToolCallDisplay } from '../../tools/ToolCallDisplay';
import {
  exportNameOf,
  iconOf,
  loadIconPackage,
  marksOfToolCall,
  parseIconRef,
} from '..';

const CATALOGUES = {
  'mcp-servers': Object.values(MCP_SERVER_LIBRARY),
  skills: Object.values(SKILLS_CATALOG),
  tools: Object.values(BACKEND_TOOL_CATALOG),
  'frontend-tools': Object.values(FRONTEND_TOOL_CATALOG),
};

describe('an icon reference', () => {
  it('names its package and the icon as the package exports it', () => {
    expect(parseIconRef('@datalayer/icons-react:odoo')).toEqual({
      pkg: '@datalayer/icons-react',
      name: 'odoo',
      exportName: 'OdooIcon',
    });
    expect(exportNameOf('mark-github')).toBe('MarkGithubIcon');
  });

  it('refuses a bare name, another package, or an export name', () => {
    for (const ref of [
      'notebook',
      '@mui/icons-material:home',
      '@primer/octicons-react:ToolsIcon',
    ]) {
      expect(() => parseIconRef(ref)).toThrow(/<package>:<name>/);
    }
  });

  it('is one its package has, for every entry of the four catalogues', async () => {
    const missing: string[] = [];
    let counted = 0;
    for (const [catalogue, entries] of Object.entries(CATALOGUES)) {
      for (const entry of entries) {
        expect(entry.icon, `${catalogue}/${entry.id}`).toBeTruthy();
        expect(entry.emoji, `${catalogue}/${entry.id}`).toBeTruthy();
        const ref = parseIconRef(entry.icon as string);
        const module = await loadIconPackage(ref.pkg);
        try {
          iconOf(ref, module);
          counted += 1;
        } catch {
          missing.push(`${catalogue}/${entry.id}: ${entry.icon}`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(counted).toBeGreaterThan(40);
  });
});

describe('whose a tool call is', () => {
  it('an MCP tool is its server’s, by the tools the server serves', () => {
    const marks = marksOfToolCall('odoo_accounting_list_invoices', {}, [
      {
        id: 'odoo-accounting',
        tools: [{ name: 'odoo_accounting_list_invoices' }],
      },
    ]);
    expect(marks).toMatchObject({
      kind: 'mcp',
      ownerId: 'odoo-accounting',
      icon: '@datalayer/icons-react:odoo',
    });
  });

  it('a skill call is the skill’s it names', () => {
    expect(
      marksOfToolCall('run_skill_script', { skill_name: 'github:0.0.1' }),
    ).toMatchObject({
      kind: 'skill',
      ownerId: 'github',
      icon: '@datalayer/icons-react:github-mark',
    });
  });

  it('a frontend tool is its set’s, a runtime tool its spec’s', () => {
    expect(marksOfToolCall('readCell', {})).toMatchObject({
      kind: 'frontend',
      icon: '@datalayer/icons-react:jupyter',
    });
    expect(marksOfToolCall('runtime_echo', {})).toMatchObject({
      kind: 'runtime',
      ownerId: 'runtime-echo',
      icon: '@primer/octicons-react:comment',
    });
  });

  it('a tool nobody claims has no mark', () => {
    expect(marksOfToolCall('something_else', {})).toBeNull();
  });
});

describe('the tool call’s leading visual', () => {
  async function render(marks?: { icon?: string; emoji?: string } | null) {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ToolCallDisplay
          toolCallId="call-1"
          toolName="list_invoices"
          args={{}}
          status="complete"
          marks={marks}
        />,
      );
    });
    // The package is imported on first use: let it land.
    await act(async () => {
      await loadIconPackage('@datalayer/icons-react');
    });
    const html = container.querySelector('[data-mark]');
    root.unmount();
    return html;
  }

  it('is the icon when there is one', async () => {
    const mark = await render({
      icon: '@datalayer/icons-react:odoo',
      emoji: '🧮',
    });
    expect(mark?.getAttribute('data-mark')).toBe('@datalayer/icons-react:odoo');
    expect(mark?.querySelector('svg')).not.toBeNull();
  });

  it('is the emoji where there is no icon', async () => {
    const mark = await render({ emoji: '🧮' });
    expect(mark?.getAttribute('data-mark')).toBe('emoji');
    expect(mark?.textContent).toBe('🧮');
  });

  it('is nothing where there is neither', async () => {
    expect(await render(null)).toBeNull();
  });
});
