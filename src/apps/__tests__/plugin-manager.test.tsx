/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The plugins manager from a button (the user, 21 November 2026: "reactor has
 * a plugin plugin-manager to list, enable, disable the plugins ... when user
 * will click on that icon in the footer the overlay will be shown"): its
 * plugin is an agent UI a visitor has, in the footer by default and only in
 * a Loop workspace; its button draws nothing where no platform runs, opens a
 * labelled dialog holding Reactor's list of the page's plugins, whose
 * switches call the platform, its own and the manager's fixed on; Escape
 * closes it, the focus back on the button.
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
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  agentUiPluginsFor,
} from '../agentUiPlugins';
import { LoopSlots } from '../core';
import {
  PLUGIN_MANAGER_PLUGIN_NAME,
  PLUGIN_MANAGER_PROTECTED,
  PLUGIN_MANAGER_WORDS,
  PluginManagerButton,
  PluginManagerPlugin,
  pluginManagerPlugin,
} from '../plugins/plugin-manager';

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

const themed = (node: React.ReactNode) => (
  <ThemeProvider>
    <BaseStyles>{node}</BaseStyles>
  </ThemeProvider>
);

const DemoPlugin = definePlugin({
  name: '@example/demo-weather',
  displayName: 'Weather',
  description: 'Tells the weather.',
}) as PluginRef;

function withPlatform(plugins: PluginRef[]) {
  const reactor = buildReactorFromPlugins(plugins);
  registerReactor(reactor);
  act(() => {
    reactor.start();
  });
  return reactor;
}

describe('the plugins manager’s plugin', () => {
  it('is an agent UI a visitor has, in a Loop workspace’s footer by default', () => {
    const entry = AGENT_UI_PLUGINS['plugin-manager'];
    expect(entry.needsConnection).toBe(false);
    // No `Chat` chrome: outside a workspace there is no platform of the page's.
    expect(entry.Chrome).toBeUndefined();
    const [plugin] = agentUiPluginsFor(['plugin-manager'], { anonymous: true });
    expect((plugin as { name: string }).name).toBe(PLUGIN_MANAGER_PLUGIN_NAME);
    expect(agentUiChromeOf(['plugin-manager']).footer).toEqual([]);
  });

  it('fills the chat’s footer row under the prompt, or the title bar', async () => {
    const footer = buildReactorFromPlugins([PluginManagerPlugin]);
    await footer.start();
    // In the row under the prompt, beside its controls, usable while the
    // prompt is closed — not a row of its own below it (22 November 2026).
    expect(footer.getManifest(PLUGIN_MANAGER_PLUGIN_NAME)?.slots).toEqual([
      LoopSlots.promptStatus,
    ]);
    const drawn = footer.getOutput(PLUGIN_MANAGER_PLUGIN_NAME) as {
      components: { slot: string }[];
    };
    expect(drawn.components.map(component => component.slot)).toEqual([
      LoopSlots.promptStatus,
    ]);
    // The manifest says the spec's default; the header placement's component
    // goes in the title bar.
    const header = buildReactorFromPlugins([pluginManagerPlugin('header')]);
    await header.start();
    const output = header.getOutput(PLUGIN_MANAGER_PLUGIN_NAME) as {
      components: { slot: string }[];
    };
    expect(output.components.map(component => component.slot)).toEqual([
      LoopSlots.chatHeader,
    ]);
  });

  it('protects itself, the Loop’s panel and Reactor’s manager', () => {
    expect(PLUGIN_MANAGER_PROTECTED).toEqual([
      PLUGIN_MANAGER_PLUGIN_NAME,
      '@datalayer/loop-plugin-plugins-panel',
      '@datalayer/reactor-manager',
    ]);
  });
});

describe('the plugins manager’s button', () => {
  it('draws nothing where no platform runs', () => {
    const { container } = render(
      themed(<PluginManagerButton placement="footer" />),
    );
    expect(container.querySelector('[data-plugin-manager-open]')).toBeNull();
  });

  it('opens the page’s plugins in a dialog, toggles one off and on; Escape and its close button close it', async () => {
    const reactor = withPlatform([PluginManagerPlugin, DemoPlugin]);
    const disable = vi.spyOn(reactor, 'disable');
    const enable = vi.spyOn(reactor, 'enable');
    render(themed(<PluginManagerButton placement="footer" />));
    const button = screen.getByRole('button', {
      name: PLUGIN_MANAGER_WORDS.open,
    });
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    act(() => button.click());
    const dialog = await screen.findByRole('dialog');
    expect(
      document.getElementById(dialog.getAttribute('aria-labelledby')!)
        ?.textContent,
    ).toBe(PLUGIN_MANAGER_WORDS.title);
    // Escape closes it, the focus back on the button.
    await within(dialog).findByRole('button', { name: 'Weather' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(button));

    act(() => button.click());
    const reopened = await screen.findByRole('dialog');
    // Reactor’s list: a row per plugin, a switch each.
    const weather = await within(reopened).findByRole('button', {
      name: 'Weather',
    });
    expect(weather.getAttribute('aria-pressed')).toBe('true');
    // Its own switch is fixed on.
    const own = within(reopened).getByRole('button', { name: 'Plugins' });
    expect(
      own.hasAttribute('disabled') ||
        own.getAttribute('aria-disabled') === 'true',
    ).toBe(true);

    act(() => weather.click());
    expect(disable).toHaveBeenCalledWith('@example/demo-weather');
    await waitFor(() =>
      expect(
        within(reopened)
          .getByRole('button', { name: 'Weather' })
          .getAttribute('aria-pressed'),
      ).toBe('false'),
    );
    act(() =>
      within(reopened).getByRole('button', { name: 'Weather' }).click(),
    );
    expect(enable).toHaveBeenCalledWith('@example/demo-weather');
    await waitFor(() =>
      expect(
        within(reopened)
          .getByRole('button', { name: 'Weather' })
          .getAttribute('aria-pressed'),
      ).toBe('true'),
    );

    // Its close button closes it too.
    act(() => within(reopened).getByRole('button', { name: 'Close' }).click());
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(button));
  });
});
