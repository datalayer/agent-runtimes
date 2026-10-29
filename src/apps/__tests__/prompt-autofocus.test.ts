/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Whether the composer takes the caret when the workspace opens.
 *
 * It should, nearly everywhere: a workspace exists to be typed into, and
 * making someone click the box first is a wasted step. The exception is a
 * host that embeds the loop as one section of a longer page — the browser
 * scrolls to whatever takes focus on mount, so a visitor who came for the top
 * of the page is thrown into the middle of it, and a screen reader goes with
 * them. That host asks for `autoFocusPrompt: false`.
 */

import { describe, expect, it } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { CHAT_PLUGIN_NAME, type ChatPluginConfig } from '../plugins/chat';
import { loopPlugins } from '../presets';

const chatConfig = (options = {}) =>
  buildReactorFromPlugins(loopPlugins(options)).getConfig<ChatPluginConfig>(
    CHAT_PLUGIN_NAME,
  );

describe('the composer takes the caret', () => {
  it('by default, so a workspace opens ready to type', () => {
    expect(chatConfig()?.autoFocusPrompt).toBe(true);
  });

  it('unless the host turns it off', () => {
    expect(chatConfig({ autoFocusPrompt: false })?.autoFocusPrompt).toBe(false);
  });

  it('and turning it off leaves the composer itself alone', () => {
    // The prompt is still there and still where it was: this switch is about
    // the caret, not about hiding or moving anything.
    const config = chatConfig({ autoFocusPrompt: false });
    expect(config?.hidePrompt).toBe(false);
    expect(config?.promptPlacement).not.toBe('floating');
  });
});
