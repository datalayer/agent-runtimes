/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Tool calls are drawn by the plugins that claim them (Reactor UI RU-1).
 *
 * The chat kept one tool-result renderer and the later plugin won, so the
 * A2UI surface plugin had to draw the PAP sign-in card too, and a plugin that
 * returned nothing for a tool it did not own hid that tool. Now each plugin
 * binds its own tools and contributes its own renderer: two plugins each draw
 * their own tool, neither silences the other, and a tool nobody claims keeps
 * the chat's own row.
 */

import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildReactorFromPlugins,
  contribution,
  definePlugin,
  type ReactorPlatform,
} from '@datalayer/reactor';
import { registerReactor } from '@datalayer/reactor/react';
import {
  DISPLAY_META_KEY,
  Renderers,
  ToolBindings,
} from '@datalayer/reactor/ui';
import {
  defineRenderer,
  type RendererProps,
} from '@datalayer/reactor/ui/react';
import { ChatMessageList } from '../../chat/messages/ChatMessageList';
import type { DisplayItem, ToolCallRenderContext } from '../../types/chat';
import {
  PAP_SIGN_IN_TYPE,
  createPapSignInPlugin,
} from '../plugins/pap-sign-in';

const WEATHER_TYPE = 'application/vnd.tests.weather+json';

function WeatherCard({ context }: RendererProps<ToolCallRenderContext>) {
  return <p data-testid="weather">Weather for {String(context?.args.city)}</p>;
}

const WeatherPlugin = definePlugin({
  name: '@tests/weather',
  contributes: [
    contribution(
      Renderers,
      defineRenderer({ type: WEATHER_TYPE, component: WeatherCard }),
    ),
    contribution(ToolBindings, { tool: 'get_weather', type: WEATHER_TYPE }),
  ],
});

const SIGN_IN = {
  status: 'waiting_for_the_person',
  mode: 'device',
  open: 'https://manzanita.example/device?user_code=WDJB-MJHT',
  code: 'WDJB-MJHT',
  expires_at: '2026-10-11T12:15:00+00:00',
};

function call(
  id: string,
  toolName: string,
  result: unknown,
  args: Record<string, unknown> = {},
): DisplayItem {
  return {
    id,
    type: 'tool-call',
    toolCallId: id,
    toolName,
    args,
    result,
    status: 'complete',
  } as DisplayItem;
}

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

describe('tool renderers from plugins', () => {
  it('draws each plugin’s own tool, and neither silences the other', async () => {
    const reactor = buildReactorFromPlugins([
      createPapSignInPlugin() as never,
      WeatherPlugin,
    ]);
    await mount(reactor, [
      call('c1', 'datalayer__pap_sign_in', SIGN_IN),
      call('c2', 'get_weather', { celsius: 9 }, { city: 'Ghent' }),
      call('c3', 'read_cell', 'x = 1'),
    ]);

    expect(row('datalayer__pap_sign_in')?.textContent).toContain(
      'Sign in at manzanita.example',
    );
    expect(row('datalayer__pap_sign_in')?.textContent).toContain('WDJB-MJHT');
    expect(row('get_weather')?.textContent).toBe('Weather for Ghent');
    // Nobody claims it: the chat's own row, with the tool's name.
    expect(row('read_cell')).not.toBeNull();
    expect(row('read_cell')?.textContent).not.toBe('');
  });

  it('keeps the chat’s row for a tool whose plugin is disabled', async () => {
    const reactor = buildReactorFromPlugins([WeatherPlugin]);
    await mount(reactor, [
      call('c2', 'get_weather', { celsius: 9 }, { city: 'Ghent' }),
    ]);
    expect(row('get_weather')?.textContent).toBe('Weather for Ghent');

    await act(async () => reactor.disable('@tests/weather'));
    expect(row('get_weather')?.textContent).not.toContain('Weather for Ghent');
    expect(row('get_weather')?.textContent).not.toBe('');
  });

  it('draws a display a result embeds, whatever the tool is called', async () => {
    const reactor = buildReactorFromPlugins([createPapSignInPlugin() as never]);
    const embedded = {
      content: [{ type: 'text', text: 'Sign in at manzanita.example' }],
      _meta: {
        [DISPLAY_META_KEY]: {
          type: PAP_SIGN_IN_TYPE,
          version: 1,
          id: 's1',
          text: 'Sign in at manzanita.example',
          data: {
            mode: 'direct',
            open: 'https://manzanita.example/authorize?x=1',
          },
        },
      },
    };
    await mount(reactor, [call('c4', 'company_sign_in', embedded)]);
    expect(row('company_sign_in')?.textContent).toContain(
      'Sign in at manzanita.example',
    );
    expect(
      row('company_sign_in')?.querySelector('a[href^="https://manzanita"]'),
    ).not.toBeNull();
  });

  it('draws every tool its own way without a platform', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const created = createRoot(container);
    root = created;
    await act(async () => {
      created.render(
        <ChatMessageList
          displayItems={[call('c2', 'get_weather', { celsius: 9 })]}
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
    expect(row('get_weather')).not.toBeNull();
    expect(row('get_weather')?.textContent).not.toContain('Weather for');
  });
});

// React's act environment, for the renders above.
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
