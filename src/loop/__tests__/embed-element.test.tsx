/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `<datalayer-app>` and `AppEmbed` in the DOM (LOOP D-07, D-08, D-09, D-11,
 * T-13): the application drawn in the element's shadow root, in its mode, in
 * its theme; the floating modes as `ChatFloating`'s chrome holding the
 * application as `AppRenderer` draws it (R-01), the assistant with the
 * application's character; a decision, or an application named without a
 * token, framed as before.
 *
 * `ChatFloating`, `AppRenderer` and the runtime hook are stood in for: what
 * is tested is what the embed hands them.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iamStore } from '@datalayer/core/lib/state/substates/IAMState';
import { contribution, definePlugin } from '@datalayer/reactor';
import { loopAccentStyles } from '@datalayer/primer-addons';
import { emptyAppspec, dumpAppspec } from '../apps/appspec';
import { LoopAssistantCharacter } from '../core';
import { ASSISTANT_CHARACTERS } from '../../chat/assistant/characters';
import type { AppSpec } from '../../types/agentspecs';

const seen = vi.hoisted(() => ({
  floating: [] as Array<Record<string, any>>,
  renderer: [] as Array<Record<string, any>>,
  runtimes: [] as Array<Record<string, any>>,
}));

vi.mock('../../chat/ChatFloating', () => ({
  ChatFloating: (props: Record<string, any>) => {
    seen.floating.push(props);
    return <div data-testid="floating" data-view={props.defaultViewMode} />;
  },
}));

vi.mock('../apps/AppRenderer', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  AppRenderer: (props: Record<string, any>) => {
    seen.renderer.push(props);
    return <div data-testid="renderer" />;
  },
}));

vi.mock('../../hooks/useAgentRuntimes', () => ({
  useAgentRuntimes: (options: Record<string, any>) => {
    seen.runtimes.push(options);
    return {
      runtime: options.autoStart
        ? { agentBaseUrl: 'https://r1.example/agent-runtimes/pod' }
        : null,
      error: null,
    };
  },
}));

import { AppEmbed, AppFloating } from '../embed/AppEmbed';
import {
  appspecOfText,
  defineDatalayerAppElement,
  frameInLanguage,
  frameSrcOf,
  readEmbeddedApp,
} from '../embed/element';

function chatApp(change: (app: AppSpec) => void = () => undefined): AppSpec {
  const app = emptyAppspec('chat');
  app.id = 'support-desk';
  app.name = 'Support Desk';
  app.agent = 'support-agent';
  app.emoji = '🦊';
  app.interface.welcome = 'Ask me about your order.';
  app.interface.starters = [
    { label: 'Where is it?', message: 'Where is my order?' },
  ];
  change(app);
  return app;
}

