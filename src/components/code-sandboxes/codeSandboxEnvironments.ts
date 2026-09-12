/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the environment dropdown says about an environment, as rules.
 *
 * The listing now holds two kinds of thing: the platform's environments, which
 * have always been there, and the environments people build (PLAN_ENV.md,
 * E1-01). They are told apart, grouped, priced and — where a variant was never
 * built — refused here rather than in the components, so the launcher and the
 * picker cannot come to different conclusions about the same entry, and so the
 * rules can be read and tested without a DOM.
 *
 * Nothing in this module writes a rate: the burning rate of a user environment
 * is the rate of the size class its promoted version names, and the listing
 * carries it (D-4, E1-19).
 *
 * @module components/code-sandboxes/codeSandboxEnvironments
 */

import type { IDatalayerEnvironment } from '../../models';
import type { ICodeSandboxEnvironmentOption } from './CodeSandboxEnvironmentSelect';

/**
 * The variant a sandbox of THIS platform starts on.
 *
 * A user environment may be built for Modal, Daytona or E2B as well; those
 * sandboxes are launched at their provider, not from this dropdown, so what
 * decides whether an entry can be launched here is the Datalayer artifact.
 */
export const DATALAYER_LAUNCH_VARIANT = 'datalayer';

/** Where an entry is listed. */
export type CodeSandboxEnvironmentGroup =
  | 'yours'
  | 'organizations'
  | 'platform';

/** The heading each group reads under. */
export const CODE_SANDBOX_ENVIRONMENT_GROUP_TITLES: Record<
  CodeSandboxEnvironmentGroup,
  string
> = {
  yours: 'Your environments',
  organizations: "Your organizations' environments",
  platform: 'Platform environments',
};

/** The order the groups are offered in: what is yours first, the platform last. */
export const CODE_SANDBOX_ENVIRONMENT_GROUP_ORDER: CodeSandboxEnvironmentGroup[] =
  ['yours', 'organizations', 'platform'];

/** Who is looking: an account uid and a handle, as the IAM store holds them. */
export type ICodeSandboxEnvironmentViewer = {
  uid?: string;
  handle?: string;
};

/**
 * Which group an entry belongs to.
 *
 * A platform entry says so with its `origin`. A user environment is the
 * caller's own when the account that owns it is theirs — by uid, or by the
 * handle its name is written with, `ada/geo`, since that is all an entry
 * carries when the uid is not at hand. Everything else a caller can see is an
 * environment of one of their organizations: the listing only ever offers them
 * their own accounts' (D-19).
 */
export function codeSandboxEnvironmentGroupOf(
  environment: Pick<IDatalayerEnvironment, 'name' | 'origin' | 'owner'>,
  viewer?: ICodeSandboxEnvironmentViewer,
): CodeSandboxEnvironmentGroup {
  if (environment.origin !== 'user') {
    return 'platform';
  }
  const handle = viewer?.handle;
  const mine =
    (!!viewer?.uid && environment.owner === viewer.uid) ||
    (!!handle && environment.name.startsWith(`${handle}/`));
  return mine ? 'yours' : 'organizations';
}

/** The version a launch of this entry runs, when it is a version anyone pinned. */
export function codeSandboxEnvironmentVersion(
  environment: Pick<IDatalayerEnvironment, 'origin' | 'promotedVersion'>,
): number | undefined {
  if (environment.origin !== 'user') {
    return undefined;
  }
  return environment.promotedVersion?.version;
}

/** The address of a version's page (E1-21), where its builds are. */
export function environmentVersionHref(uid: string, version?: number): string {
  return version === undefined
    ? `/environments/${uid}/versions`
    : `/environments/${uid}/versions/${version}`;
}

/**
 * Whether a sandbox of this entry can be started from here.
 *
 * A platform entry always can. A user environment can once a version is
 * promoted AND that version has a Datalayer artifact: without one the Operator
 * refuses the launch with `DL_ENV_ARTIFACT_MISSING`, so offering it would be
 * offering a failure. A listing that does not say which variants are built —
 * an older Runtimes — is believed rather than doubted: the entry stays
 * offered, and the refusal, if any, comes from the platform as it did before.
 */
