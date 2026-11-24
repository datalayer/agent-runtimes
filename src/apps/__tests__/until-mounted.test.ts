/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A document's or a notebook's tool waits for its panel (the user,
 * 24 November 2026: "create a notebook and document fails"): it asks for
 * the panel, waits for its editor, then runs; past the bound it says so.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { untilMounted } from '../pageTools/untilMounted';
import { lastReveal, subscribeReveal } from '../shell/sidePanelReveal';

describe('untilMounted', () => {
  afterEach(() => vi.useRealTimers());

  it('runs at once when the surface is already mounted, asking for no panel', async () => {
    const before = lastReveal()?.seq ?? 0;
    const handler = vi.fn(async () => ({ ok: true }));
    const [tool] = untilMounted(
      [
        {
          name: 'document_insert_block',
          description: '',
          parameters: {},
          handler,
        },
      ],
      () => true,
      'the document',
    );
    await expect(tool.handler!({ a: 1 })).resolves.toEqual({ ok: true });
    expect(handler).toHaveBeenCalledWith({ a: 1 });
    expect(lastReveal()?.seq ?? 0).toBe(before);
  });

  it('asks for its panel, waits for the editor, then runs', async () => {
    let mounted = false;
    const asked: string[] = [];
    const stop = subscribeReveal(() => asked.push(lastReveal()!.toolName));
    const handler = vi.fn(async () => ({ ok: true }));
    const [tool] = untilMounted(
      [
        {
          name: 'document_insert_block',
          description: '',
          parameters: {},
          handler,
        },
      ],
      () => mounted,
      'the document',
      5_000,
    );
    const running = tool.handler!({});
    expect(asked).toEqual(['document_insert_block']);
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(handler).not.toHaveBeenCalled();
    mounted = true;
    await expect(running).resolves.toEqual({ ok: true });
    stop();
  });

  it('says the surface did not open past the bound, and never runs the tool', async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const [tool] = untilMounted(
      [
        {
          name: 'notebook_insert_cell',
          description: '',
          parameters: {},
          handler,
        },
      ],
      () => false,
      'the notebook',
      250,
    );
    await expect(tool.handler!({})).rejects.toThrow(
      'The notebook did not open in the page',
    );
    expect(handler).not.toHaveBeenCalled();
  });
});
