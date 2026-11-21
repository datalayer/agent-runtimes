/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The plugins manager's button on every application (the user, 21 November
 * 2026: "all our apps should render with that plugin"), listed in its `ui`
 * or not, unless its spec leaves it out (`interface.plugin_manager_disabled`):
 * what `appPreset` mounts, what its document keeps, what the checks refuse.
 */

import { describe, expect, it } from 'vitest';
import { appPreset } from '../apps/AppRenderer';
import {
  PLUGIN_MANAGER,
  drawnUiOf,
  dumpAppspec,
  emptyAppspec,
  parseAppspec,
  uiProblems,
} from '../apps/appspec';
import { checkAppspec } from '../apps/checks';
import { PLUGIN_MANAGER_PLUGIN_NAME } from '../plugins/plugin-manager';
import { APP_CATALOGUE } from '../../specs/apps';
import type { AppSpec } from '../../types/agentspecs';

const names = (plugins: unknown[]) =>
  plugins.map(ref => (ref as { name: string }).name);

const leftOut = (app: AppSpec): AppSpec => ({
  ...app,
  interface: { ...app.interface, pluginManagerDisabled: true },
});

const research = (): AppSpec => APP_CATALOGUE['web-research'];

describe('the plugins manager’s button, every application’s', () => {
  it('is drawn for every application of the catalogue but a decision, last', () => {
    for (const app of Object.values(APP_CATALOGUE)) {
      expect(
        app.ui.map(choice => choice.plugin),
        app.id,
      ).not.toContain(PLUGIN_MANAGER);
      const drawn = drawnUiOf(app);
      if (app.kind === 'decision') {
        expect(drawn, app.id).toEqual(app.ui);
      } else {
        expect(drawn.at(-1), app.id).toEqual({ plugin: PLUGIN_MANAGER });
      }
    }
  });

  it('is mounted by the preset, for the person and for a visitor, once', () => {
    for (const visitor of [false, true]) {
      const mounted = names(appPreset(research(), { visitor }).plugins);
      expect(
        mounted.filter(name => name === PLUGIN_MANAGER_PLUGIN_NAME),
      ).toHaveLength(1);
    }
  });

  it('is drawn once for an application that lists it, where it lists it', () => {
    const app = {
      ...research(),
      ui: [{ plugin: PLUGIN_MANAGER }, ...research().ui],
    };
    expect(drawnUiOf(app).filter(c => c.plugin === PLUGIN_MANAGER)).toEqual([
      { plugin: PLUGIN_MANAGER },
    ]);
    expect(drawnUiOf(app)[0]).toEqual({ plugin: PLUGIN_MANAGER });
    expect(
      names(appPreset(app).plugins).filter(
        name => name === PLUGIN_MANAGER_PLUGIN_NAME,
      ),
    ).toHaveLength(1);
  });

  it('is left out by `interface.plugin_manager_disabled`', () => {
    const app = leftOut(research());
    expect(drawnUiOf(app).map(c => c.plugin)).not.toContain(PLUGIN_MANAGER);
    for (const visitor of [false, true]) {
      expect(names(appPreset(app, { visitor }).plugins)).not.toContain(
        PLUGIN_MANAGER_PLUGIN_NAME,
      );
    }
  });

  it('is not drawn on a decision, which has no chat', () => {
    const decision = emptyAppspec('decision');
    expect(drawnUiOf(decision)).toEqual(decision.ui);
  });

  it('stays out of the document: only leaving it out is written', () => {
    const app = emptyAppspec('chat');
    expect(
      (dumpAppspec(app).interface as Record<string, unknown> | undefined)
        ?.plugin_manager_disabled,
    ).toBeUndefined();
    expect(dumpAppspec(app).ui).not.toContainEqual({ plugin: PLUGIN_MANAGER });
    const written = dumpAppspec(leftOut(app));
    expect(written.interface).toMatchObject({ plugin_manager_disabled: true });
    expect(parseAppspec(written).app.interface.pluginManagerDisabled).toBe(
      true,
    );
    expect(parseAppspec(dumpAppspec(app)).app.interface).not.toHaveProperty(
      'pluginManagerDisabled',
    );
  });

  it('is refused both listed and left out, and when said as other than true or false', () => {
    const both = leftOut({
      ...research(),
      ui: [...research().ui, { plugin: PLUGIN_MANAGER }],
    });
    expect(uiProblems(both)).toEqual([
      "It lists the UI plugin 'plugin-manager' and leaves it out (`interface.plugin_manager_disabled`): say one.",
    ]);
    expect(uiProblems(leftOut(research()))).toEqual([]);
    const written = dumpAppspec(research());
    expect(
      checkAppspec({
        ...written,
        interface: {
          ...(written.interface as object),
          plugin_manager_disabled: 'yes',
        },
      }).problems,
    ).toContain('interface.plugin_manager_disabled: is true or false.');
  });
});
