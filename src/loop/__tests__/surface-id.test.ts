/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The id the workspace's surfaces are known by.
 *
 * Three things have to agree on it: the notebook that renders, the document
 * that renders, and the frontend tools an in-page agent is given to reach
 * them. They each built the string themselves, which worked only for as long
 * as nobody changed one of them — and a tool addressed to a different id than
 * the surface on screen edits nothing and reports success, which is the worst
 * way for this to be wrong.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { loopSurfaceId } from '../core';

const PLUGINS = join(__dirname, '..', 'plugins');

describe('naming a surface', () => {
  it('is derived from the session', () => {
    expect(loopSurfaceId('loop-workspace')).toBe('loop-loop-workspace');
  });

  it('has an answer for a workspace with no session id', () => {
    // A blank id must not produce `loop-`, which two workspaces would share.
    expect(loopSurfaceId(undefined)).toBe('loop-default');
    expect(loopSurfaceId('')).toBe('loop-default');
  });
});

describe('everyone that names one', () => {
  it.each([
    ['notebook/NotebookView.tsx'],
    ['document/DocumentView.tsx'],
    ['chat/ChatView.tsx'],
  ])('reads the one the workspace minted — %s', file => {
    const source = readFileSync(join(PLUGINS, file), 'utf8');
    expect(source).toContain('workspace.surfaceId');
    // Deriving one locally is what drifted, and deriving it from the agent
    // renamed the surface on every switch — which threw the notebook away.
    expect(source).not.toContain('`loop-${workspace.agentId');
    expect(source).not.toContain('loopSurfaceId(workspace.agentId)');
  });
});

describe('what an in-page agent can reach', () => {
  it('is given the notebook tools', () => {
    /*
     * On every other target the agent runs on a server with a sandbox of its
     * own, and "run this cell" happens there. In the browser there is no
     * server: without frontend tools the agent answers and the cell never
     * runs, which is exactly how it behaved.
     */
    // The chat reads its tools from its own extension point now; the
    // notebook's contribution is what carries the surface id in.
    const chat = readFileSync(join(PLUGINS, 'chat/ChatView.tsx'), 'utf8');
    expect(chat).toContain('useContributions(LoopFrontendTool)');
    const notebook = readFileSync(join(PLUGINS, 'notebook/index.ts'), 'utf8');
    expect(notebook).toContain('createNotebookTools(workspace.surfaceId)');
    expect(chat).toContain('frontendTools: notebookTools');
  });

  it('does not also hand them to the chat', () => {
    // The harness runs them itself. Giving them to both runs each tool twice.
    const source = readFileSync(join(PLUGINS, 'chat/ChatView.tsx'), 'utf8');
    expect(source).not.toMatch(/frontendTools=\{/);
  });
});
