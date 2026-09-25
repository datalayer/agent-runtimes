/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `firstPromptHook`: called once, the first time a person actually sends a
 * message — never on typing, never again after.
 *
 * It is configuration on the input-prompt plugin (a host sets it there, and
 * `InputPromptPluginConfig` is where it is documented), but it is watched for
 * in the chat view's own `handleSend`, not inside the composer that plugin
 * renders. Three different things reach `handleSend` — the composer's own
 * submit, a suggestion chip clicked, and a host's own
 * `suggestLoopPrompt(text, {submit: true})` arriving through the prompt store
 * — and the composer sees only the first of them. Watching from inside it
 * would miss a CTA that opens the workspace and submits its own suggestion in
 * one step, which is exactly the case this hook exists for.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import {
  INPUT_PROMPT_PLUGIN_NAME,
  type InputPromptPluginConfig,
} from '../plugins/input-prompt';
import { loopPlugins } from '../presets';

const inputPromptConfig = (options = {}) =>
  buildReactorFromPlugins(
    loopPlugins(options),
  ).getConfig<InputPromptPluginConfig>(INPUT_PROMPT_PLUGIN_NAME);

describe('the preset option', () => {
  it('reaches the input-prompt plugin, not just the chat', () => {
    const hook = () => {};
    expect(inputPromptConfig({ firstPromptHook: hook })?.firstPromptHook).toBe(
      hook,
    );
  });

  it('is absent by default, so nothing fires for a host that never asked', () => {
    expect(inputPromptConfig()?.firstPromptHook).toBeUndefined();
  });
});

const CHAT_VIEW = readFileSync(
  join(__dirname, '..', 'plugins', 'chat', 'ChatView.tsx'),
  'utf8',
);

/** `handleSend`, from its declaration to the end of its dependency list. */
function sendHandler(): string {
  const start = CHAT_VIEW.indexOf('const handleSend = useCallback(');
  expect(start).toBeGreaterThan(-1);
  const end = CHAT_VIEW.indexOf(
    '[workspace, inputPromptConfig?.firstPromptHook],',
    start,
  );
  expect(end).toBeGreaterThan(start);
  return CHAT_VIEW.slice(start, end);
}

describe('the chat view that watches for it', () => {
  it('reads the input-prompt plugin’s own config, not the chat’s', () => {
    expect(CHAT_VIEW).toContain(
      'reactor.getConfig<InputPromptPluginConfig>(\n    INPUT_PROMPT_PLUGIN_NAME,\n  );',
    );
  });

  it('checks the guard before calling the hook', () => {
    const handler = sendHandler();
    const checked = handler.indexOf('if (!firstPromptFired.current)');
    const called = handler.indexOf('inputPromptConfig?.firstPromptHook?.()');
    expect(checked).toBeGreaterThan(-1);
    expect(called).toBeGreaterThan(checked);
  });

  it('raises the guard before calling the hook, so a hook that sends again cannot re-enter', () => {
    const handler = sendHandler();
    const raised = handler.indexOf('firstPromptFired.current = true');
    const called = handler.indexOf('inputPromptConfig?.firstPromptHook?.()');
    expect(raised).toBeGreaterThan(-1);
    expect(raised).toBeLessThan(called);
  });

  it('checks the guard before the message is even submitted, guarded or not', () => {
    const handler = sendHandler();
    const guardClose = handler.indexOf(
      '}',
      handler.indexOf('if (!firstPromptFired.current)'),
    );
    const submitted = handler.indexOf('await workspace.submit(message)');
    // Outside the `if`, and before the outcome is known: an attempt counts,
    // not only a send the workspace went on to accept.
    expect(submitted).toBeGreaterThan(guardClose);
  });

  it('is the one function every send reaches: the chips too, not the composer alone', () => {
    // The suggestion chips call `handleSend` directly, past the composer
    // entirely — proof that watching from inside the composer would have
    // missed them.
    expect(CHAT_VIEW).toContain(
      'onClick={() => void handleSend(item.message)}',
    );
    // So does a host's own submitted suggestion, through the prompt store.
    expect(CHAT_VIEW).toContain('if (suggestion.submit) {');
    expect(CHAT_VIEW).toContain('void handleSend(suggestion.text);');
  });
});
