/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** The prompt plugin's + reaches the footer slot. */

import { describe, expect, it } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { PromptPlugin, PROMPT_PLUGIN_NAME } from '../plugins/prompt';
import { LoopSlots } from '../core';

describe('the + in the prompt footer', () => {
  it('is contributed to the promptAction slot', async () => {
    const reactor = buildReactorFromPlugins([PromptPlugin]);
    await reactor.start();
    const output = reactor.getOutput<{ components?: { slot: string }[] }>(
      PROMPT_PLUGIN_NAME,
    );
    expect(
      output?.components?.some(c => c.slot === LoopSlots.promptAction),
    ).toBe(true);
  });
});
