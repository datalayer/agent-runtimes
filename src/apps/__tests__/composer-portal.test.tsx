/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Composer, full screen from the chat's toolbar (the user, 21 November
 * 2026: "a reactor plugin to show in a full screen portal the composer
 * (canvas, spec, python) … add that plugin to all the anonymous seed agents
 * … a new button to the agent toolbar"): its plugin is an agent UI that
 * needs no connection, the eight agents of the public home and their demos
 * name it, its button opens a labelled full-screen dialog that Escape closes,
 * giving the focus back, and the dialog shows its host's Composer when the
 * host contributes one, its own spec and Python otherwise.
 */

// @vitest-environment jsdom
import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider, BaseStyles } from '@primer/react';
import {
  buildReactorFromPlugins,
  definePlugin,
  type PluginRef,
} from '@datalayer/reactor';
import { registerReactor } from '@datalayer/reactor/react';
import {
  AGENT_UI_PLUGINS,
  agentUiChromeOf,
  agentUiIdsOf,
  agentUiPluginsFor,
} from '../agentUiPlugins';
import { LoopSlots } from '../core';
import { applicationPlugin } from '../apps/AppRenderer';
import {
  COMPOSER_PORTAL_PLUGIN_NAME,
  COMPOSER_PORTAL_WORDS,
  ComposerPortalButton,
  ComposerViewProvider,
} from '../plugins/composer-portal';
import {
  ComposerSource,
  composerPython,
} from '../plugins/composer-portal/ComposerSource';
import { composedApplication } from '../plugins/composer-portal/ComposerPortal';
import { APP_CATALOGUE } from '../../specs/apps';
import type { AppSpec } from '../../types/agentspecs';

// jsdom has no ResizeObserver, which Primer's dialog sizes its body with.
if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

afterEach(() => {
  cleanup();
  registerReactor(null);
});

/** The agents of the public home, and their demos. */
const SEED_AGENTS: Record<string, string> = {
  'worker-marketer': 'demo-marketer',
  'worker-shopper': 'demo-shopper',
  'worker-accountant': 'demo-accountant',
  'worker-traveller': 'demo-traveller',
  'worker-terra': 'demo-terra',
  'worker-steward-aws': 'demo-aws-steward',
  'jupyter-data-analyst': 'demo-jupyter-data-analyst',
  'worker-functional-analyst': 'demo-functional-analyst',
};

const themed = (node: React.ReactNode) => (
  <ThemeProvider>
    <BaseStyles>{node}</BaseStyles>
  </ThemeProvider>
);

function withPlatform(plugins: PluginRef[]) {
  const reactor = buildReactorFromPlugins(plugins);
  registerReactor(reactor);
  act(() => {
    reactor.start();
  });
  return reactor;
}

describe('the Composer’s plugin', () => {
  it('is an agent UI a visitor has, in the toolbar by default', () => {
    const entry = AGENT_UI_PLUGINS['composer-portal'];
    expect(entry.needsConnection).toBe(false);
    const [plugin] = agentUiPluginsFor(['composer-portal'], {
      anonymous: true,
    });
    expect((plugin as { name: string }).name).toBe(COMPOSER_PORTAL_PLUGIN_NAME);
    expect(
      agentUiChromeOf(['composer-portal'], { anonymous: true }).toolbar,
    ).toEqual(['composer-portal']);
  });

  it.each(Object.entries(SEED_AGENTS))(
    'is named by %s and by its demo %s',
    (agent, demo) => {
      expect(agentUiIdsOf(agent)).toContain('composer-portal');
      expect(APP_CATALOGUE[demo].ui.map(choice => choice.plugin)).toContain(
        'composer-portal',
      );
    },
  );
});

