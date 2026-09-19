/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the environment dropdown offers, and what it refuses (PLAN_ENV.md, E1-19).
 *
 * The rules live in a module of their own so they can be read without a DOM,
 * and so the launcher and the picker cannot disagree about the same entry.
 */

import { describe, expect, it } from 'vitest';
import type { IDatalayerEnvironment } from '../../../models';
import {
  CODE_SANDBOX_ENVIRONMENT_GROUP_TITLES,
  codeSandboxEnvironmentBuildHref,
  codeSandboxEnvironmentGroupOf,
  codeSandboxEnvironmentOption,
  codeSandboxEnvironmentOptions,
  codeSandboxEnvironmentVersion,
  environmentVersionHref,
  firstLaunchableCodeSandboxEnvironment,
  isCodeSandboxEnvironmentLaunchable,
  libraryEnvironmentOf,
} from '../codeSandboxEnvironments';
import type { IEnvironmentPublicationRecord } from '../../../models';

const VIEWER = { uid: '01ADA', handle: 'ada' };

/** A user environment of `ada`, ready to launch, with everything it needs. */
const mine = (
  over: Partial<IDatalayerEnvironment> = {},
): IDatalayerEnvironment =>
  ({
    name: 'ada/geo',
    title: 'Geospatial',
    language: 'python',
    uid: '01ENV',
    origin: 'user',
    owner: '01ADA',
    promotedVersion: { uid: '01VER', version: 2, status: 'ready' },
    variants: ['datalayer', 'e2b'],
    availableVariants: ['datalayer'],
    sizeClass: 'small',
    burning_rate: 0.0008,
    ...over,
  }) as unknown as IDatalayerEnvironment;

/** A platform environment, as the listing has always carried them. */
const platform = (
  over: Partial<IDatalayerEnvironment> = {},
): IDatalayerEnvironment =>
  ({
    name: 'python-cpu-env',
    title: 'Python CPU',
    language: 'python',
    origin: 'platform',
    burning_rate: 0.008,
    ...over,
  }) as unknown as IDatalayerEnvironment;

/** A published environment reached through the Library, owned by a stranger. */
const library = (
  over: Partial<IDatalayerEnvironment> = {},
): IDatalayerEnvironment =>
  ({
    name: 'grace/vision',
    title: 'Vision',
    language: 'python',
    uid: '01LIB',
    origin: 'user',
    owner: '01GRACE',
    fromLibrary: true,
    promotedVersion: { uid: '01LIBVER', version: 3, status: 'ready' },
    variants: ['datalayer'],
    availableVariants: ['datalayer'],
    sizeClass: 'small',
    burning_rate: 0.0008,
    ...over,
  }) as unknown as IDatalayerEnvironment;

describe('which group an entry reads under', () => {
  it('puts the platform last and what is yours first', () => {
    expect(codeSandboxEnvironmentGroupOf(platform(), VIEWER)).toBe('platform');
    expect(codeSandboxEnvironmentGroupOf(mine(), VIEWER)).toBe('yours');
  });

  it('knows yours by your uid or by the handle the name carries', () => {
    const byHandle = mine({ owner: '01SOMEONE' });
    expect(codeSandboxEnvironmentGroupOf(byHandle, VIEWER)).toBe('yours');
    expect(codeSandboxEnvironmentGroupOf(byHandle, { uid: '01OTHER' })).toBe(
      'organizations',
    );
  });

  it("calls anything else your organizations'", () => {
    expect(
      codeSandboxEnvironmentGroupOf(
        mine({ name: 'lab/geo', owner: '01LAB' }),
        VIEWER,
      ),
    ).toBe('organizations');
  });

  it('lists a published environment reached through the Library on its own', () => {
    /* A published environment is offered where a reader who came from its
       public page looks for it, whoever owns it (D-12, E2-16). */
    expect(codeSandboxEnvironmentGroupOf(library(), VIEWER)).toBe('library');
    expect(
      codeSandboxEnvironmentGroupOf(library({ owner: '01OTHER' }), {
        uid: '01OTHER',
      }),
    ).toBe('library');
  });
});

describe('what an entry says about itself', () => {
  it('shows the promoted version of a user environment, and none for the platform', () => {
    expect(codeSandboxEnvironmentVersion(mine())).toBe(2);
    expect(codeSandboxEnvironmentVersion(platform())).toBeUndefined();
  });

  it('carries the size class and the rate the listing gave', () => {
    const option = codeSandboxEnvironmentOption(mine(), VIEWER);
    expect(option).toMatchObject({
      name: 'ada/geo',
      title: 'Geospatial',
      group: CODE_SANDBOX_ENVIRONMENT_GROUP_TITLES.yours,
      version: 'v2',
      sizeClass: 'small',
      burningRate: 0.0008,
      disabled: false,
    });
    expect(option.buildHref).toBeUndefined();
  });
});

