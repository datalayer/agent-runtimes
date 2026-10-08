/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What stays out of the embed's initial load (STUDIO D-08): the modules it
 * imports statically do not import what is drawn only when shown. The build
 * itself measures the load against its budget (`vite.embed.config.ts`); this
 * holds the imports that budget was won with, where a slip would be an import
 * line.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GraphPlugin } from '@datalayer/reactor-graph';
import { REACTOR_GRAPH_PLUGIN_NAME } from '../plugins/plugins-panel';

const source = (path: string) =>
  readFileSync(join(__dirname, '..', '..', path), 'utf8');

/** The module specifiers a file imports statically, types aside. */
const staticImports = (path: string): string[] =>
  [...source(path).matchAll(/^import (?!type )[^;]*? from '([^']+)';/gms)].map(
    match => match[1],
  );

describe('the embed’s initial load', () => {
  it('names the generic graph plugin without importing it', () => {
    expect(REACTOR_GRAPH_PLUGIN_NAME).toBe(GraphPlugin.name);
    expect(staticImports('apps/plugins/plugins-panel/index.tsx')).not.toContain(
      '@datalayer/reactor-graph',
    );
  });

  it('leaves the plugin graph to the host that shows it', () => {
    const preset = staticImports('apps/presets.ts');
    expect(preset).not.toContain('./plugins/graph');
    expect(preset).not.toContain('@datalayer/reactor-graph');
  });

  it('fetches the agent’s details and the companion notebook when shown', () => {
    const chat = staticImports('chat/base/ChatBase.tsx');
    expect(chat).not.toContain('../../agents/AgentDetails');
    expect(chat).not.toContain('../notebook/EphemeralNotebook');
    expect(source('chat/base/ChatBase.tsx')).toContain(
      "import('../../agents/AgentDetails')",
    );
    expect(source('chat/base/ChatBase.tsx')).toContain(
      "import('../notebook/EphemeralNotebook')",
    );
  });

  it('fetches ECharts for a chart, rjsf and Ajv for a form, when drawn', () => {
    expect(staticImports('components/a2ui/datalayer/Chart.tsx')).not.toContain(
      'echarts-for-react',
    );
    const form = staticImports('components/a2ui/datalayer/Form.tsx');
    expect(form).not.toContain('@datalayer/primer-rjsf');
    expect(form).not.toContain('@rjsf/validator-ajv8');
  });
});
