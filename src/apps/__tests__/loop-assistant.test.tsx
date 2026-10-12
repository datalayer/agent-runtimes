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
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  LoopAssistantMenu,
  LoopChatTurn,
  LoopSlots,
  type ChatTurnSnapshot,
  type LoopChatViewModes,
  type LoopWorkspaceContext,
} from '../core';
import {
  ASSISTANT_AWAY_KEY,
  ASSISTANT_WORDS,
} from '../../chat/assistant/state';
import type { PresenceState } from '../../chat/presence/presenceStatus';
import { iamStore } from '@datalayer/core/lib/state/substates/IAMState';

const seen = vi.hoisted(() => ({
  approved: [] as string[],
  rejected: [] as string[],
  waiting: [] as Array<Record<string, unknown>>,
}));

// The approvals path U-19 answers on (ai-agents `/ws`), as the rules card's
// tests stand it in.
vi.mock('../../hooks/useToolApprovals', () => ({
  useToolApprovalsQuery: () => ({
    data: { approvals: seen.waiting, total: seen.waiting.length },
  }),
  useApproveToolRequest: () => ({
    isPending: false,
    connectionState: 'connected',
    mutate: ({ id }: { id: string }) => seen.approved.push(id),
  }),
  useRejectToolRequest: () => ({
    isPending: false,
    connectionState: 'connected',
    mutate: ({ id }: { id: string }) => seen.rejected.push(id),
  }),
}));

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
const presence = signal<PresenceState>('idle');

const TurnPlugin = definePlugin({
  name: 'test-chat-turn',
  contributes: [
    contribution(
      LoopChatTurn,
      { id: 'turn', turn, conversation: signal([]), presence },
      { id: 'turn' },
    ),
  ],
});

function Harness({
  plugins,
  workspace,
}: {
  plugins: Parameters<typeof buildReactorFromPlugins>[0];
  workspace?: Partial<LoopWorkspaceContext>;
}) {
  const reactor = React.useMemo(
    () => buildReactorFromPlugins(plugins),
    [plugins],
  );
  useReactor(reactor);
  return (
    <ThemeProvider>
      <ReactorSlot
        slot={LoopSlots.root}
        props={workspace ? { workspace } : undefined}
      />
    </ThemeProvider>
  );
}

const mounted: { root: ReturnType<typeof createRoot>; el: HTMLElement }[] = [];