describe('what can be launched from here', () => {
  it('launches a platform entry always', () => {
    expect(isCodeSandboxEnvironmentLaunchable(platform())).toBe(true);
  });

  it('refuses a user environment with nothing promoted', () => {
    expect(
      isCodeSandboxEnvironmentLaunchable(mine({ promotedVersion: undefined })),
    ).toBe(false);
  });

  it('refuses one whose Datalayer artifact was never built, and offers the build', () => {
    const unbuilt = mine({ availableVariants: ['e2b'] });
    expect(isCodeSandboxEnvironmentLaunchable(unbuilt)).toBe(false);
    expect(codeSandboxEnvironmentBuildHref(unbuilt)).toBe(
      environmentVersionHref('01ENV', 2),
    );
    expect(codeSandboxEnvironmentOption(unbuilt, VIEWER).disabled).toBe(true);
  });

  it('refuses one whose size class carries no rate, and does not offer a build', () => {
    /* A launch reserves credits before anything starts, so an unpriced entry
       would be refused by the platform and read as a sandbox failing. */
    const unpriced = mine({
      burning_rate: 0,
    } as Partial<IDatalayerEnvironment>);
    expect(isCodeSandboxEnvironmentLaunchable(unpriced)).toBe(false);
    expect(codeSandboxEnvironmentBuildHref(unpriced)).toBeUndefined();
  });

  it('believes a listing that says nothing about artifacts', () => {
    /* An older Runtimes is not second-guessed: the entry stays offered and the
       platform refuses it if it must, as it did before. */
    const older = mine({ availableVariants: undefined });
    expect(isCodeSandboxEnvironmentLaunchable(older)).toBe(true);
  });
});

describe('the order the dropdown reads in', () => {
  it('is yours, your organizations, then the platform', () => {
    const entries = [
      platform(),
      mine({ name: 'lab/geo', owner: '01LAB' }),
      mine(),
    ];
    expect(
      codeSandboxEnvironmentOptions(entries, VIEWER).map(option => option.name),
    ).toEqual(['ada/geo', 'lab/geo', 'python-cpu-env']);
  });

  it('sets the Library between your organizations and the platform', () => {
    const entries = [
      platform(),
      library(),
      mine({ name: 'lab/geo', owner: '01LAB' }),
      mine(),
    ];
    expect(
      codeSandboxEnvironmentOptions(entries, VIEWER).map(option => option.name),
    ).toEqual(['ada/geo', 'lab/geo', 'grace/vision', 'python-cpu-env']);
  });

  it('never opens a launcher on an entry that cannot be launched', () => {
    const unbuilt = mine({ availableVariants: ['e2b'] });
    expect(
      firstLaunchableCodeSandboxEnvironment([unbuilt, platform()])?.name,
    ).toBe('python-cpu-env');
  });
});

describe('a publication offered to a stranger (E2-19)', () => {
  const publication = (
    changes: Partial<IEnvironmentPublicationRecord> = {},
  ): IEnvironmentPublicationRecord =>
    ({
      versionUid: '01VERSION',
      environmentUid: '01ENVIRONMENT',
      ownerUid: '01SOMEBODYELSE',
      status: 'published',
      publishedBy: '01SOMEBODYELSE',
      publishedAt: '2026-09-19T03:01:58Z',
      updatedAt: '2026-09-19T03:01:58Z',
      burningRate: 0.0008,
      etag: '1',
      snapshot: {
        environmentUid: '01ENVIRONMENT',
        environmentName: 'backfill-drill',
        title: 'Backfill drill',
        ownerUid: '01SOMEBODYELSE',
        versionUid: '01VERSION',
        versionNumber: 2,
        spec: { spec: { language: { name: 'python' } } },
        lock: {},
        sbomRef: '',
        scanSummary: {},
        licenses: [],
        sizeClass: 'small',
        variants: { datalayer: {}, daytona: {} },
        readme: '',
      },
      ...changes,
    }) as unknown as IEnvironmentPublicationRecord;

  it('launches by environment uid, at the version the publication froze', () => {
    const entry = libraryEnvironmentOf(publication())!;
    expect(entry.name).toBe('01ENVIRONMENT');
    expect(codeSandboxEnvironmentVersion(entry)).toBe(2);
  });

  it('is listed under Library, whoever owns it', () => {
    const entry = libraryEnvironmentOf(publication())!;
    expect(codeSandboxEnvironmentGroupOf(entry, VIEWER)).toBe('library');
    expect(CODE_SANDBOX_ENVIRONMENT_GROUP_TITLES.library).toBe('Library');
  });

  it('is priced by the rate the publication carries, and launchable only when it has one', () => {
    expect(libraryEnvironmentOf(publication())!.burning_rate).toBe(0.0008);
    expect(
      isCodeSandboxEnvironmentLaunchable(libraryEnvironmentOf(publication())!),
    ).toBe(true);
    const unpriced = libraryEnvironmentOf(publication({ burningRate: null }))!;
    expect(isCodeSandboxEnvironmentLaunchable(unpriced)).toBe(false);
  });

  it('is not offered once it has been withdrawn', () => {
    expect(
      libraryEnvironmentOf(publication({ status: 'unpublished' })),
    ).toBeUndefined();
  });
});