const settle = async () => {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

beforeEach(() => {
  seen.floating.length = 0;
  seen.renderer.length = 0;
  seen.runtimes.length = 0;
});

afterEach(() => {
  iamStore.setState({ token: undefined } as never);
  // Nothing of an embed's theme is ever written on the host's page.
  expect(document.body.style.getPropertyValue('--loop-accent')).toBe('');
  expect(document.body.getAttribute('data-color-mode')).toBeNull();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

/**
 * What the floating window holds: the renderer's element, and its props —
 * beside what the session says when it resumes (D-13), in one fragment.
 */
const held = (): Record<string, any> => {
  const body = seen.floating.at(-1)!.conversation.body;
  const children = [body.props.children].flat();
  const renderer = children.find(
    (child: any) => child?.props && 'app' in child.props,
  );
  return (renderer ?? body).props;
};

async function render(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  await settle();
  return { container, root };
}

describe('AppEmbed, the React component', () => {
  it('draws the assistant with the application’s character, name, welcome and starters', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    const app = chatApp(a => {
      a.interface.assistant = 'wizard';
      a.deployment = { embedded: { mode: 'assistant', origins: [] } };
    });
    const { root } = await render(<AppEmbed app={app} />);
    const props = seen.floating.at(-1)!;
    expect(props.defaultViewMode).toBe('assistant');
    expect(props.assistantCharacter.id).toBe('wizard');
    expect(props.title).toBe('Support Desk');
    expect(props.description).toBe('Ask me about your order.');
    // The application itself, drawn by the renderer in the window: its
    // starters, its theme and its preset are the renderer's.
    expect(held().app).toBe(app);
    expect(held().hideChatHeader).toBe(true);
    expect(held().autoFocusPrompt).toBe(false);
    await act(async () => root.unmount());
  });

  it('draws a character the host’s plugins contribute, and says one nothing contributes', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    const owl = { ...ASSISTANT_CHARACTERS[0], id: 'owl', name: 'Owl' };
    const OwlPlugin = definePlugin({
      name: 'test-owl',
      contributes: [
        contribution(
          LoopAssistantCharacter,
          { id: 'owl', character: owl },
          { id: 'owl' },
        ),
      ],
    });
    const app = chatApp(a => {
      a.interface.assistant = 'owl';
    });
    const plugins = [OwlPlugin];
    const one = await render(
      <AppEmbed app={app} mode="assistant" plugins={plugins} />,
    );
    expect(seen.floating.at(-1)!.assistantCharacter).toBe(owl);
    await act(async () => one.root.unmount());
    seen.floating.length = 0;
    const two = await render(<AppEmbed app={app} mode="assistant" />);
    expect(seen.floating).toHaveLength(0);
    expect(two.container.textContent).toBe(
      'This application names the character “owl”, which nothing enabled here draws; the characters are paperclip, wizard, cat, eyes.',
    );
    await act(async () => two.root.unmount());
  });

  it('draws the paper clip when the application names no character', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    const { root } = await render(
      <AppEmbed app={chatApp()} mode="assistant" />,
    );
    expect(seen.floating.at(-1)!.assistantCharacter.id).toBe('paperclip');
    await act(async () => root.unmount());
  });

  it('carries the accent and the face into the conversation, the host’s over the application’s', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    const app = chatApp(a => {
      a.interface.accent = 'rose';
    });
    const one = await render(<AppEmbed app={app} mode="bubble" />);
    const floating = held().themeOverrides;
    expect(floating.light).toEqual(loopAccentStyles('rose', 'light'));
    expect(floating.dark).toEqual(loopAccentStyles('rose', 'dark'));
    await act(async () => one.root.unmount());
    const two = await render(
      <AppEmbed
        app={app}
        mode="inline"
        accent="violet"
        font="Georgia, serif"
      />,
    );
    const inline = seen.renderer.at(-1)!.themeOverrides;
    expect(inline.light).toMatchObject(loopAccentStyles('violet', 'light'));
    expect(inline.light['--fontStack-sansSerif']).toBe('Georgia, serif');
    await act(async () => two.root.unmount());
  });

  it('draws the conversation in the embed’s mode, not a Datalayer setting', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    const one = await render(
      <AppEmbed app={chatApp()} mode="bubble" colorMode="light" />,
    );
    expect(held().colorMode).toBe('light');
    await act(async () => one.root.unmount());
    const two = await render(
      <AppEmbed app={chatApp()} mode="inline" colorMode="dark" />,
    );
    expect(seen.renderer.at(-1)!.colorMode).toBe('dark');
    await act(async () => two.root.unmount());
  });

  it('floats a bubble as the popup and a panel at the edge', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    const one = await render(<AppEmbed app={chatApp()} mode="bubble" />);
    expect(seen.floating.at(-1)!.defaultViewMode).toBe('floating-small');
    await act(async () => one.root.unmount());
    const two = await render(<AppEmbed app={chatApp()} mode="panel" />);
    expect(seen.floating.at(-1)!.defaultViewMode).toBe('panel');
    await act(async () => two.root.unmount());
  });

  it('runs the application on Datalayer through the renderer, the workspace told to report what it does and says', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    const app = chatApp();
    const instance = { appUid: 'app-1', deploymentUid: 'dep-1', version: 2 };
    const { root } = await render(
      <AppEmbed app={app} mode="bubble" instance={instance} />,
    );
    expect(held()).toMatchObject({ app, target: 'datalayer', instance });
    // Its agent is the renderer's to launch and address (its session
    // endpoint, R-04): the floating chrome launches nothing of its own.
    expect(seen.runtimes).toHaveLength(0);
    // What the workspace reports reaches the chrome: its balloon and blink.
    const conversation = () => seen.floating.at(-1)!.conversation;
    expect(conversation()).toMatchObject({
      presence: 'idle',
      answering: false,
    });
    await act(async () => {
      held().onPresence('working');
      held().onSaying({
        saying: { id: 'm1', text: 'Your order left today.', more: false },
        answering: true,
      });
    });
    expect(conversation()).toMatchObject({
      presence: 'working',
      saying: { id: 'm1', text: 'Your order left today.' },
      answering: true,
    });
    await act(async () => root.unmount());
  });

  it('says why it cannot run on Datalayer for a visitor who is not signed in, and launches nothing', async () => {
    const { root } = await render(
      <AppEmbed app={chatApp()} mode="assistant" />,
    );
    const body = seen.floating.at(-1)!.conversation.body;
    const host = document.createElement('div');
    const shown = createRoot(host);
    await act(async () => shown.render(body));
    expect(host.textContent).toMatch(/embed token \(LOOP D-14\)/);
    expect(seen.renderer).toHaveLength(0);
    expect(seen.runtimes).toHaveLength(0);
    await act(async () => shown.unmount());
    await act(async () => root.unmount());
  });

  it('floats as the character alone for an application’s address, on the visitors’ runtime too (T-21)', async () => {
    const app = chatApp();
    const visitors = { url: 'https://r1.example/visitors', token: 'v' };
    const { root } = await render(
      <AppFloating
        app={app}
        view="assistant"
        colorMode="light"
        themeOverrides={{}}
        instance={{ appUid: 'app-1', deploymentUid: 'dep-1', version: 2 }}
        renderer={{
          pluginsOff: ['canvas'],
          datalayerVisitors: visitors as never,
        }}
      />,
    );
    expect(seen.floating.at(-1)!.defaultViewMode).toBe('assistant');
    // Signed out, a visitor runs on the visitors' runtime: not refused.
    expect(held()).toMatchObject({
      app,
      target: 'datalayer',
      pluginsOff: ['canvas'],
      datalayerVisitors: visitors,
      hideChatHeader: true,
    });
    await act(async () => root.unmount());
  });

  it('runs on the host’s own agent-runtimes server, when it names one', async () => {
    const app = chatApp();
    const { root } = await render(
      <AppEmbed app={app} mode="panel" serverUrl="http://localhost:8765/" />,
    );
    expect(seen.floating.at(-1)!.defaultViewMode).toBe('panel');
    expect(held()).toMatchObject({
      app,
      target: 'local',
      serverUrl: 'http://localhost:8765/',
    });
    await act(async () => root.unmount());
  });

  it('draws an inline application with the renderer, on the host’s server when it names one', async () => {
    const one = await render(<AppEmbed app={chatApp()} mode="inline" />);
    expect(seen.renderer.at(-1)!.target).toBe('datalayer');
    await act(async () => one.root.unmount());
    const two = await render(
      <AppEmbed
        app={chatApp()}
        mode="inline"
        serverUrl="http://localhost:8765"
      />,
    );
    expect(seen.renderer.at(-1)).toMatchObject({
      target: 'local',
      serverUrl: 'http://localhost:8765',
    });
    await act(async () => two.root.unmount());
  });

  it('speaks to the host’s server with the visit’s embed token, and never hands it to a Datalayer runtime (LOOP R-20)', async () => {
    const hosted = await render(
      <AppEmbed
        app={chatApp()}
        mode="inline"
        serverUrl="http://localhost:8765"
        embedToken="embed-token-of-the-visit"
      />,
    );
    expect(seen.renderer.at(-1)).toMatchObject({
      target: 'local',
      embedToken: 'embed-token-of-the-visit',
    });
    await act(async () => hosted.root.unmount());
    const datalayer = await render(
      <AppEmbed
        app={chatApp()}
        mode="inline"
        embedToken="embed-token-of-the-visit"
      />,
    );
    expect(seen.renderer.at(-1)!.target).toBe('datalayer');
    expect(seen.renderer.at(-1)!.embedToken).toBeUndefined();
    await act(async () => datalayer.root.unmount());
  });

  it('wears the application’s accent, or the host’s, and the host’s face', async () => {
    const { container, root } = await render(
      <AppEmbed
        app={chatApp(a => {
          a.interface.accent = 'rose';
        })}
        mode="inline"
        colorMode="light"
        font="Georgia, serif"
      />,
    );
    const themed = container.querySelector(
      '[data-datalayer-theme-scope]',
    ) as HTMLElement;
    expect(themed.style.getPropertyValue('--loop-accent')).toBeTruthy();
    const rose = themed.style.getPropertyValue('--loop-accent');
    expect(themed.style.getPropertyValue('--fontStack-sansSerif')).toBe(
      'Georgia, serif',
    );
    await act(async () => root.unmount());
    const other = await render(
      <AppEmbed
        app={chatApp()}
        mode="inline"
        accent="violet"
        colorMode="light"
      />,
    );
    const violet = (
      other.container.querySelector(
        '[data-datalayer-theme-scope]',
      ) as HTMLElement
    ).style.getPropertyValue('--loop-accent');
    expect(violet).not.toBe(rose);
    await act(async () => other.root.unmount());
  });
});

