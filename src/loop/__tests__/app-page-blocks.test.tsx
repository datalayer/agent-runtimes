/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Datalayer's own blocks on an application's page (LOOP C-18, R-01, E-01):
 * a Chat block draws the conversation the application runs as and sends
 * through it, and a File upload on a widget's page hands its agent the file.
 * The page is the plugin's own `AppPage`, fed by the chat's turn feed, its
 * messages going out through the chat's own send.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import {
  buildReactorFromPlugins,
  contribution,
  definePlugin,
} from '@datalayer/reactor';
import { useReactor } from '@datalayer/reactor/react';
import { APP_CATALOGUE } from '../../specs/apps';
import type { AppSpec } from '../../types/agentspecs';
import { LoopChatTurn, type LoopWorkspaceContext } from '../core';
import { emptyAppspec } from '../apps/appspec';
import { createTurnFeed } from '../plugins/chat/turnState';
import { AppPage } from '../plugins/app-page';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Node = { id: string; component: string; [key: string]: unknown };

const surfaceOf = (components: Node[]) => ({
  protocol: 'a2ui/v0.9' as const,
  components,
  composedBy: 'developer' as const,
  composedAt: '',
});

/** A page drawn as AppRenderer draws it: the chat's turn feed, its controls. */
async function drawPage(app: AppSpec) {
  const feed = createTurnFeed();
  const send = vi.fn();
  const plugin = definePlugin({
    name: 'test-chat-turn',
    contributes: [
      contribution(
        LoopChatTurn,
        { id: 'turn', turn: feed.turn, conversation: feed.conversation },
        { id: 'turn' },
      ),
    ],
  });
  const workspace = {
    viewControls: { send },
    prompts: { submit: vi.fn() },
  } as unknown as LoopWorkspaceContext;
  function Harness() {
    const reactor = React.useMemo(() => buildReactorFromPlugins([plugin]), []);
    useReactor(reactor);
    return (
      <ThemeProvider>
        <AppPage app={app} workspace={workspace} />
      </ThemeProvider>
    );
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(<Harness />));
  // The surface's first render shows its loading state; content follows.
  await act(async () => undefined);
  return { container, feed, send };
}

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

afterEach(async () => {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
});

/** Types into a React-controlled field as a person would. */
async function type(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element),
    'value',
  )!.set!;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('a Chat block on a chat application’s page', () => {
  const app: AppSpec = {
    ...emptyAppspec('chat'),
    id: 'support',
    name: 'Support',
    agent: 'example-simple:0.0.1',
    interface: {
      ...emptyAppspec('chat').interface,
      layout: 'page',
      surface: surfaceOf([
        { id: 'root', component: 'Column', children: ['chat'] },
        {
          id: 'chat',
          component: 'Chat',
          welcome: 'Ask about your account.',
          messages: { path: '/messages' },
          message: { path: '/draft' },
          action: { event: { name: 'send' } },
        },
      ]),
    },
  };

  it('draws the conversation the application runs as, and sends through it', async () => {
    const { container, feed, send } = await drawPage(app);
    expect(container.textContent).toContain('Ask about your account.');
    const at = new Date(0);
    await act(async () =>
      feed.items([
        {
          id: 'u',
          role: 'user',
          content: 'Where is my invoice?',
          createdAt: at,
        },
        {
          id: 'a',
          role: 'assistant',
          content: 'Under Billing, in Settings.',
          createdAt: at,
        },
      ]),
    );
    expect(container.textContent).toContain('Where is my invoice?');
    expect(container.textContent).toContain('Under Billing, in Settings.');
    expect(container.textContent).not.toContain('Ask about your account.');

    const composer = container.querySelector(
      '[data-testid="a2ui-chat"] textarea',
    ) as HTMLTextAreaElement;
    await type(composer, 'And last month’s?');
    await act(async () => {
      composer.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
    // The chat's own send: the conversation the page shows, not a second one.
    expect(send).toHaveBeenCalledWith('And last month’s?');
    expect(send).toHaveBeenCalledTimes(1);

    // Started over: the welcome again.
    await act(async () => feed.items([]));
    expect(container.textContent).toContain('Ask about your account.');
  });
});

describe('a File upload on a widget’s page', () => {
  const report = APP_CATALOGUE['report-from-a-file'];
  const app: AppSpec = {
    ...report,
    interface: {
      ...report.interface,
      surface: surfaceOf([
        ...report.interface.surface!.components.map(node =>
          node.id === 'inputs-body'
            ? { ...node, children: ['file', 'report', 'question'] }
            : (node as Node),
        ),
        {
          id: 'file',
          component: 'FileUpload',
          label: 'The CSV',
          accept: ['.csv'],
          files: { path: '/files' },
        },
      ]),
    },
  };

  it('hands the agent a CSV chosen, with the inputs, when it is run', async () => {
    const { container, send } = await drawPage(app);
    const input = container.querySelector(
      '[data-testid="a2ui-fileupload"] input[type="file"]',
    ) as HTMLInputElement;
    expect(input.accept).toBe('.csv');
    Object.defineProperty(input, 'files', {
      value: [
        new File(['region,orders\nNorth,12\n'], 'orders.csv', {
          type: 'text/csv',
        }),
      ],
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // FileReader reports on a later task.
    await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
    expect(container.textContent).toContain('Given: orders.csv');
    expect(send).not.toHaveBeenCalled();

    const run = [...container.querySelectorAll('button')].find(
      button => button.textContent?.trim() === 'Choose a file and run',
    )!;
    await act(async () => run.click());
    expect(send).toHaveBeenCalledWith(
      'Report: Summary\n\nThe file orders.csv (text/csv):\n```\nregion,orders\nNorth,12\n```',
    );
  });

  it('runs at once on the file when its action is upload', async () => {
    const onUpload: AppSpec = {
      ...app,
      interface: {
        ...app.interface,
        surface: surfaceOf(
          app.interface.surface!.components.map(node =>
            node.id === 'file'
              ? {
                  ...(node as Node),
                  action: {
                    event: {
                      name: 'upload',
                      context: { files: { path: '/files' } },
                    },
                  },
                }
              : (node as Node),
          ),
        ),
      },
    };
    const { container, send } = await drawPage(onUpload);
    const input = container.querySelector(
      '[data-testid="a2ui-fileupload"] input[type="file"]',
    ) as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['a,b\n1,2\n'], 'tiny.csv', { type: 'text/csv' })],
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toContain(
      'The file tiny.csv (text/csv):\n```\na,b\n1,2\n```',
    );
  });
});
