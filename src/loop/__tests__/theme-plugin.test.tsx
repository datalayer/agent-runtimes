/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The theme plugin rides with every Loop.
 *
 * The portal-root glue used to be an inline `setupPrimerPortals()` in the
 * palette's build — set up once, never following a theme change. The plugin
 * owns it now, and these pin the two facts Loop relies on: it is in the
 * preset, and its command actually turns the color mode.
 */

import { describe, expect, it } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import {
  THEME_PLUGIN_NAME,
  TOGGLE_COLOR_MODE_COMMAND,
} from '@datalayer/primer-addons/lib/reactor';
import { useThemeStore } from '@datalayer/primer-addons';
import { loopPlugins } from '../presets';
import { LoopCommandsPlugin } from '../plugins/commands';

describe('the theme plugin in Loop', () => {
  it('is in the preset, palette or not', async () => {
    const reactor = buildReactorFromPlugins(loopPlugins({}));
    expect(reactor.hasPlugin(THEME_PLUGIN_NAME)).toBe(true);
  });

  it('rides along with the palette on its own', async () => {
    // A host that mounts only the palette still needs the themed portal
    // root the palette renders into.
    const reactor = buildReactorFromPlugins([LoopCommandsPlugin]);
    expect(reactor.hasPlugin(THEME_PLUGIN_NAME)).toBe(true);
  });

  it('sets the portal root up and turns the color mode by command', async () => {
    const reactor = buildReactorFromPlugins(loopPlugins({}));
    await reactor.start();

    // The root exists, stamped with the store's mode — what the inline call
    // did, now owned by the plugin.
    const root = document.getElementById('__primerPortalRoot__');
    expect(root).not.toBeNull();

    // Every press is a visible change: from light to dark, from dark to
    // light, and from `auto` to the opposite of whatever `auto` is showing.
    // The store's own cycle passes through `auto`, which is a step nobody
    // can see when it resolves to the mode already on screen.
    const showing = (mode: string): string =>
      mode === 'auto'
        ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : mode;
    const before = useThemeStore.getState().colorMode;
    await reactor.executeCommand(TOGGLE_COLOR_MODE_COMMAND);
    const after = useThemeStore.getState().colorMode;
    expect(after).toBe(showing(before) === 'dark' ? 'light' : 'dark');
    // And back again, never landing on `auto`.
    await reactor.executeCommand(TOGGLE_COLOR_MODE_COMMAND);
    expect(useThemeStore.getState().colorMode).toBe(showing(before));

    const command = reactor.getCommand(TOGGLE_COLOR_MODE_COMMAND);
    expect(command?.keybinding).toBe('Mod+Alt+C');
  });
});
