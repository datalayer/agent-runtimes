/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A coding agent's diff and terminal are drawn by the web chat where its
 * tool results carry them (SHIELD §4.3, SH-16): the result's
 * `_meta["reactor.ui/display"]`, as the runtime sends it over AG-UI, resolved
 * by the embedded display's type whatever the tool is called.
 */

import React, { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildReactorFromPlugins,
  type ReactorPlatform,
} from '@datalayer/reactor';
import { registerReactor } from '@datalayer/reactor/react';
import { DISPLAY_META_KEY } from '@datalayer/reactor/ui';
import { ChatMessageList } from '../../chat/messages/ChatMessageList';
import type { DisplayItem } from '../../types/chat';
import { shieldDisplayFixtures } from '../../portable';
import { createShieldDisplaysPlugin } from '../plugins/shield-displays';

function call(id: string, toolName: string, result: unknown): DisplayItem {
  return {
    id,
    type: 'tool-call',
    toolCallId: id,
    toolName,
    args: {},
    result,
    status: 'complete',
  } as DisplayItem;
}

/** What the runtime sends for a harness's tool result (transports/agui_stream.py). */
const sent = (display: Record<string, unknown>, status = 'completed') => ({
  result: null,
  status,
  display: [],
  _meta: { [DISPLAY_META_KEY]: display },
});

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(reactor: ReactorPlatform, items: DisplayItem[]) {
  reactor.start();
  registerReactor(reactor);
  container = document.createElement('div');
  document.body.appendChild(container);
  const created = createRoot(container);
  root = created;
  await act(async () => {
    created.render(
      <ChatMessageList
        displayItems={items}
        isLoading={false}
        isStreaming={false}
        showLoadingIndicator={false}
        hideMessagesAfterToolUI={false}
        avatarConfig={{
          userAvatar: 'me',
          assistantAvatar: 'ai',
          showAvatars: false,
          avatarSize: 24,
          userAvatarBg: 'accent.subtle',
          assistantAvatarBg: 'accent.emphasis',
        }}
        padding={3}
        emptyContent={null}
        messagesEndRef={createRef<HTMLDivElement>() as never}
        onRespond={async () => {}}
      />,
    );
  });
}

beforeEach(() => {
  registerReactor(null);
});

afterEach(() => {
  const mounted = root;
  if (mounted) {
    act(() => mounted.unmount());
    root = null;
  }
  container?.remove();
  registerReactor(null);
});

const row = (tool: string) =>
  container.querySelector<HTMLElement>(`[data-chat-tool-row="${tool}"]`);

describe('a coding agent’s displays in the chat (SH-16)', () => {
  it('draws the diff as a unified diff in the file’s language, whatever the tool is called', async () => {
    const reactor = buildReactorFromPlugins([
      createShieldDisplaysPlugin() as never,
    ]);
    const { diff } = shieldDisplayFixtures();
    await mount(reactor, [call('c1', 'Edit hello.py', sent(diff))]);
    const drawn = row('Edit hello.py')?.querySelector<HTMLElement>(
      '[data-shield-display="diff"]',
    );
    expect(drawn).not.toBeNull();
    expect(drawn?.dataset.language).toBe('python');
    expect(drawn?.textContent).toContain('Changed hello.py (+2 −1 lines)');
    const lines = Array.from(
      drawn?.querySelectorAll<HTMLElement>('[data-diff-line]') ?? [],
    ).map(line => [line.dataset.diffLine, line.textContent]);
    expect(lines).toEqual([
      ['remove', '-print("hi")'],
      ['add', '+def hello():'],
      ['add', '+    print("hi, shield")'],
    ]);
  });

  it('draws the terminal with the output kept after release, and how it ended', async () => {
    const reactor = buildReactorFromPlugins([
      createShieldDisplaysPlugin() as never,
    ]);
    const { terminal } = shieldDisplayFixtures();
    const failed = {
      ...terminal,
      id: 'c4-terminal',
      text: 'Ran `make`: exit 2',
      data: {
        ...(terminal.data as object),
        command: 'make',
        exit_code: 2,
        output: 'no rule\n',
      },
    };
    await mount(reactor, [
      call('c3', 'Run pytest', sent(terminal)),
      call('c4', 'Run make', sent(failed, 'failed')),
    ]);
    const ok = row('Run pytest')?.querySelector<HTMLElement>(
      '[data-shield-display="terminal"]',
    );
    expect(ok?.dataset.exitCode).toBe('0');
    expect(ok?.textContent).toContain('$ pytest -q');
    expect(ok?.textContent).toContain('3 passed in 0.12s');
    const broken = row('Run make')?.querySelector<HTMLElement>(
      '[data-shield-display="terminal"]',
    );
    expect(broken?.dataset.exitCode).toBe('2');
    expect(broken?.textContent).toContain('Ran `make`: exit 2');
    expect(broken?.textContent).toContain('no rule');
  });

  it('keeps the chat’s own row for a display that does not read', async () => {
    const reactor = buildReactorFromPlugins([
      createShieldDisplaysPlugin() as never,
    ]);
    const { diff } = shieldDisplayFixtures();
    await mount(reactor, [
      call('c5', 'Edit x', sent({ ...diff, data: { path: 'x' } })),
    ]);
    expect(row('Edit x')).not.toBeNull();
    expect(row('Edit x')?.querySelector('[data-shield-display]')).toBeNull();
    expect(row('Edit x')?.textContent).not.toBe('');
  });
});
