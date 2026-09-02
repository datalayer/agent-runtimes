/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating prompt floats, submits, and can be summoned.
 *
 * The card lives in the root slot, which nothing renders unless the shell
 * does — a plugin contributed to an unrendered slot is silently nothing,
 * which is the failure mode this suite pins down. And what is typed must go
 * through `workspace.submit`, because that is the whole contract: the prompt
 * owns no conversation.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { LoopWorkspace } from '../shell/LoopWorkspace';
import { PromptPlugin, PROMPT_PLUGIN_NAME } from '../plugins/prompt';
import { CHAT_PLUGIN_NAME, type ChatPluginConfig } from '../plugins/chat';
import { loopPlugins } from '../presets';
import { LoopCommand } from '../core';

/** The command a plugin contributes, by name. */
function commandOf(plugin: { contributes?: readonly any[] }, name: string) {
  const record = (plugin.contributes ?? []).find(
    entry => entry.point === LoopCommand && entry.value.name === name,
  );
  return record?.value;
}

async function mount(onSend?: (message: string) => void) {
  const reactor = buildReactorFromPlugins([PromptPlugin]);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <LoopWorkspace
        serverUrl=""
        agentId="a"
        reactor={reactor}
        onSend={onSend}
      />,
    );
  });
  return { container, root };
}

/** Type into a controlled React textarea the way a person would. */
function typeInto(textarea: HTMLTextAreaElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )!.set!;
  setter.call(textarea, text);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('the floating prompt', () => {
  it('appears over the workspace, from the root slot', async () => {
    const { container, root } = await mount();

    const card = container.querySelector<HTMLElement>(
      '[data-loop-floating-prompt]',
    );
    // In the workspace, floating: absolutely positioned against the shell,
    // which is what `position: relative` on the workspace root is for.
    expect(card).not.toBeNull();
    expect(container.querySelector('textarea')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('sends what is typed through the workspace dispatch', async () => {
    const heard: string[] = [];
    const { container, root } = await mount(message => heard.push(message));

    const textarea = container.querySelector('textarea')!;
    await act(async () => {
      typeInto(textarea, 'plot a chart');
    });
    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });

    // Through `workspace.submit`, which handed the plain message to the
    // host's `onSend` — the same road the docked prompt takes.
    expect(heard).toEqual(['plot a chart']);
    // And the draft is spent: a sent message must not be sitting in the box.
    expect(textarea.value).toBe('');

    await act(async () => root.unmount());
  });

  it('is focused by its command while mounted', async () => {
    const { container, root } = await mount();
    const textarea = container.querySelector('textarea')!;
    expect(document.activeElement).not.toBe(textarea);

    const command = commandOf(PromptPlugin, 'prompt')!;
    await act(async () => {
      await command.run({ workspace: {} as never, argv: '' });
    });
    expect(document.activeElement).toBe(textarea);

    await act(async () => root.unmount());
  });

  it('says so when there is no prompt to focus', async () => {
    const command = commandOf(PromptPlugin, 'prompt')!;
    // Nothing mounted: the palette shows this rather than appearing to work.
    await expect(
      command.run({ workspace: {} as never, argv: '' }),
    ).rejects.toThrow(/No floating prompt/);
  });

  it('spends a keystroke on being summoned', () => {
    expect(commandOf(PromptPlugin, 'prompt')!.keybinding).toBe('Mod+Alt+P');
  });
});

describe('the preset switch', () => {
  it('mounts the plugin and stands the chat composer down, together', () => {
    const reactor = buildReactorFromPlugins(
      loopPlugins({ floatingPrompt: true }),
    );
    expect(reactor.hasPlugin(PROMPT_PLUGIN_NAME)).toBe(true);
    // The other half of the same decision: two composers for one
    // conversation is one too many.
    expect(
      reactor.getConfig<ChatPluginConfig>(CHAT_PLUGIN_NAME)?.hidePrompt,
    ).toBe(true);
  });

  it('changes nothing when left off', () => {
    const reactor = buildReactorFromPlugins(loopPlugins({}));
    expect(reactor.hasPlugin(PROMPT_PLUGIN_NAME)).toBe(false);
    expect(
      reactor.getConfig<ChatPluginConfig>(CHAT_PLUGIN_NAME)?.hidePrompt,
    ).toBe(false);
  });
});
