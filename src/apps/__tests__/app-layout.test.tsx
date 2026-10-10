/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application drawn as its layout says (LOOP R-01, T-07): `chat` the
 * conversation alone, `page` the page layout's sheet with the conversation
 * over it, `split` the conversation and the page side by side with a
 * hairline to drag — on the workspace's own page-layout plugin, through
 * `AppRenderer`, and so in the embed's inline mode without the embed knowing.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { emptyAppspec } from '../apps/appspec';
import { appLayoutOptions } from '../apps/AppRenderer';
import {
  APP_PAGE_SURFACE,
  hasAppPage,
  surfaceUnshown,
} from '../plugins/app-page';
import { LoopChatLayout, LoopPromptPanel } from '../core';
import { loopPlugins } from '../presets';
import {
  LOOP_PAGE_LAYOUT_PLUGIN_NAME,
  SPLIT_DEFAULT_SHARE,
  SPLIT_MAX_SHARE,
  SPLIT_MIN_SHARE,
  SplitLayout,
  clampSplitShare,
  splitShareForKey,
} from '../plugins/page-layout';
import { APP_CATALOGUE } from '../../specs/apps';
import type { AppSpec } from '../../types/agentspecs';

const seen = vi.hoisted(() => ({
  embed: [] as Array<Record<string, any>>,
}));

// The workspace itself is stood in for: what is tested is what the
// application hands it.
vi.mock('../embed/LoopEmbed', () => ({
  LoopEmbed: (props: Record<string, any>) => {
    seen.embed.push(props);
    return <div data-testid="workspace" />;
  },
}));

// The embed's floating modes, which these tests do not draw.
vi.mock('../../chat/ChatFloating', () => ({
  ChatFloating: () => <div data-testid="floating" />,
}));
vi.mock('../../hooks/useAgentRuntimes', () => ({
  useAgentRuntimes: () => ({ runtime: null, error: null }),
}));

import { AppRenderer } from '../apps/AppRenderer';
import { AppEmbed } from '../embed/AppEmbed';

function appOf(
  kind: AppSpec['kind'],
  layout: AppSpec['interface']['layout'],
): AppSpec {
  const app = emptyAppspec(kind);
  app.id = `a-${kind}-${layout}`;
  app.name = 'An App';
  app.agent = 'some-agent';
  app.emoji = '🦊';
  app.interface.layout = layout;
  return app;
}

beforeEach(() => {
  seen.embed.length = 0;
});

afterEach(() => {
  document.body.replaceChildren();
});

async function render(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, root };
}

describe('what each layout asks of the workspace', () => {
  it('draws a chat as the conversation alone', () => {
    expect(appLayoutOptions(appOf('chat', 'chat'))).toEqual({
      editors: false,
      showViewSelector: false,
    });
  });

  it('draws a page on the page layout, the page on the sheet, the composer over it', () => {
    expect(appLayoutOptions(appOf('widget', 'page'))).toEqual({
      editors: false,
      showViewSelector: false,
      defaultEditor: APP_PAGE_SURFACE,
      pageLayout: true,
      pageLayoutArrangement: 'page',
      pageLayoutPrompt: 'floating',
      pageLayoutPromptAnchor: 'bottom',
      pageLayoutTurnPanelFooter: 'actions',
    });
  });

  it('draws a split apart from a page: the same page, side by side', () => {
    const split = appLayoutOptions(appOf('worker', 'split'));
    expect(split.pageLayout).toBe(true);
    expect(split.pageLayoutArrangement).toBe('split');
    expect(split.defaultEditor).toBe(APP_PAGE_SURFACE);
  });

  it('keeps the editors for a layout without a page of its own (a decision)', () => {
    const decision = appLayoutOptions(appOf('decision', 'page'));
    expect(decision.editors).toBe(true);
    expect(decision.defaultEditor).toBeUndefined();
    expect(decision.pageLayoutArrangement).toBe('page');
  });

  it('draws the catalogue as each application says', () => {
    expect(
      appLayoutOptions(APP_CATALOGUE['web-research']).pageLayout,
    ).toBeUndefined();
    expect(
      appLayoutOptions(APP_CATALOGUE['quote-calculator']).pageLayoutArrangement,
    ).toBe('page');
    expect(
      appLayoutOptions(APP_CATALOGUE['inbox-triage']).pageLayoutArrangement,
    ).toBe('split');
  });

  it('says, of a page composed for a chat layout, that it is not drawn', () => {
    const app = appOf('chat', 'chat');
    expect(surfaceUnshown(app)).toBeNull();
    app.interface.surface = {
      protocol: 'a2ui/v0.9',
      components: [{ id: 'root', component: 'Text', text: 'Hi' }],
      composedBy: 'canvas',
      composedAt: '',
    } as AppSpec['interface']['surface'];
    expect(hasAppPage(app)).toBe(false);
    expect(surfaceUnshown(app)).toMatch(/layout is chat.*page or split/);
    app.interface.layout = 'split';
    expect(surfaceUnshown(app)).toBeNull();
  });
});

