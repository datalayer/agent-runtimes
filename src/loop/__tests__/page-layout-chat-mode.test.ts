/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The page layout's display modes: where each puts the composer and the
 * conversation, how the chat view learns the composer's stance, and that a
 * docked composer has none of it.
 */

import { describe, expect, it } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { pageLayoutPanelOpen } from '@datalayer/primer-addons/lib/reactor';
import { loopPlugins } from '../presets';
import { LoopChatLayout } from '../core';
import {
  pageLayoutChatMode,
  pageLayoutForChatMode,
  setPageLayoutChatMode,
} from '../plugins/page-layout';

async function started(options: Parameters<typeof loopPlugins>[0]) {
  const reactor = buildReactorFromPlugins(loopPlugins(options));
  await reactor.start();
  return reactor;
}

describe('the page layout chat modes', () => {
  it('put the card over the page, or the composer in the panel — beside, over, or in a corner', () => {
    expect(pageLayoutForChatMode('floating-draggable')).toEqual({
      bandMode: 'floating',
      panelMode: 'docked',
    });
    expect(pageLayoutForChatMode('sidebar')).toEqual({
      bandMode: 'panel',
      panelMode: 'docked',
    });
    expect(pageLayoutForChatMode('floating')).toEqual({
      bandMode: 'panel',
      panelMode: 'overlay',
    });
    expect(pageLayoutForChatMode('floating-small')).toEqual({
      bandMode: 'panel',
      panelMode: 'popup',
    });
  });

  it('publish the composer stance live, and open the panel when the composer goes there', async () => {
    const reactor = await started({
      pageLayout: true,
      pageLayoutPrompt: 'floating',
    });
    const layout = reactor.getContributions(LoopChatLayout)[0].value;
    setPageLayoutChatMode('floating-draggable');
    pageLayoutPanelOpen.value = false;
    expect(layout.prompt).toBe('floating-top');
    expect(layout.promptStance?.value).toBe('floating-top');

    setPageLayoutChatMode('sidebar');
    expect(pageLayoutChatMode.value).toBe('sidebar');
    expect(layout.promptStance?.value).toBe('docked-top');
    expect(pageLayoutPanelOpen.value).toBe(true);

    setPageLayoutChatMode('floating-draggable');
    expect(layout.promptStance?.value).toBe('floating-top');
  });

  it('bring a bottom-anchored card back to the bottom', async () => {
    const reactor = await started({
      pageLayout: true,
      pageLayoutPrompt: 'floating',
      pageLayoutPromptAnchor: 'bottom',
    });
    const layout = reactor.getContributions(LoopChatLayout)[0].value;
    setPageLayoutChatMode('sidebar');
    expect(layout.promptStance?.value).toBe('docked-top');
    setPageLayoutChatMode('floating-draggable');
    expect(layout.promptStance?.value).toBe('floating-bottom');
  });

  it('leave a docked composer alone: no live stance', async () => {
    const reactor = await started({ pageLayout: true });
    const layout = reactor.getContributions(LoopChatLayout)[0].value;
    expect(layout.prompt).toBe('docked-top');
    expect(layout.promptStance).toBeUndefined();
  });
});
