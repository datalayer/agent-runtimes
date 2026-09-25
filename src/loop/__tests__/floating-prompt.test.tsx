/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The prompt plugin: one command, one channel, and a placement.
 *
 * The composer itself is the chat's — `promptPlacement: 'floating'` is the
 * same `InputPrompt` in a draggable card, covered beside that component. What
 * lives here is the plumbing that makes it first-class: the `/prompt` command
 * reaching whatever renders the composer, and the preset switching the
 * placement and the command on together.
 */

import { describe, expect, it } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { PromptPlugin, PROMPT_PLUGIN_NAME } from '../plugins/prompt';
import { CHAT_PLUGIN_NAME, type ChatPluginConfig } from '../plugins/chat';
import { loopPlugins } from '../presets';
import { LoopCommand, focusPrompt, onPromptFocusRequest } from '../core';

/** The command a plugin contributes, by name. */
function commandOf(plugin: { contributes?: readonly any[] }, name: string) {
  const record = (plugin.contributes ?? []).find(
    entry => entry.point === LoopCommand && entry.value.name === name,
  );
  return record?.value;
}

describe('the /prompt command', () => {
  it('asks whatever renders the composer for the caret', async () => {
    let asked = 0;
    const stop = onPromptFocusRequest(() => {
      asked += 1;
    });

    const command = commandOf(PromptPlugin, 'prompt')!;
    await command.run({ workspace: {} as never, argv: '' });
    expect(asked).toBe(1);

    stop();
  });

  it('says so when nothing is listening', async () => {
    const command = commandOf(PromptPlugin, 'prompt')!;
    // Nothing mounted: the palette shows this rather than appearing to work.
    await expect(
      command.run({ workspace: {} as never, argv: '' }),
    ).rejects.toThrow(/No prompt is on screen/);
  });

  it('reports whether anyone was listening', () => {
    expect(focusPrompt()).toBe(false);
    const stop = onPromptFocusRequest(() => {});
    expect(focusPrompt()).toBe(true);
    stop();
    expect(focusPrompt()).toBe(false);
  });

  it('spends a keystroke on being summoned', () => {
    expect(commandOf(PromptPlugin, 'prompt')!.keybinding).toBe('Mod+Alt+P');
  });
});

describe('the preset switch', () => {
  it('floats the chat composer and mounts the command, together', () => {
    const reactor = buildReactorFromPlugins(
      loopPlugins({ floatingPrompt: true }),
    );
    expect(reactor.hasPlugin(PROMPT_PLUGIN_NAME)).toBe(true);
    const chat = reactor.getConfig<ChatPluginConfig>(CHAT_PLUGIN_NAME);
    // The chat still ships the composer — the placement is what changes.
    // A second input box from this plugin would be a composer that drifts.
    expect(chat?.promptPlacement).toBe('floating');
    expect(chat?.hidePrompt).toBe(false);
  });

  it('changes nothing when left off', () => {
    const reactor = buildReactorFromPlugins(loopPlugins({}));
    expect(reactor.hasPlugin(PROMPT_PLUGIN_NAME)).toBe(false);
    expect(
      reactor.getConfig<ChatPluginConfig>(CHAT_PLUGIN_NAME)?.promptPlacement,
    ).not.toBe('floating');
  });
});
