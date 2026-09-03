/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The chat, in three plugins: the view, the composer, the title bar.
 *
 * What is pinned: the chat view *assembles* the composer's and header's
 * props and renders whatever was contributed to `LoopChatComposer` and
 * `LoopChatHeader` — it no longer draws either surface itself — and the
 * preset mounts the two standard takers so a stock workspace looks exactly
 * as it did. Untick the input-prompt plugin and the box goes; untick the
 * chat-header plugin and the title bar goes; the transcript stays.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loopPlugins } from '../presets';
import {
  InputPromptPlugin,
  INPUT_PROMPT_PLUGIN_NAME,
} from '../plugins/input-prompt';
import {
  ChatHeaderPlugin,
  CHAT_HEADER_PLUGIN_NAME,
} from '../plugins/chat-header';
import { LoopChatComposer, LoopChatHeader } from '../core';
import { ChatViewPlugin } from '../plugins/chat-view';
import { NotebookViewPlugin } from '../plugins/notebook-view';
import { DocumentViewPlugin } from '../plugins/document-view';
import { INPUT_PROMPT_PLUGIN_NAME as COMPOSER_NAME } from '../plugins/input-prompt';

const chatViewSource = () =>
  readFileSync(join(__dirname, '../plugins/chat/ChatView.tsx'), 'utf8');

describe('the chat split', () => {
  it('mounts the composer and header plugins in the standard preset', () => {
    const names = loopPlugins({})
      .map(entry =>
        typeof entry === 'object' && entry !== null && 'plugin' in entry
          ? (entry as { plugin: { name: string } }).plugin.name
          : (entry as { name: string }).name,
      )
      .filter(Boolean);
    expect(names).toContain(INPUT_PROMPT_PLUGIN_NAME);
    expect(names).toContain(CHAT_HEADER_PLUGIN_NAME);
  });

  it('has each plugin contribute a component to its point', () => {
    const composer = InputPromptPlugin.contributes?.find(
      entry => entry.point === LoopChatComposer,
    );
    expect(composer).toBeDefined();
    expect((composer?.value as { Component?: unknown })?.Component).toBeTypeOf(
      'function',
    );

    const header = ChatHeaderPlugin.contributes?.find(
      entry => entry.point === LoopChatHeader,
    );
    expect(header).toBeDefined();
    expect((header?.value as { Component?: unknown })?.Component).toBeTypeOf(
      'function',
    );
  });

  it('leaves the rendering to the contributions', () => {
    const source = chatViewSource();
    // The view assembles props and asks the points; it draws neither surface
    // itself any more.
    expect(source).toContain('useContributions(LoopChatComposer)');
    expect(source).toContain('useContributions(LoopChatHeader)');
    expect(source).not.toMatch(/<InputPrompt\b/);
    expect(source).toContain('const prompt = ComposerComponent ? (');
    // The header only shows when a plugin took the point (and the host did
    // not hide it).
    expect(source).toContain(
      'showHeader={!config?.hideHeader && !!HeaderComponent}',
    );
  });
});

describe('the view plugins', () => {
  it.each([
    ['chat', ChatViewPlugin],
    ['notebook', NotebookViewPlugin],
    ['document', DocumentViewPlugin],
  ])('%s view requires the input-prompt plugin', (_name, plugin) => {
    const dependencyNames = (plugin.dependencies ?? []).map(entry =>
      typeof entry === 'object' && entry !== null && 'plugin' in entry
        ? (entry as { plugin: { name: string } }).plugin.name
        : (entry as { name: string }).name,
    );
    expect(dependencyNames).toContain(COMPOSER_NAME);
  });

  it('each puts one action in the composer footer slot', () => {
    for (const plugin of [
      ChatViewPlugin,
      NotebookViewPlugin,
      DocumentViewPlugin,
    ]) {
      const output = plugin.build?.({
        config: {},
        reactor: {} as never,
        contribute: (() => {}) as never,
        state: {} as never,
      } as never) as { components?: { slot: string }[] };
      expect(output?.components?.[0]?.slot).toBe('loop.promptAction');
    }
  });
});
