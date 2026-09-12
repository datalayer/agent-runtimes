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
} from '../codeSandboxEnvironments';

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

  it('never opens a launcher on an entry that cannot be launched', () => {
    const unbuilt = mine({ availableVariants: ['e2b'] });
    expect(
      firstLaunchableCodeSandboxEnvironment([unbuilt, platform()])?.name,
    ).toBe('python-cpu-env');
  });
});
