/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Composer's button on every application's chat (the user, 21 November
 * 2026), listed in its `ui` or not, unless its spec leaves it out
 * (`interface.composer_portal_disabled`): what `appPreset` mounts, what its
 * document keeps, what the checks refuse.
 */

import { describe, expect, it } from 'vitest';
import { appPreset } from '../apps/AppRenderer';
import {
  COMPOSER_PORTAL,
  drawnUiOf,
  dumpAppspec,
  emptyAppspec,
  parseAppspec,
  uiProblems,
} from '../apps/appspec';
import { checkAppspec } from '../apps/checks';
import { COMPOSER_PORTAL_PLUGIN_NAME } from '../plugins/composer-portal';
import { APP_CATALOGUE } from '../../specs/apps';
import type { AppSpec } from '../../types/agentspecs';

const names = (plugins: unknown[]) =>
  plugins.map(ref => (ref as { name: string }).name);

const leftOut = (app: AppSpec): AppSpec => ({
  ...app,
  interface: { ...app.interface, composerPortalDisabled: true },
});

const research = (): AppSpec => APP_CATALOGUE['web-research'];

describe('the Composer’s button, every application’s', () => {
  it('is drawn for an application that does not list it, last', () => {
    const app = research();
    expect(app.ui.map(choice => choice.plugin)).not.toContain(COMPOSER_PORTAL);
    expect(drawnUiOf(app)).toEqual([...app.ui, { plugin: COMPOSER_PORTAL }]);
    for (const visitor of [false, true]) {
      expect(names(appPreset(app, { visitor }).plugins)).toContain(
        COMPOSER_PORTAL_PLUGIN_NAME,
      );
    }
  });

  it('is drawn once for an application that lists it, where it lists it', () => {
    const app = APP_CATALOGUE['demo-accountant'];
    expect(drawnUiOf(app)).toEqual(app.ui);
    expect(
      names(appPreset(app).plugins).filter(
        name => name === COMPOSER_PORTAL_PLUGIN_NAME,
      ),
    ).toHaveLength(1);
  });

  it('is left out by `interface.composer_portal_disabled`', () => {
    const app = leftOut(research());
    expect(drawnUiOf(app)).toEqual(app.ui);
    for (const visitor of [false, true]) {
      expect(names(appPreset(app, { visitor }).plugins)).not.toContain(
        COMPOSER_PORTAL_PLUGIN_NAME,
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
        ?.composer_portal_disabled,
    ).toBeUndefined();
    expect(dumpAppspec(app).ui).not.toContainEqual({
      plugin: COMPOSER_PORTAL,
    });
    const written = dumpAppspec(leftOut(app));
    expect(written.interface).toMatchObject({
      composer_portal_disabled: true,
    });
    expect(parseAppspec(written).app.interface.composerPortalDisabled).toBe(
      true,
    );
    expect(parseAppspec(dumpAppspec(app)).app.interface).not.toHaveProperty(
      'composerPortalDisabled',
    );
  });

  it('is refused both listed and left out, and when said as other than true or false', () => {
    const both = leftOut({
      ...research(),
      ui: [...research().ui, { plugin: COMPOSER_PORTAL }],
    });
    expect(uiProblems(both)).toEqual([
      "It lists the UI plugin 'composer-portal' and leaves it out (`interface.composer_portal_disabled`): say one.",
    ]);
    expect(uiProblems(leftOut(research()))).toEqual([]);
    const written = dumpAppspec(research());
    expect(
      checkAppspec({
        ...written,
        interface: {
          ...(written.interface as object),
          composer_portal_disabled: 'yes',
        },
      }).problems,
    ).toContain('interface.composer_portal_disabled: is true or false.');
  });
});
