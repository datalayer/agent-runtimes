/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The UI plugins' catalogue platform (`apps/uiPluginCatalogue`): every UI
 * spec a lazy plugin on a reactor never started, whose manifest — read
 * before any module is fetched — is the one its loaded plugin gives, and
 * whose module is the one its spec's `implementation` names.
 */

import { buildReactorFromPlugins } from '@datalayer/reactor';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../plugins/notebook-toolbar/items', () => ({
  notebookToolbarItems: () => [],
}));

import { listUI } from '../../specs/ui';
import {
  UI_PLUGIN_MODULES,
  loadUiPluginExport,
  uiPluginManifestOf,
  uiPluginManifests,
  uiPluginPlatform,
  uiPluginRefOf,
} from '../uiPluginCatalogue';
import { uiManifestOfSpec } from '../uiManifest';
import {
  exportOf,
  mountOf,
  registrationOf,
} from './fixtures/uiPluginRegistrations';

const sorted = (values: readonly string[]): string[] => [...values].sort();

describe('the UI plugins catalogue platform', () => {
  it('has a module for each UI spec’s folder, and no other', () => {
    expect(sorted(Object.keys(UI_PLUGIN_MODULES))).toEqual(
      sorted(listUI().map(spec => spec.folder)),
    );
  });

  it('lists every UI plugin, none of them loaded', () => {
    const manifests = uiPluginManifests();
    expect(manifests.map(manifest => manifest.ui.id)).toEqual(
      listUI().map(spec => spec.id),
    );
    for (const manifest of manifests) {
      expect(manifest.lazy, manifest.name).toBe(true);
      expect(manifest.loaded, manifest.name).toBe(false);
      expect(manifest.activated, manifest.name).toBe(false);
    }
    expect(uiPluginPlatform()).toBe(uiPluginPlatform());
  });

  it('finds a manifest by its UI spec’s id', () => {
    const [spec] = listUI();
    expect(uiPluginManifestOf(spec.id)?.name).toBe(spec.plugin);
    expect(uiPluginManifestOf('no-such-ui')).toBeUndefined();
  });

  it('refuses to load a list of plugins or a factory into one lazy plugin', async () => {
    const spec = listUI().find(each => each.implementation.kind !== 'plugin');
    expect(spec).toBeDefined();
    await expect(uiPluginRefOf(spec!).load()).rejects.toThrow(
      /mounted by its host/,
    );
  });
});

describe.each(listUI().map(spec => [spec.id, spec] as const))(
  'the UI plugin %s, listed before it loads',
  (_id, spec) => {
    it('says what its spec says', () => {
      const manifest = uiPluginManifestOf(spec.id)!;
      const expected = uiManifestOfSpec(spec);
      expect(manifest.name).toBe(spec.plugin);
      expect(manifest.displayName).toBe(expected.displayName);
      expect(manifest.description).toBe(expected.description);
      expect(manifest.emoji).toBe(expected.emoji);
      expect(manifest.octicon).toBe(expected.octicon);
      expect(manifest.package).toBe(expected.package);
      expect(manifest.configSchema).toEqual(expected.configSchema);
      expect(manifest.metadata).toEqual(expected.metadata);
      expect(sorted(manifest.slots)).toEqual(sorted(spec.contributions.slots));
      expect(sorted(manifest.contributesTo)).toEqual(
        sorted(spec.contributions.points),
      );
      expect(sorted(manifest.commands)).toEqual(
        sorted(spec.contributions.commands),
      );
    });

    it('is what its loaded plugin’s manifest says', async () => {
      const listed = uiPluginManifestOf(spec.id)!;
      const registration = await registrationOf(await mountOf(spec));
      for (const loaded of registration.manifests) {
        expect(loaded.package, loaded.name).toBe(listed.package);
        expect(loaded.configSchema, loaded.name).toEqual(listed.configSchema);
        expect(loaded.metadata, loaded.name).toEqual(listed.metadata);
        expect(sorted(loaded.slots), loaded.name).toEqual(sorted(listed.slots));
        expect(sorted(loaded.contributesTo), loaded.name).toEqual(
          sorted(listed.contributesTo),
        );
        expect(sorted(loaded.commands), loaded.name).toEqual(
          sorted(listed.commands),
        );
        // A plugin registered per instance presents itself by its instance.
        if (spec.per === undefined) {
          expect(loaded.name).toBe(listed.name);
          expect(loaded.displayName).toBe(listed.displayName);
          expect(loaded.description).toBe(listed.description);
          expect(loaded.emoji).toBe(listed.emoji);
          expect(loaded.octicon).toBe(listed.octicon);
        }
      }
    });

    it('loads the module its implementation names', async () => {
      expect(await loadUiPluginExport(spec)).toBe(await exportOf(spec));
    });

    if (spec.implementation.kind === 'plugin') {
      it('loads into the plugin itself on a reactor', async () => {
        const reactor = buildReactorFromPlugins([uiPluginRefOf(spec)]);
        expect(reactor.getManifest(spec.plugin)?.loaded).toBe(false);
        const loaded = await uiPluginRefOf(spec).load();
        expect(loaded).toBe(await exportOf(spec));
      });
    }
  },
);
