/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which examples bring their own agent.
 *
 * The file this tests used to hold a second predicate deciding which examples
 * were *allowed* a cloud runtime, and it was wrong twice — once by excluding
 * every agent example (a deadlock: a runtime was offered only to an example
 * that already had one), and once by requiring a code surface (wrong premise:
 * an agent needs a runtime to run on, not a notebook to run against).
 *
 * There is no such gate now, so there is nothing here to test about it. What
 * remains is the one question a name can honestly answer.
 */

import { describe, expect, it } from 'vitest';

import { EXAMPLE_ENTRIES } from '../example-selector';
import { isSandboxOnlyExample } from '../utils/exampleSurfaces';

describe('bringing your own agent', () => {
  it('is what an example with Agent in its name does', () => {
    expect(isSandboxOnlyExample('NotebookAgentExample')).toBe(false);
    expect(isSandboxOnlyExample('NotebookAgentSidebarExample')).toBe(false);
  });

  it('leaves a bare surface as sandbox-only', () => {
    expect(isSandboxOnlyExample('NotebookExample')).toBe(true);
    expect(isSandboxOnlyExample('CellExample')).toBe(true);
  });

  it('says nothing about an example with no surface at all', () => {
    // `AgentToolApprovalsExample` renders no notebook and no cell, and is not
    // "sandbox only" — it is the opposite, an agent with no surface. The
    // predicate answers only the question it is named for, which is why the
    // cloud target no longer consults it.
    expect(isSandboxOnlyExample('AgentToolApprovalsExample')).toBe(false);
    expect(isSandboxOnlyExample('ChatExample')).toBe(false);
  });

  it('is asked only about examples that exist', () => {
    const ids = new Set(EXAMPLE_ENTRIES.map(entry => entry.id));
    for (const id of [
      'NotebookAgentExample',
      'NotebookAgentSidebarExample',
      'NotebookExample',
      'CellExample',
      'AgentToolApprovalsExample',
      'ChatExample',
    ]) {
      expect(ids, `${id} is a registered example`).toContain(id);
    }
  });
});
