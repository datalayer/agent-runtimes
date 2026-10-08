/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The preset per kind (LOOP R-01, R-01b, R-02): which plugins an
 * application's kind needs and how its workspace is laid out — a chat, a
 * widget or a worker as its agent, its page and the Canvas's blocks; a
 * decision as the page its host draws, in a workspace without a
 * conversation — and a decision drawn by the real workspace.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { emptyAppspec } from '../apps/appspec';
import { appPreset, AppRenderer } from '../apps/AppRenderer';
import {
  APP_HOST_PAGE_VIEW,
  APP_PAGE_PLUGIN_NAME,
  type AppHostPageProps,
} from '../plugins/app-page';
import { CANVAS_BLOCK_PLUGINS } from '../plugins/canvas-blocks';
import { CHAT_PLUGIN_NAME } from '../plugins/chat';
import { LoopViewType } from '../core';
import { loopPlugins } from '../presets';
import { APP_CATALOGUE } from '../../specs/apps';
import type { AppSpec } from '../../types/agentspecs';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const decision = (): AppSpec => ({
  ...emptyAppspec('decision'),
  id: 'pick-a-vendor',
  name: 'Pick a vendor',
  emoji: '⚖️',
});

/** A host's page: what a decision's run page is to the workspace. */
function DecisionPage({ app }: AppHostPageProps): React.JSX.Element {
  return <div data-testid="decision-page">Deciding: {app.name}</div>;
}

/** A plugin's name, configured or not. */
const names = (plugins: unknown[]) =>
  plugins.map(
    ref =>
      (ref as { name?: string; plugin?: { name: string } }).name ??
      (ref as { plugin: { name: string } }).plugin.name,
  );

afterEach(() => {
  document.body.replaceChildren();
});

describe('the preset per kind', () => {
  it('runs a chat as its agent and the feedback its record keeps, laid out as a conversation', () => {
    const preset = appPreset(APP_CATALOGUE['web-research']);
    expect(names(preset.plugins)).toEqual([
      // Its page plugin, named as its runtime's is (F-15), and what tells
      // it which of them its runtime holds.
      'loop-app-web-research',
      '@datalayer/loop-plugin-app-runtime',
      '@datalayer/loop-plugin-app-feedback-web-research',
      '@datalayer/loop-plugin-app-elements',
    ]);
    expect(preset.workspace).toEqual({
      editors: false,
      showViewSelector: false,
    });
  });

  it('gives a page its plugin and the Canvas’s blocks, which are what it draws', () => {
    const preset = appPreset(APP_CATALOGUE['quote-calculator']);
    const mounted = names(preset.plugins);
    expect(mounted).toContain(`${APP_PAGE_PLUGIN_NAME}-quote-calculator`);
    for (const blocks of names(CANVAS_BLOCK_PLUGINS)) {
      expect(mounted).toContain(blocks);
    }
    expect(preset.workspace.pageLayoutArrangement).toBe('page');
  });

  it('leaves out the blocks of a UI plugin its organization turned off', () => {
    const preset = appPreset(APP_CATALOGUE['quote-calculator'], {
      pluginsOff: ['a2ui'],
    });
    expect(names(preset.plugins)).not.toContain(
      '@datalayer/loop-plugin-ui-a2ui',
    );
    expect(names(preset.plugins)).toContain(
      `${APP_PAGE_PLUGIN_NAME}-quote-calculator`,
    );
  });

  it('draws a decision as its host’s page, with no conversation', () => {
    const preset = appPreset(decision(), { page: DecisionPage });
    expect(names(preset.plugins)).toEqual([
      `${APP_PAGE_PLUGIN_NAME}-pick-a-vendor`,
    ]);
    expect(preset.workspace.conversation).toBe(false);
    const reactor = buildReactorFromPlugins(preset.plugins);
    reactor.start();
    expect(
      reactor.getContributions(LoopViewType).map(entry => entry.value.viewType),
    ).toEqual([APP_HOST_PAGE_VIEW]);
  });

  it('refuses a decision without its host’s page, and a team, in a sentence', () => {
    expect(() => appPreset(decision())).toThrow(
      /is a decision, whose page is drawn by where it runs/,
    );
    const team = { ...APP_CATALOGUE['web-research'], agent: '', team: 't' };
    expect(() => appPreset(team)).toThrow(/is run by a team/);
  });
});

describe('a workspace without a conversation', () => {
  it('mounts no chat, no agents and no editors', () => {
    const mounted = names(loopPlugins({ conversation: false }));
    expect(mounted).not.toContain(CHAT_PLUGIN_NAME);
    expect(
      mounted.some(name => /agents|notebook|document|models/.test(name)),
    ).toBe(false);
    expect(mounted).toContain('@datalayer/loop-plugin-shell');
  });
});

describe('a decision, on the workspace', () => {
  async function render(element: React.ReactElement) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(element));
    // The view is loaded lazily: a turn for it to arrive.
    for (let i = 0; i < 5; i += 1) {
      await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
    }
    return { container, root };
  }

  it('is its host’s page, as the one view, with no composer', async () => {
    const { container, root } = await render(
      <AppRenderer app={decision()} page={DecisionPage} />,
    );
    expect(
      container.querySelector('[data-testid="decision-page"]')?.textContent,
    ).toBe('Deciding: Pick a vendor');
    expect(container.querySelector('textarea')).toBeNull();
    await act(async () => root.unmount());
  });

  it('says why it is not drawn when its host gave no page', async () => {
    const { container, root } = await render(<AppRenderer app={decision()} />);
    expect(container.textContent).toMatch(
      /Pick a vendor” is a decision, whose page is drawn by where it runs/,
    );
    await act(async () => root.unmount());
  });
});