describe('the renderer and the embed', () => {
  it('hands the workspace the layout, and a host still wins', async () => {
    const one = await render(<AppRenderer app={appOf('worker', 'split')} />);
    expect(seen.embed.at(-1)).toMatchObject({
      pageLayout: true,
      pageLayoutArrangement: 'split',
      defaultEditor: APP_PAGE_SURFACE,
    });
    await act(async () => one.root.unmount());
    const two = await render(
      <AppRenderer
        app={appOf('worker', 'split')}
        pageLayoutArrangement="page"
      />,
    );
    expect(seen.embed.at(-1)!.pageLayoutArrangement).toBe('page');
    await act(async () => two.root.unmount());
  });

  it('frames the application in a window with its face and name, when asked', async () => {
    const one = await render(<AppRenderer app={appOf('chat', 'chat')} />);
    expect(seen.embed.at(-1)!.frameTitle).toBeUndefined();
    await act(async () => one.root.unmount());
    const two = await render(<AppRenderer app={appOf('chat', 'chat')} frame />);
    expect(seen.embed.at(-1)!.frameTitle).toBe('🦊 An App');
    await act(async () => two.root.unmount());
  });

  it('gives the embed’s inline mode the same layout, for free', async () => {
    for (const layout of ['chat', 'page', 'split'] as const) {
      const app = appOf('widget', layout);
      const { root } = await render(<AppEmbed app={app} mode="inline" />);
      const props = seen.embed.at(-1)!;
      expect(props.pageLayout ?? false).toBe(layout !== 'chat');
      if (layout !== 'chat') {
        expect(props.pageLayoutArrangement).toBe(layout);
      }
      await act(async () => root.unmount());
    }
  });
});

describe('the split, on the page-layout plugin', () => {
  it('is contributed in place of the sheet, with no turn panel and no toggle', async () => {
    const reactor = buildReactorFromPlugins(
      loopPlugins({ pageLayout: true, pageLayoutArrangement: 'split' }),
    );
    await reactor.start();
    const layouts = reactor.getContributions(LoopChatLayout);
    expect(layouts.map(entry => entry.value.id)).toEqual(['split-layout']);
    expect(layouts[0].value.prompt).toBe('docked');
    expect(
      reactor.getContributions(LoopPromptPanel).map(entry => entry.value.id),
    ).not.toContain('page-layout-turn');
    expect(
      reactor.getConfig<{ arrangement: string }>(LOOP_PAGE_LAYOUT_PLUGIN_NAME)
        ?.arrangement,
    ).toBe('split');
  });

  it('keeps the page arrangement by default', async () => {
    const reactor = buildReactorFromPlugins(loopPlugins({ pageLayout: true }));
    await reactor.start();
    expect(
      reactor.getContributions(LoopChatLayout).map(entry => entry.value.id),
    ).toEqual(['page-layout']);
  });

  it('holds the hairline within its bounds, by key', () => {
    expect(clampSplitShare(0)).toBe(SPLIT_MIN_SHARE);
    expect(clampSplitShare(1)).toBe(SPLIT_MAX_SHARE);
    expect(clampSplitShare(Number.NaN)).toBe(SPLIT_DEFAULT_SHARE);
    expect(splitShareForKey(0.4, 'ArrowRight')).toBeCloseTo(0.45);
    expect(splitShareForKey(0.4, 'ArrowLeft')).toBeCloseTo(0.35);
    expect(splitShareForKey(0.4, 'Home')).toBe(SPLIT_MIN_SHARE);
    expect(splitShareForKey(0.4, 'End')).toBe(SPLIT_MAX_SHARE);
    expect(splitShareForKey(0.4, 'a')).toBeNull();
  });

  const parts = (hasEditor: boolean) => ({
    workspace: {} as never,
    editors: <div data-testid="page">the page</div>,
    hasEditor,
    transcript: <div data-testid="transcript">the conversation</div>,
    prompt: <div data-testid="prompt">the composer</div>,
    chips: null,
    picker: null,
    transient: null,
  });

  it('draws the conversation on the left, the page on the right, a hairline between', async () => {
    const { container, root } = await render(<SplitLayout {...parts(true)} />);
    const conversation = container.querySelector(
      '[data-testid="loop-split-conversation"]',
    )!;
    const page = container.querySelector('[data-testid="loop-split-page"]')!;
    const separator = container.querySelector('[role="separator"]')!;
    expect(conversation.textContent).toBe('the conversationthe composer');
    expect(page.textContent).toBe('the page');
    // In that order, left to right.
    expect(
      [...conversation.parentElement!.children].map(child =>
        child.getAttribute('role') === 'separator'
          ? 'hairline'
          : child.getAttribute('data-testid'),
      ),
    ).toEqual(['loop-split-conversation', 'hairline', 'loop-split-page']);
    expect(separator.getAttribute('aria-valuenow')).toBe('40');
    await act(async () => root.unmount());
  });

  it('moves the hairline by key and by pointer', async () => {
    const { container, root } = await render(<SplitLayout {...parts(true)} />);
    const separator = container.querySelector(
      '[role="separator"]',
    ) as HTMLElement;
    await act(async () => {
      separator.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
    });
    expect(separator.getAttribute('aria-valuenow')).toBe('45');
    const row = separator.parentElement!;
    row.getBoundingClientRect = () =>
      ({ left: 100, width: 1000, top: 0, height: 500 }) as DOMRect;
    await act(async () => {
      separator.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 550 }),
      );
      separator.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 700 }),
      );
      separator.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true, clientX: 700 }),
      );
    });
    expect(separator.getAttribute('aria-valuenow')).toBe('60');
    // Released: a move no longer drags it.
    await act(async () => {
      separator.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 300 }),
      );
    });
    expect(separator.getAttribute('aria-valuenow')).toBe('60');
    await act(async () => root.unmount());
  });

  it('is the conversation alone while no page is on screen, the page kept mounted', async () => {
    const { container, root } = await render(<SplitLayout {...parts(false)} />);
    expect(container.querySelector('[role="separator"]')).toBeNull();
    expect(container.querySelector('[data-testid="page"]')).not.toBeNull();
    await act(async () => root.unmount());
  });
});
