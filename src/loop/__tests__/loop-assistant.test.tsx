/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating assistant in the LOOP workspace (LOOP T-24): the character
 * drawn is the one the enabled plugins contribute under the id the
 * application names, else the person's, else the paper clip; an id nothing
 * contributes is said, not replaced; and it acts out the chat's turn.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '@primer/react';
import {
  buildReactorFromPlugins,
  configurePlugin,
  contribution,
  definePlugin,
  signal,
} from '@datalayer/reactor';
import { ReactorSlot, useReactor } from '@datalayer/reactor/react';
import {
  AssistantCharactersPlugin,
  assistantCharacterFor,
  assistantCharactersOf,
} from '../plugins/assistant-characters';
import {
  LoopAssistantPlugin,
  assistantStateOfTurn,
} from '../plugins/assistant';
import {
  LoopAssistantCharacter,
  LoopChatTurn,
  LoopSlots,
  type ChatTurnSnapshot,
} from '../core';
import { ASSISTANT_AWAY_KEY } from '../../chat/assistant/state';

const owl = {
  name: 'Owl',
  frameSize: { width: 10, height: 10 },
  sprite: 'data:,',
  animations: { Idle1_1: { frames: [{ duration: 100, images: [] }] } },
};

const OwlPlugin = definePlugin({
  name: 'test-owl-character',
  contributes: [
    contribution(
      LoopAssistantCharacter,
      { id: 'owl', character: owl },
      { id: 'owl' },
    ),
  ],
});

const turn = signal<ChatTurnSnapshot>({ id: 0, status: 'idle' });

const TurnPlugin = definePlugin({
  name: 'test-chat-turn',
  contributes: [
    contribution(
      LoopChatTurn,
      { id: 'turn', turn, conversation: signal([]) },
      { id: 'turn' },
    ),
  ],
});

function Harness({
  plugins,
}: {
  plugins: Parameters<typeof buildReactorFromPlugins>[0];
}) {
  const reactor = React.useMemo(
    () => buildReactorFromPlugins(plugins),
    [plugins],
  );
  useReactor(reactor);
  return (
    <ThemeProvider>
      <ReactorSlot slot={LoopSlots.root} />
    </ThemeProvider>
  );
}

const mounted: { root: ReturnType<typeof createRoot>; el: HTMLElement }[] = [];

async function mount(plugins: Parameters<typeof buildReactorFromPlugins>[0]) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(<Harness plugins={plugins} />);
  });
  mounted.push({ root, el });
  return el;
}

afterEach(async () => {
  for (const { root, el } of mounted.splice(0)) {
    await act(async () => root.unmount());
    el.remove();
  }
  window.localStorage.removeItem(ASSISTANT_AWAY_KEY);
  window.sessionStorage.removeItem(ASSISTANT_AWAY_KEY);
  turn.value = { id: 0, status: 'idle' };
});

describe('the character the workspace draws', () => {
  it("is the application's, over the person's, over the paper clip", async () => {
    const reactor = buildReactorFromPlugins([
      AssistantCharactersPlugin,
      OwlPlugin,
    ]);
    await reactor.start();
    const all = assistantCharactersOf(reactor);
    expect(assistantCharacterFor(all, {})).toMatchObject({
      id: 'paperclip',
      saidBy: 'default',
    });
    expect(assistantCharacterFor(all, { person: 'cat' })).toMatchObject({
      id: 'cat',
      saidBy: 'person',
    });
    expect(
      assistantCharacterFor(all, { app: 'owl', person: 'cat' }),
    ).toMatchObject({ id: 'owl', saidBy: 'app', character: owl });
  });

  it('is never replaced when nothing enabled contributes it: it is said', () => {
    expect(
      assistantCharacterFor([{ id: 'owl', character: owl }], { app: 'robot' }),
    ).toEqual({
      saidBy: 'app',
      problem:
        'This application names the character “robot”, which nothing enabled here draws; the characters are owl.',
    });
    expect(assistantCharacterFor([], { person: 'owl' })).toMatchObject({
      saidBy: 'person',
      problem: expect.stringContaining('Your settings name'),
    });
    expect(assistantCharacterFor([], {})).toMatchObject({
      saidBy: 'default',
      problem: expect.stringContaining('the characters are none'),
    });
  });

  it('is drawn over the workspace, from a plugin as from Datalayer', async () => {
    const el = await mount([
      AssistantCharactersPlugin,
      OwlPlugin,
      TurnPlugin,
      configurePlugin(LoopAssistantPlugin, { app: 'owl', person: 'cat' }),
    ]);
    const talk = el.querySelector('button[aria-label^="Talk to"]');
    expect(talk?.getAttribute('aria-label')).toBe('Talk to Owl');
    expect(
      el
        .querySelector('[data-assistant-state]')
        ?.getAttribute('data-assistant-state'),
    ).toBe('greeting');
  });

  it("follows the person's choice when the application names none", async () => {
    const el = await mount([
      AssistantCharactersPlugin,
      TurnPlugin,
      configurePlugin(LoopAssistantPlugin, { person: 'wizard' }),
    ]);
    expect(
      el
        .querySelector('button[aria-label^="Talk to"]')
        ?.getAttribute('aria-label'),
    ).toBe('Talk to Wizard');
  });

  it('says an id no enabled plugin contributes, where it would stand', async () => {
    const el = await mount([
      AssistantCharactersPlugin,
      TurnPlugin,
      configurePlugin(LoopAssistantPlugin, { app: 'owl' }),
    ]);
    expect(el.querySelector('[data-assistant-state]')).toBeNull();
    expect(
      el.querySelector('[data-assistant-problem="app"]')?.textContent,
    ).toContain('This application names the character “owl”');
  });

  it('stays away when the person sent it away for good', async () => {
    window.localStorage.setItem(ASSISTANT_AWAY_KEY, 'always');
    const el = await mount([
      AssistantCharactersPlugin,
      TurnPlugin,
      LoopAssistantPlugin,
    ]);
    expect(el.querySelector('[data-assistant-state]')).toBeNull();
  });
});

describe("the character acts out the chat's turn", () => {
  it('thinks, works, speaks and idles as the turn goes', () => {
    expect(assistantStateOfTurn({ id: 1, status: 'thinking' })).toBe(
      'thinking',
    );
    expect(
      assistantStateOfTurn({
        id: 1,
        status: 'streaming',
        activity: 'Adding a cell…',
      }),
    ).toBe('working');
    expect(
      assistantStateOfTurn({ id: 1, status: 'streaming', assistant: 'Hi' }),
    ).toBe('speaking');
    expect(assistantStateOfTurn({ id: 1, status: 'done' })).toBe('idle');
    expect(
      assistantStateOfTurn({ id: 1, status: 'done' }, { arriving: true }),
    ).toBe('greeting');
  });

  it('says the newest words in its balloon while the conversation is out of sight', async () => {
    const el = await mount([
      AssistantCharactersPlugin,
      TurnPlugin,
      LoopAssistantPlugin,
    ]);
    await act(async () => {
      turn.value = {
        id: 2,
        status: 'streaming',
        assistant: 'The **report** is ready.',
      };
    });
    expect(
      el
        .querySelector('[data-assistant-state]')
        ?.getAttribute('data-assistant-state'),
    ).toBe('greeting');
    expect(document.body.textContent).toContain('The report is ready.');
  });
});