describe('the Composer’s button', () => {
  it('draws nothing where there is no application to show', () => {
    const { container } = render(themed(<ComposerPortalButton />));
    expect(container.querySelector('[data-composer-portal-open]')).toBeNull();
  });

  it('opens the agent’s application full screen in a `Chat`, and Escape closes it, the focus back on the button', async () => {
    render(themed(<ComposerPortalButton agentSpecId="worker-marketer" />));
    const button = screen.getByRole('button', {
      name: COMPOSER_PORTAL_WORDS.open,
    });
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    act(() => button.click());
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(
      document.getElementById(dialog.getAttribute('aria-labelledby')!)
        ?.textContent,
    ).toBe(COMPOSER_PORTAL_WORDS.title('Marketer'));
    // Its own content: no host contributed one.
    expect(
      dialog.querySelector('[data-composer-canvas="worker-marketer"]'),
    ).toBeTruthy();
    // Escape closes it (the focus held inside it is Primer's trap, which
    // jsdom cannot lay out: the browser check proves it).
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it('shows the workspace’s application, drawn by its host’s Composer when it contributes one', async () => {
    const app = APP_CATALOGUE['demo-terra'];
    const hosted: string[] = [];
    const HostComposer = ({ app: shown }: { app: AppSpec }) => {
      hosted.push(shown.id);
      return <p data-host-composer="">{shown.name}</p>;
    };
    withPlatform([
      applicationPlugin(app, app),
      definePlugin({
        name: 'host-composer',
        build: () => ({
          components: [
            {
              id: 'host-composer',
              slot: LoopSlots.composerView,
              Component: HostComposer as never,
            },
          ],
        }),
      }) as PluginRef,
    ]);
    render(themed(<ComposerPortalButton />));
    act(() =>
      screen.getByRole('button', { name: COMPOSER_PORTAL_WORDS.open }).click(),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      dialog.querySelector('[data-composer-portal="demo-terra"]'),
    ).toBeTruthy();
    expect(dialog.querySelector('[data-host-composer]')?.textContent).toBe(
      app.name,
    );
    expect(dialog.querySelector('[data-composer-canvas]')).toBeNull();
    expect(hosted).toContain('demo-terra');
  });

  it('shows the view its host hands through the context where no workspace hosts the chat', async () => {
    const HostView = ({ app }: { app: AppSpec }) => (
      <p data-context-composer="">{app.agent}</p>
    );
    render(
      themed(
        <ComposerViewProvider value={HostView}>
          <ComposerPortalButton agentSpecId="worker-terra" />
        </ComposerViewProvider>,
      ),
    );
    act(() =>
      screen.getByRole('button', { name: COMPOSER_PORTAL_WORDS.open }).click(),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('[data-context-composer]')?.textContent).toBe(
      'worker-terra',
    );
    expect(dialog.querySelector('[data-composer-canvas]')).toBeNull();
  });

  it('closes with its close button', async () => {
    const app = APP_CATALOGUE['demo-marketer'];
    withPlatform([applicationPlugin(app, app)]);
    render(themed(<ComposerPortalButton />));
    act(() =>
      screen.getByRole('button', { name: COMPOSER_PORTAL_WORDS.open }).click(),
    );
    const dialog = await screen.findByRole('dialog');
    const close = within(dialog).getByRole('button', { name: 'Close' });
    act(() => close.click());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the Composer’s own content', () => {
  it('reads the application on its Canvas, as YAML and in Python', () => {
    const app = APP_CATALOGUE['demo-marketer'];
    const { container } = render(themed(<ComposerSource app={app} />));
    expect(
      container.querySelector('[data-composer-canvas="demo-marketer"]'),
    ).toBeTruthy();
    act(() => screen.getByRole('button', { name: 'YAML' }).click());
    const yaml = container.querySelector('[data-composer-code="yaml"]');
    expect(yaml?.textContent).toContain('id: demo-marketer');
    expect(yaml?.textContent).toContain('composer-portal');
    act(() => screen.getByRole('button', { name: 'Python' }).click());
    const python = container.querySelector('[data-composer-code="python"]');
    expect(python?.textContent).toContain('Application');
    expect(screen.getByText(COMPOSER_PORTAL_WORDS.pythonEjected)).toBeTruthy();
  });

  it('knows the Python of the catalogue’s applications only', () => {
    expect(composerPython({ id: 'demo-marketer' }).how).toBe('ejected');
    expect(composerPython({ id: 'worker-marketer' })).toEqual({
      code: null,
      how: 'none',
    });
  });

  it('shows the workspace’s application, else the chat’s agent as one', () => {
    const app = APP_CATALOGUE['demo-shopper'];
    expect(composedApplication(app, 'worker-marketer')).toBe(app);
    expect(composedApplication(undefined, 'worker-marketer')?.agent).toBe(
      'worker-marketer',
    );
    expect(composedApplication(undefined, undefined)).toBeUndefined();
  });
});
