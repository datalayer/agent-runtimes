/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The UI specs and the Reactor plugins they say, held to each other both
 * ways.
 *
 * Each UI spec of the catalogue (`agentspecs/ui`, `src/specs/ui.ts`) is one
 * plugin of `src/apps/plugins/`: built on a reactor and started, the plugin
 * registers under the name the spec says, fills the Slots it says,
 * contributes to the Contribution Points it says, adds the Commands it says,
 * offers the Contribution Points it says and takes the settings it says —
 * nothing more and nothing less. And every plugin folder has a UI spec, or a
 * reason it has none (`NOT_UI`): a plugin added to the Loop editor without
 * its spec, or a spec whose plugin went, fails here.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The toolbar's items reach for `@datalayer/jupyter-react`, mocked in the
// setup without them: what is held here is the toolbar's registration.
vi.mock('../plugins/notebook-toolbar/items', () => ({
  notebookToolbarItems: () => [],
}));

import { listUI } from '../../specs/ui';
import { UI_RENDERER_CATALOGUE } from '../../specs/uiRenderers';
import { uiManifestMetadataOf, uiManifestOfSpec } from '../uiManifest';
import {
  FIXTURE_APP,
  NOT_UI,
  PACKAGE_NAME,
  mountOf,
  registrationOf,
} from './fixtures/uiPluginRegistrations';

const PLUGINS_DIR = join(__dirname, '..', 'plugins');

const folders = readdirSync(PLUGINS_DIR).filter(entry =>
  statSync(join(PLUGINS_DIR, entry)).isDirectory(),
);

const sorted = (values: readonly string[]): string[] => [...values].sort();

describe('the UI specs and the plugin folders', () => {
  it('give every folder a UI spec, or a reason it has none — never both', () => {
    const specified = listUI().map(spec => spec.folder);
    for (const folder of folders) {
      const has = specified.includes(folder);
      expect(
        has !== folder in NOT_UI,
        `${folder}: ${has ? 'has a UI spec and a reason not to' : 'has neither a UI spec nor a reason'}`,
      ).toBe(true);
    }
    for (const folder of [...specified, ...Object.keys(NOT_UI)]) {
      expect(folders, `no plugin folder ${folder}`).toContain(folder);
    }
  });

  it('say where each plugin is: this package, the module of its folder, an export', () => {
    for (const spec of listUI()) {
      expect(spec.implementation.package, spec.id).toBe(PACKAGE_NAME);
      expect(spec.implementation.module, spec.id).toBe(
        `lib/apps/plugins/${spec.folder}`,
      );
      expect(spec.implementation.export, spec.id).toMatch(/^[A-Za-z_$][\w$]*$/);
    }
  });

  it('name only renderers of the catalogue', () => {
    for (const spec of listUI()) {
      for (const renderer of spec.renderers) {
        expect(
          UI_RENDERER_CATALOGUE[renderer],
          `${spec.id}: ${renderer}`,
        ).toBeDefined();
      }
    }
  });
});

describe.each(listUI().map(spec => [spec.id, spec] as const))(
  'the UI spec %s',
  (_id, spec) => {
    it('is its plugin as the reactor registers it', async () => {
      const registration = await registrationOf(await mountOf(spec));
      if (spec.per === undefined) {
        expect(registration.names).toEqual([spec.plugin]);
      } else {
        expect(registration.names.length).toBeGreaterThan(0);
        for (const name of registration.names) {
          expect(name.startsWith(`${spec.plugin}-`), name).toBe(true);
        }
        if (spec.per === 'application') {
          expect(registration.names).toEqual([
            `${spec.plugin}-${FIXTURE_APP.id}`,
          ]);
        }
      }
      expect(sorted(spec.contributions.slots)).toEqual(registration.slots);
      expect(sorted(spec.contributions.points)).toEqual(registration.points);
      expect(sorted(spec.contributions.commands)).toEqual(
        registration.commands,
      );
      expect(sorted(spec.contributionPoints)).toEqual(
        registration.contributionPoints,
      );
      const properties = (spec.settings.properties ?? {}) as Record<
        string,
        { default?: unknown }
      >;
      expect(sorted(Object.keys(properties))).toEqual(
        sorted(Object.keys(registration.settings)),
      );
      for (const [key, value] of Object.entries(registration.settings)) {
        expect(properties[key].default, `${spec.id}.${key}`).toEqual(value);
      }
    });
    it("is what its export's manifest says", async () => {
      const registration = await registrationOf(await mountOf(spec));
      const expected = uiManifestOfSpec(spec);
      expect(registration.manifests.length).toBeGreaterThan(0);
      for (const manifest of registration.manifests) {
        const name = manifest.name;
        expect(manifest.package, name).toBe(spec.implementation.package);
        expect(uiManifestMetadataOf(manifest), name).toEqual(
          uiManifestMetadataOf(expected),
        );
        expect(sorted(manifest.slots), name).toEqual(
          sorted(spec.contributions.slots),
        );
        expect(sorted(manifest.contributesTo), name).toEqual(
          sorted(spec.contributions.points),
        );
        expect(sorted(manifest.commands), name).toEqual(
          sorted(spec.contributions.commands),
        );
        expect(manifest.configSchema, name).toEqual(expected.configSchema);
        // A plugin registered per instance presents itself by its instance.
        if (spec.per === undefined) {
          expect(manifest.displayName, name).toBe(spec.name);
          expect(manifest.description, name).toBe(spec.description);
          expect(manifest.emoji, name).toBe(spec.emoji);
          if (spec.octicon) {
            expect(manifest.octicon, name).toBe(spec.octicon);
          }
        }
      }
      // What it declares is what it registers.
      const declared = (key: 'slots' | 'contributesTo' | 'commands') =>
        sorted([
          ...new Set(registration.manifests.flatMap(manifest => manifest[key])),
        ]);
      expect(declared('slots')).toEqual(registration.slots);
      expect(declared('contributesTo')).toEqual(registration.points);
      expect(declared('commands')).toEqual(registration.commands);
    });
  },
);
