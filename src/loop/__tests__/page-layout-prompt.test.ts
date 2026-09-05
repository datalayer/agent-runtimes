/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The page layout's composer: docked in a band by default, a draggable card
 * on request — and the turn panel, present by default, absent on request.
 * Read off the contributions the preset's plugin makes, which is what the
 * chat view reads.
 */

import { describe, expect, it } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { loopPlugins } from '../presets';
import { LoopChatLayout, LoopPromptPanel } from '../core';
import {
  LOOP_PAGE_LAYOUT_PLUGIN_NAME,
  type LoopPageLayoutConfig,
} from '../plugins/page-layout';

async function started(options: Parameters<typeof loopPlugins>[0]) {
  const reactor = buildReactorFromPlugins(loopPlugins(options));
  await reactor.start();
  return reactor;
}

describe('the page layout composer', () => {
  it('docks the composer above the sheet by default', async () => {
    const reactor = await started({ pageLayout: true });
    expect(
      reactor.getConfig<LoopPageLayoutConfig>(LOOP_PAGE_LAYOUT_PLUGIN_NAME)
        ?.prompt,
    ).toBe('docked');
    const layouts = reactor.getContributions(LoopChatLayout);
    expect(layouts).toHaveLength(1);
    expect(layouts[0].value.prompt).toBe('docked-top');
  });

  it('floats the composer as a draggable card on request', async () => {
    const reactor = await started({
      pageLayout: true,
      pageLayoutPrompt: 'floating',
    });
    expect(
      reactor.getConfig<LoopPageLayoutConfig>(LOOP_PAGE_LAYOUT_PLUGIN_NAME)
        ?.prompt,
    ).toBe('floating');
    expect(reactor.getContributions(LoopChatLayout)[0].value.prompt).toBe(
      'floating-top',
    );
  });

  it('hangs the turn panel on the composer unless told not to', async () => {
    const withPanel = await started({ pageLayout: true });
    expect(
      withPanel
        .getContributions(LoopPromptPanel)
        .some(entry => entry.id === 'page-layout-turn'),
    ).toBe(true);

    const without = await started({
      pageLayout: true,
      pageLayoutTurnPanel: 'none',
    });
    expect(
      without
        .getContributions(LoopPromptPanel)
        .some(entry => entry.id === 'page-layout-turn'),
    ).toBe(false);
  });
});