async function mount(
  plugins: Parameters<typeof buildReactorFromPlugins>[0],
  workspace?: Partial<LoopWorkspaceContext>,
) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(<Harness plugins={plugins} workspace={workspace} />);
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
  presence.value = 'idle';
  seen.waiting.splice(0);
  seen.approved.splice(0);
  seen.rejected.splice(0);
  iamStore.setState({ token: undefined } as never);
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
  it('thinks, works, speaks and idles as the chat says, and speaks as the turn goes', () => {
    expect(
      assistantStateOfTurn({ id: 1, status: 'thinking' }, 'thinking'),
    ).toBe('thinking');
    expect(
      assistantStateOfTurn(
        {
          id: 1,
          status: 'streaming',
          activity: 'Adding a cell…',
        },
        'working',
      ),
    ).toBe('working');
    expect(
      assistantStateOfTurn(
        { id: 1, status: 'streaming', assistant: 'Hi' },
        'thinking',
      ),
    ).toBe('speaking');
    expect(assistantStateOfTurn({ id: 1, status: 'done' }, 'idle')).toBe(
      'idle',
    );
    expect(
      assistantStateOfTurn({ id: 1, status: 'done' }, 'idle', {
        arriving: true,
      }),
    ).toBe('greeting');
    expect(assistantStateOfTurn({ id: 1, status: 'done' }, 'waiting')).toBe(
      'waiting',
    );
  });

  it('dozes while its deployment is paused, arriving or not, and says why', async () => {
    expect(
      assistantStateOfTurn({ id: 1, status: 'streaming' }, 'paused', {
        arriving: true,
      }),
    ).toBe('paused');
    expect(
      assistantStateOfTurn({ id: 1, status: 'done' }, 'paused', {
        leaving: true,
      }),
    ).toBe('goodbye');
    presence.value = 'paused';
    const el = await mount([
      AssistantCharactersPlugin,
      TurnPlugin,
      LoopAssistantPlugin,
    ]);
    const stage = el.querySelector('[data-assistant-state]') as HTMLElement;
    expect(stage.getAttribute('data-assistant-state')).toBe('paused');
    await act(async () => {
      stage.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(document.body.textContent).toContain(ASSISTANT_WORDS.paused);
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

describe('the balloon, as the configuration says (T-23)', () => {
  it('says what the agent does while a tool runs, and is current when asked', async () => {
    const el = await mount([
      AssistantCharactersPlugin,
      TurnPlugin,
      configurePlugin(LoopAssistantPlugin, { balloon: 'current' }),
    ]);
    expect(
      el
        .querySelector('[data-assistant-state]')
        ?.getAttribute('data-assistant-balloon'),
    ).toBe('current');
    await act(async () => {
      turn.value = {
        id: 3,
        status: 'streaming',
        activity: 'Analyst is adding a cell…',
      };
    });
    const balloon = el.querySelector('[data-speech-balloon]');
    expect(balloon?.getAttribute('data-balloon-display')).toBe('current');
    // What it does, in its own words: the agent's message, drawn by the
    // chat's own components.
    expect(
      balloon?.querySelector(
        '[data-balloon-tool] [data-chat-message="assistant"]',
      )?.textContent,
    ).toBe('Analyst is adding a cell…');
    expect(balloon?.querySelector('[data-balloon-announce]')?.textContent).toBe(
      'Analyst is adding a cell…',
    );
    await act(async () => {
      turn.value = { id: 3, status: 'streaming', assistant: 'One cell added.' };
    });
    expect(el.querySelector('[data-balloon-current-text]')?.textContent).toBe(
      'One cell added.',
    );
  });
});

describe('an approval waits in the balloon (T-23)', () => {
  const asked = {
    id: 'ap-1',
    agent_id: 'web-research',
    tool_name: 'send_email',
    tool_args: { _rule: 'Send anything: ask me first' },
    status: 'pending',
  };

  it('is answered there with Approve or Deny, on the approvals path', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    seen.waiting.push(asked, { ...asked, id: 'ap-2' });
    presence.value = 'waiting';
    const el = await mount([
      AssistantCharactersPlugin,
      TurnPlugin,
      configurePlugin(LoopAssistantPlugin, { appId: 'web-research' }),
    ]);
    const balloon = el.querySelector('[data-balloon-approval]') as HTMLElement;
    expect(balloon.getAttribute('data-balloon-approval')).toBe('ap-1');
    expect(balloon.textContent).toContain('send_email');
    expect(balloon.textContent).toContain('Send anything: ask me first');
    expect(balloon.textContent).toContain('1 more');
    const button = (label: string) =>
      Array.from(balloon.querySelectorAll('button')).find(
        b => b.textContent === label,
      ) as HTMLButtonElement;
    await act(async () => button(ASSISTANT_WORDS.approve).click());
    await act(async () => button(ASSISTANT_WORDS.deny).click());
    expect(seen.approved).toEqual(['ap-1']);
    expect(seen.rejected).toEqual(['ap-1']);
  });

  it("is not another application's, nor read signed out", async () => {
    seen.waiting.push({ ...asked, agent_id: 'other-app' });
    iamStore.setState({ token: 'jwt' } as never);
    presence.value = 'waiting';
    const el = await mount([
      AssistantCharactersPlugin,
      TurnPlugin,
      configurePlugin(LoopAssistantPlugin, { appId: 'web-research' }),
    ]);
    expect(el.querySelector('[data-balloon-approval]')).toBeNull();
    expect(document.body.textContent).toContain(ASSISTANT_WORDS.waiting);
  });
});

describe("the Loop assistant's menu", () => {
  it("lists the plugins' entries, and switches the balloon's display", async () => {
    const chosen = vi.fn();
    const MenuPlugin = definePlugin({
      name: 'test-assistant-menu',
      contributes: [
        contribution(
          LoopAssistantMenu,
          { id: 'mine', label: 'Mine', onSelect: chosen },
          { id: 'mine' },
        ),
      ],
    });
    const el = await mount([
      AssistantCharactersPlugin,
      TurnPlugin,
      MenuPlugin,
      configurePlugin(LoopAssistantPlugin, { balloon: 'current' }),
    ]);
    const open = async () => {
      await act(async () => {
        el.querySelector('[data-assistant-figure]')!.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
        );
      });
    };
    const choose = async (id: string) => {
      await act(async () => {
        document
          .querySelector<HTMLElement>(`[data-assistant-menu-item="${id}"]`)
          ?.click();
      });
    };
    await open();
    await choose('mine');
    expect(chosen).toHaveBeenCalled();
    expect(
      el
        .querySelector('[data-assistant-balloon]')
        ?.getAttribute('data-assistant-balloon'),
    ).toBe('current');
    await open();
    await choose('balloon-history');
    expect(
      el
        .querySelector('[data-assistant-balloon]')
        ?.getAttribute('data-assistant-balloon'),
    ).toBe('history');
    await open();
    await choose('balloon-current');
    expect(
      el
        .querySelector('[data-assistant-balloon]')
        ?.getAttribute('data-assistant-balloon'),
    ).toBe('current');
  });
});

describe("the chat's view, where the workspace's host keeps it", () => {
  const views = (
    value: LoopChatViewModes['value'],
    onChange: LoopChatViewModes['onChange'] = () => {},
  ): Partial<LoopWorkspaceContext> => ({
    chatViewModes: { value, onChange, offered: ['assistant', 'sidebar'] },
  });
  /** The workspace's composer, its top `top` pixels from the window's top. */
  const composerAt = (top: number) => {
    const composer = document.createElement('div');
    composer.setAttribute('data-chat-composer', '');
    composer.getBoundingClientRect = () =>
      ({ top, width: 600, height: 80 }) as DOMRect;
    document.body.appendChild(composer);
    return composer;
  };
  const plugins = [AssistantCharactersPlugin, TurnPlugin, LoopAssistantPlugin];
  afterEach(() => {
    document
      .querySelectorAll('[data-chat-composer]')
      .forEach(composer => composer.remove());
  });

  it('draws no character in the sidebar view, from the first paint', async () => {
    composerAt(window.innerHeight - 100);
    const el = await mount(plugins, views('sidebar'));
    expect(el.querySelector('[data-assistant-figure]')).toBeNull();
  });

  it('waits for the composer, then stands above it', async () => {
    const el = await mount(plugins, views('assistant'));
    // No composer yet: nothing stands where the composer will come.
    expect(el.querySelector('[data-assistant-figure]')).toBeNull();
    composerAt(window.innerHeight - 100);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 450));
    });
    expect(el.querySelector('[data-assistant-figure]')).not.toBeNull();
    const stage = el.querySelector<HTMLElement>('[data-assistant-state]')!;
    expect(getComputedStyle(stage).bottom).toBe('112px');
  });

  it('offers the views in its menu, the current one checked', async () => {
    const picked = vi.fn();
    composerAt(window.innerHeight - 100);
    const el = await mount(plugins, views('assistant', picked));
    await act(async () => {
      el.querySelector('[data-assistant-figure]')!.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      );
    });
    const item = (id: string) =>
      document.querySelector<HTMLElement>(`[data-assistant-menu-item="${id}"]`);
    expect(item('view-assistant')).not.toBeNull();
    expect(item('view-floating')).toBeNull();
    await act(async () => {
      item('view-sidebar')?.click();
    });
    expect(picked).toHaveBeenCalledWith('sidebar');
  });
});