describe('the element', () => {
  const Element = defineDatalayerAppElement({
    scriptUrl: 'https://datalayer.app/embed/datalayer-app.js',
  });

  it('is defined once, as datalayer-app', () => {
    expect(customElements.get('datalayer-app')).toBe(Element);
    expect(defineDatalayerAppElement()).toBe(Element);
  });

  it('takes what the page passes and offers, and tells it what the application said (D-10)', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    const element = document.createElement('datalayer-app') as HTMLElement & {
      context: Record<string, unknown>;
      functions: Record<string, unknown>;
    };
    element.innerHTML = `<script type="application/yaml">
schema: loop.app/v1
id: shop-help
name: Shop help
kind: chat
agent: support-agent
rules:
  - action: Read what the page says
    applies_to: host_context
    behaviour: do_it
deployment:
  embedded:
    host:
      context: [user]
</script>`;
    element.context = { user: 'Ana' };
    const messages: unknown[] = [];
    element.addEventListener('message', event =>
      messages.push((event as CustomEvent).detail),
    );
    await act(async () => {
      document.body.appendChild(element);
    });
    await settle();
    const renderer = seen.renderer.at(-1)!;
    // The host's tools reach its agent through a plugin of the renderer's.
    expect(renderer.plugins).toHaveLength(1);
    expect(element.context).toEqual({ user: 'Ana' });
    await act(async () => {
      renderer.onSaying({
        saying: {
          id: 'm1',
          text: 'Hello Ana',
          markdown: 'Hello **Ana**',
          more: false,
        },
        answering: true,
      });
      renderer.onPresence('thinking');
      renderer.onPresence('idle');
      // Said once.
      renderer.onPresence('idle');
    });
    expect(messages).toEqual([{ id: 'm1', text: 'Hello **Ana**' }]);
    element.remove();
  });

  it('draws an Appspec written in it, in its shadow root, in the mode its spec says', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    const element = document.createElement('datalayer-app');
    element.innerHTML = `<script type="application/yaml">
schema: loop.app/v1
id: support-desk
name: Support Desk
kind: chat
agent: support-agent
interface:
  accent: sun
  assistant: cat
deployment:
  embedded:
    mode: assistant
</script>`;
    await act(async () => {
      document.body.appendChild(element);
    });
    await settle();
    const shadow = element.shadowRoot!;
    expect(element.getAttribute('data-embed-mode')).toBe('assistant');
    expect(shadow.querySelector('link')?.getAttribute('href')).toBe(
      'https://datalayer.app/embed/datalayer-app.css',
    );
    expect(shadow.querySelector('style')?.textContent).toContain(
      'all: initial',
    );
    expect(shadow.querySelector('.datalayer-app-portal')).not.toBeNull();
    expect(seen.floating.at(-1)).toMatchObject({
      defaultViewMode: 'assistant',
      assistantCharacter: { id: 'cat' },
    });
    // The spec's accent inside the conversation, where the chat sets its
    // theme again.
    expect(held().themeOverrides.light).toEqual(
      loopAccentStyles('sun', 'light'),
    );
    // Nothing of it in the page's own tree, and nothing of its theme on the
    // page: no tokens on the host's <body>, no portal root of its own there.
    expect(document.body.querySelector('[data-testid="floating"]')).toBeNull();
    expect(document.body.style.getPropertyValue('--loop-accent')).toBe('');
    expect(document.body.getAttribute('data-color-mode')).toBeNull();
    expect(document.getElementById('__primerPortalRoot__')).toBeNull();
    expect(
      (
        shadow.querySelector('[data-datalayer-theme-scope]') as HTMLElement
      ).style.getPropertyValue('--loop-accent'),
    ).toBeTruthy();
    // The host's attribute wins over the spec's mode.
    await act(async () => element.setAttribute('mode', 'bubble'));
    await settle();
    expect(seen.floating.at(-1)!.defaultViewMode).toBe('floating-small');
    await act(async () => element.remove());
  });

  it('says a character nothing contributes, in place', async () => {
    const element = document.createElement('datalayer-app');
    element.innerHTML =
      '<script type="application/json">{"id":"a","name":"A","kind":"chat","agent":"x","interface":{"assistant":"owl"},"deployment":{"embedded":{"mode":"assistant"}}}</script>';
    await act(async () => {
      document.body.appendChild(element);
    });
    await settle();
    expect(element.getAttribute('data-embed-mode')).toBe('inline');
    expect(element.shadowRoot!.textContent).toContain(
      'This application names the character “owl”, which nothing enabled here draws',
    );
    expect(seen.floating).toHaveLength(0);
    await act(async () => element.remove());
  });

  it('says what is wrong with an attribute, in place', async () => {
    const element = document.createElement('datalayer-app');
    element.setAttribute('mode', 'popup');
    element.innerHTML =
      '<script type="application/json">{"id":"a","name":"A","kind":"chat","agent":"x"}</script>';
    await act(async () => {
      document.body.appendChild(element);
    });
    await settle();
    expect(element.shadowRoot!.textContent).toContain(
      '"popup" is not a mode; it is inline, bubble, panel or assistant.',
    );
    await act(async () => element.remove());
  });

  it('reads the application in the language its host says, and refuses one that is none (P-26)', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    const element = document.createElement('datalayer-app');
    element.setAttribute('mode', 'inline');
    element.setAttribute('language', 'fr');
    element.innerHTML =
      '<script type="application/json">{"id":"a","name":"Support Desk","kind":"chat","agent":"x"}</script>';
    await act(async () => {
      document.body.appendChild(element);
    });
    await settle();
    expect(seen.renderer.at(-1)!.language).toBe('fr');
    // Floating, its button says so in the language too.
    await act(async () => element.setAttribute('mode', 'bubble'));
    await settle();
    expect(seen.floating.at(-1)!.buttonTooltip).toBe('Parler à Support Desk');
    await act(async () => element.setAttribute('language', 'French'));
    await settle();
    expect(element.shadowRoot!.textContent).toContain(
      '"French" is not a language as BCP 47 tags it, such as fr or pt-BR.',
    );
    await act(async () => element.remove());
  });

  it('frames a public application named by its id, as before', async () => {
    const element = document.createElement('datalayer-app');
    element.setAttribute('app', '01M');
    await act(async () => {
      document.body.appendChild(element);
    });
    await settle();
    const frame = element.shadowRoot!.querySelector('iframe')!;
    expect(frame.getAttribute('src')).toBe(
      'https://datalayer.app/public/apps/01M/run?embed=1',
    );
    // The visitor's language, told to the framed page (P-26).
    await act(async () => element.setAttribute('language', 'pt-BR'));
    await settle();
    expect(
      element.shadowRoot!.querySelector('iframe')!.getAttribute('src'),
    ).toBe('https://datalayer.app/public/apps/01M/run?embed=1&language=pt-BR');
    await act(async () => element.remove());
  });

  it('asks for the app, or a spec, when given neither', async () => {
    const element = document.createElement('datalayer-app');
    await act(async () => {
      document.body.appendChild(element);
    });
    await settle();
    expect(element.shadowRoot!.textContent).toContain(
      'the "app" attribute names the application to show',
    );
    await act(async () => element.remove());
  });
});

