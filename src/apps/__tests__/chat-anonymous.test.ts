/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `runAsAnonymous` and `maxTurns` (the user, 15 November 2026): the preset
 * hands them to the chat, which closes its prompt while the temporary key
 * is checked and once the turns or the minutes are spent, draws the box on
 * top, the key's clock in its header and Anonymous in its footer. Its MCP
 * servers and skills are not said disabled: the runtime's equipment says
 * what a visitor has (equipment-menus.test).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { CHAT_PLUGIN_NAME, type ChatPluginConfig } from '../plugins/chat';
import { loopPlugins } from '../presets';

const chatConfig = (options = {}) =>
  buildReactorFromPlugins(loopPlugins(options)).getConfig<ChatPluginConfig>(
    CHAT_PLUGIN_NAME,
  );

describe('the preset’s runAsAnonymous', () => {
  it('reaches the chat with its turns and its sign-in', () => {
    const onSignIn = () => undefined;
    expect(
      chatConfig({
        runAsAnonymous: true,
        maxTurns: 10,
        signInUrl: 'https://x.io/signin',
        onSignIn,
      })?.anonymous,
    ).toEqual({ maxTurns: 10, signInUrl: 'https://x.io/signin', onSignIn });
  });

  it('enforces no turns when maxTurns is not a number of turns', () => {
    expect(chatConfig({ runAsAnonymous: true })?.anonymous).toEqual({});
    expect(
      chatConfig({ runAsAnonymous: true, maxTurns: 0 })?.anonymous,
    ).toEqual({});
  });

  it('is off unless asked', () => {
    expect(chatConfig({ maxTurns: 10 })?.anonymous).toBeUndefined();
  });
});

const CHAT_VIEW = readFileSync(
  join(__dirname, '..', 'plugins', 'chat', 'ChatView.tsx'),
  'utf8',
);

describe('the chat, anonymous', () => {
  it('closes the prompt while the key is checked, and once no turn is left', () => {
    expect(CHAT_VIEW).toMatch(
      /const anonymousValidating = Boolean\(\s+anonymousConfig &&\s+visitors &&\s+!visitor\.error &&/,
    );
    expect(CHAT_VIEW).toContain('? ANONYMOUS_WORDS.validating');
  });

  it('takes a turn each time the agent sets to work', () => {
    expect(CHAT_VIEW).toContain(
      'if (anonymousConfig && busy && !anonymousWasBusy.current) {',
    );
  });

  it('draws the box, the clock and the footer, and no disabled lists', () => {
    expect(CHAT_VIEW).toContain(
      '<AnonymousPreviewBox state={anonymousState} />',
    );
    expect(CHAT_VIEW).toContain('<AnonymousKeyClock state={anonymousState} />');
    expect(CHAT_VIEW).toContain('<AnonymousFooterLabel />');
    expect(CHAT_VIEW).not.toContain('anonymousDisabled');
    expect(CHAT_VIEW).toContain('...(equipmentShown ? { equipment } : {}),');
    expect(CHAT_VIEW).toContain(
      '<AnonymousChatProvider value={anonymousState}>',
    );
  });
});
