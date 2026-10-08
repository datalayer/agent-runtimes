/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `/notebook` and `/document` open their editor.
 *
 * Both used to call `setActiveViewType('chat')` and stop there, which shows
 * the chat and leaves whichever surface was already open. On the chat view —
 * where a reader usually is — that is indistinguishable from a command that
 * does nothing, which is what it was.
 */

import { describe, expect, it } from 'vitest';
import { onSurfaceRequest, requestSurface } from '../core';
import { NotebookPlugin } from '../plugins/notebook';
import { DocumentPlugin } from '../plugins/document';
import { LoopCommand } from '../core';

/** The command a plugin contributes, by name. */
function commandOf(plugin: { contributes?: readonly any[] }, name: string) {
  const record = (plugin.contributes ?? []).find(
    entry => entry.point === LoopCommand && entry.value.name === name,
  );
  return record?.value;
}

/** A workspace stub that records what the command asked of it. */
function workspaceStub() {
  const calls: string[] = [];
  return {
    calls,
    workspace: {
      activeViewType: 'chat',
      setActiveViewType: (viewType: string) => calls.push(viewType),
    } as never,
  };
}

describe('the editor commands', () => {
  it('opens the notebook surface, not just the chat view', async () => {
    const asked: string[] = [];
    const stop = onSurfaceRequest(id => asked.push(id));

    const { workspace, calls } = workspaceStub();
    await commandOf(NotebookPlugin, 'notebook')!.run({ workspace, argv: '' });

    // Both halves: the chat is what the surface sits beside, and the surface
    // is what the command is actually for.
    expect(calls).toEqual(['chat']);
    expect(asked).toEqual(['notebook']);

    stop();
  });

  it('opens the document surface', async () => {
    const asked: string[] = [];
    const stop = onSurfaceRequest(id => asked.push(id));

    const { workspace } = workspaceStub();
    await commandOf(DocumentPlugin, 'document')!.run({ workspace, argv: '' });

    expect(asked).toEqual(['document']);

    stop();
  });

  it('says so when there is no chat to open it beside', async () => {
    const { workspace } = workspaceStub();

    // Nothing listening: the palette shows this rather than appearing to work.
    await expect(
      commandOf(DocumentPlugin, 'document')!.run({ workspace, argv: '' }),
    ).rejects.toThrow(/No chat is on screen/);
  });

  it('reports whether anyone was listening', () => {
    expect(requestSurface('notebook')).toBe(false);

    const stop = onSurfaceRequest(() => {});
    expect(requestSurface('notebook')).toBe(true);
    stop();

    expect(requestSurface('notebook')).toBe(false);
  });
});