export function isCodeSandboxEnvironmentLaunchable(
  environment: Pick<
    IDatalayerEnvironment,
    'origin' | 'promotedVersion' | 'availableVariants' | 'burning_rate'
  >,
): boolean {
  if (environment.origin !== 'user') {
    return true;
  }
  if (!environment.promotedVersion) {
    return false;
  }
  const available = environment.availableVariants;
  if (available === undefined) {
    return true;
  }
  if (!available.includes(DATALAYER_LAUNCH_VARIANT)) {
    return false;
  }
  /*
   * And it has to be priceable. A launch reserves credits before anything
   * starts, so an entry whose size class carries no rate cannot be launched
   * from here at all — offering it would reserve nothing and be refused by the
   * platform, which reads to the user as the sandbox failing for no reason.
   */
  return !!environment.burning_rate;
}

/**
 * Where "Build for this variant" leads: the version's own page, which is where
 * a build of it is started. Only offered for an entry that has a version to
 * build, and only when the entry cannot be launched as it stands.
 */
export function codeSandboxEnvironmentBuildHref(
  environment: Pick<
    IDatalayerEnvironment,
    'uid' | 'origin' | 'promotedVersion' | 'availableVariants'
  >,
): string | undefined {
  if (environment.origin !== 'user' || !environment.uid) {
    return undefined;
  }
  const available = environment.availableVariants;
  /*
   * Only where a BUILD is the thing that is missing. An entry that has its
   * artifact and cannot be launched for another reason — an unpriced size
   * class — is not made better by building it again, and an older Runtimes,
   * which says nothing about artifacts, is not second-guessed.
   */
  if (available === undefined || available.includes(DATALAYER_LAUNCH_VARIANT)) {
    return undefined;
  }
  return environmentVersionHref(
    environment.uid,
    codeSandboxEnvironmentVersion(environment),
  );
}

/** One entry as the dropdown shows it: what it is, what it costs, and whether it can run. */
export function codeSandboxEnvironmentOption(
  environment: IDatalayerEnvironment,
  viewer?: ICodeSandboxEnvironmentViewer,
  extra: Partial<ICodeSandboxEnvironmentOption> = {},
): ICodeSandboxEnvironmentOption {
  const group = codeSandboxEnvironmentGroupOf(environment, viewer);
  const version = codeSandboxEnvironmentVersion(environment);
  return {
    key: environment.name,
    title: environment.title || environment.name,
    name: environment.name,
    group: CODE_SANDBOX_ENVIRONMENT_GROUP_TITLES[group],
    version: version === undefined ? undefined : `v${version}`,
    sizeClass: environment.sizeClass || undefined,
    burningRate: environment.burning_rate,
    gpu: environment.resources?.['nvidia.com/gpu'],
    disabled: !isCodeSandboxEnvironmentLaunchable(environment),
    buildHref: codeSandboxEnvironmentBuildHref(environment),
    ...extra,
  };
}

/**
 * The entries of the dropdown, in the order they read: what is yours, then
 * your organizations', then the platform's, each in the order the listing gave
 * them.
 */
export function codeSandboxEnvironmentOptions(
  environments: readonly IDatalayerEnvironment[],
  viewer?: ICodeSandboxEnvironmentViewer,
  decorate?: (
    environment: IDatalayerEnvironment,
  ) => Partial<ICodeSandboxEnvironmentOption>,
): ICodeSandboxEnvironmentOption[] {
  const options = environments.map(environment =>
    codeSandboxEnvironmentOption(
      environment,
      viewer,
      decorate?.(environment) ?? {},
    ),
  );
  return CODE_SANDBOX_ENVIRONMENT_GROUP_ORDER.flatMap(group =>
    options.filter(
      option => option.group === CODE_SANDBOX_ENVIRONMENT_GROUP_TITLES[group],
    ),
  );
}

/** The first entry a launcher may open on: never one that cannot be launched. */
export function firstLaunchableCodeSandboxEnvironment(
  environments: readonly IDatalayerEnvironment[],
): IDatalayerEnvironment | undefined {
  return environments.find(isCodeSandboxEnvironmentLaunchable);
}