describe('reading an application on Datalayer with its token', () => {
  const answer = (model: unknown, status = 200) =>
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ app: { model_s: JSON.stringify(model) } }),
          {
            status,
          },
        ),
    ) as unknown as typeof fetch;

  it('draws a chat from its spec, and frames a decision', async () => {
    const spec = dumpAppspec(chatApp());
    const chat = await readEmbeddedApp({
      api: 'https://prod1.datalayer.run/',
      origin: 'https://datalayer.app',
      app: '01M',
      token: 't',
      fetcher: answer({ spec }),
    });
    expect(chat.kind).toBe('spec');
    const decision = await readEmbeddedApp({
      api: 'https://prod1.datalayer.run',
      origin: 'https://datalayer.app',
      app: '01M',
      token: 't',
      fetcher: answer({ spec: { ...spec, kind: 'decision' } }),
    });
    expect(decision).toEqual({
      kind: 'frame',
      src: 'https://datalayer.app/public/apps/01M/run?embed=1#token=t',
    });
  });

  it('says the token lapsed, so that the host hands over a new one', async () => {
    const lapsed = await readEmbeddedApp({
      api: 'https://prod1.datalayer.run',
      origin: 'https://datalayer.app',
      app: '01M',
      token: 't',
      fetcher: answer({}, 401),
    });
    expect(lapsed).toMatchObject({ kind: 'said', expired: true });
  });

  it('reads an Appspec as YAML or JSON, indented as a page indents it', () => {
    expect(
      appspecOfText(
        '\n      id: a\n      name: A\n      kind: chat\n      agent: x\n    ',
      ).name,
    ).toBe('A');
    expect(
      appspecOfText('{"id":"a","name":"A","kind":"widget","agent":"x"}').kind,
    ).toBe('widget');
    expect(frameSrcOf('https://datalayer.app/', 'a b', 'x')).toBe(
      'https://datalayer.app/public/apps/a%20b/run?embed=1#token=x',
    );
    // The language goes in the query, the token stays in the fragment.
    expect(
      frameInLanguage(frameSrcOf('https://datalayer.app', 'a', 'x'), 'fr'),
    ).toBe(
      'https://datalayer.app/public/apps/a/run?embed=1&language=fr#token=x',
    );
  });

  it('refuses an empty Appspec, one without an id, and one no agent answers', () => {
    expect(() => appspecOfText('  ')).toThrow('the Appspec is empty');
    expect(() => appspecOfText('name: A\nkind: chat\n')).toThrow(
      'the Appspec names no application',
    );
    expect(() => appspecOfText('id: a\nname: A\nkind: chat\n')).toThrow(
      '“A” names no agent to answer',
    );
  });
});
