/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { PathExt } from '@jupyterlab/coreutils';
import { SessionContext } from '@jupyterlab/apputils';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { IMultiServiceManager } from '../../stateful/runtimes';
import { IRuntimeLocation, IRuntimeDesc } from '../../models';

const ASSIGN_NEW_RUNTIME_LABEL = 'Assign a new Runtime';

const ASSIGN_EXISTING_REMOTE_RUNTIME_LABEL =
  'Assign an existing Remote Runtime';

const ASSIGN_EXISTING_RUNTIME_LABEL = 'Assign an existing Runtime';

export type IDatalayerRuntimeDesc = IRuntimeDesc & {
  gpu?: string;
};

/**
 * Create the grouped runtime descriptions.
 */
export function getGroupedRuntimeDescs(
  multiServiceManager: IMultiServiceManager,
  kernelId?: string,
  translator?: ITranslator,
  filterKernels: (desc: IDatalayerRuntimeDesc) => boolean = () => true,
  variant?: 'document' | 'cell',
): { [g: string]: IDatalayerRuntimeDesc[] } | undefined {
  translator = translator ?? nullTranslator;
  const trans = translator.load('jupyterlab');
  const specs = multiServiceManager.local.kernelspecs.specs!;
  const sessions = multiServiceManager.local.sessions.running();
  const kernels: { [g: string]: IDatalayerRuntimeDesc[] } = {};
  // Add the sessions.
  const runningSessions = Array.from(sessions)
    .filter(
      session =>
        session.kernel &&
        session.kernel.id !== kernelId &&
        specs.kernelspecs[session.kernel!.name],
    )
    .map(session => {
      const spec = specs.kernelspecs[session.kernel!.name];
      return {
        kernelId: session.kernel!.id,
        name: spec!.name,
        language: spec!.language,
        displayName: session.name || PathExt.basename(session.path),
        location: 'local' as IRuntimeLocation,
      };
    })
    .concat(
      Array.from(multiServiceManager.browser?.sessions.running() ?? [])
        .filter(session => session.kernel && session.kernel.id !== kernelId)
        .map(session => {
          const spec =
            multiServiceManager.browser!.kernelspecs.specs!.kernelspecs[
              session.kernel!.name
            ];
          return {
            id: '', // TODO Assign a proper ID.
            kernelId: session.kernel!.id,
            name: spec!.name,
            language: spec!.language,
            displayName: session.name || PathExt.basename(session.path),
            location: 'browser' as IRuntimeLocation,
          } satisfies IDatalayerRuntimeDesc;
        }),
    )
    .filter(filterKernels);
  // Add the running runtimes.
  const listedAsSession = runningSessions.map(s => s.kernelId);
  const runningKernels = Array.from(multiServiceManager.local.kernels.running())
    .filter(k => !listedAsSession.includes(k.id))
    .map(k => {
      const spec = specs.kernelspecs[k.name];
      return {
        kernelId: k.id,
        name: spec!.name,
        language: spec!.language,
        displayName: spec!.display_name,
        location: 'local' as IRuntimeLocation,
      };
    })
    .concat(
      (multiServiceManager.remote?.runtimesManager.get() ?? [])
        .filter(k => k.id && !listedAsSession.includes(k.id))
        .map(runtime => {
          const environment = multiServiceManager
            .remote!.environments.get()
            .find(env => env.name === runtime.environment_name)!;
          return {
            kernelId: runtime.id,
            name: environment!.name,
            language: environment!.language,
            displayName: runtime.given_name ?? environment!.title,
            location: 'remote' as IRuntimeLocation,
            podName: runtime.pod_name,
            gpu: environment.resources?.['nvidia.com/gpu'],
          } satisfies IDatalayerRuntimeDesc;
        }),
    )
    .concat(
      Array.from(multiServiceManager.browser?.kernels.running() ?? [])
        .filter(k => !listedAsSession.includes(k.id))
        .map(k => {
          const spec =
            multiServiceManager.browser!.kernelspecs.specs!.kernelspecs[
              k.name
            ]!;
          return {
            kernelId: k.id,
            name: spec!.name,
            language: spec!.language,
            displayName: spec!.display_name,
            location: 'browser' as IRuntimeLocation,
          } satisfies IDatalayerRuntimeDesc;
        }),
    )
    .filter(filterKernels);
  runningSessions.push(...runningKernels);
  if (runningSessions.length) {
    const key =
      variant === 'cell'
        ? ASSIGN_EXISTING_REMOTE_RUNTIME_LABEL
        : ASSIGN_EXISTING_RUNTIME_LABEL;
    kernels[key] = runningSessions;
  }
  // Environments.
  const environments = Object.values(specs.kernelspecs)
    .filter(spec => !!spec)
    .map(
      spec =>
        ({
          name: spec!.name,
          language: spec!.language,
          displayName: spec!.display_name,
          gpu: spec!.resources?.['nvidia.com/gpu'],
          location: 'local' as IRuntimeLocation,
        }) as IDatalayerRuntimeDesc,
    )
    .filter(filterKernels);
  environments.push(
    ...(multiServiceManager.remote?.environments
      .get()
      .map(
        spec =>
          ({
            name: spec!.name,
            language: spec!.language,
            displayName: spec!.title,
            location: 'remote' as IRuntimeLocation,
            gpu: spec!.resources?.['nvidia.com/gpu'],
            burningRate: spec!.burning_rate,
          }) satisfies IDatalayerRuntimeDesc,
      )
      .filter(filterKernels) ?? []),
  );
  environments.push(
    ...Object.values(
      multiServiceManager.browser?.kernelspecs.specs?.kernelspecs ?? {},
    )
      .filter(spec => !!spec)
      .map(
        spec =>
          ({
            name: spec!.name,
            language: spec!.language,
            displayName: spec!.display_name,
            location: 'browser' as IRuntimeLocation,
          }) satisfies IDatalayerRuntimeDesc,
      )
      .filter(filterKernels),
  );
  if (environments.length) {
    kernels[trans.__(ASSIGN_NEW_RUNTIME_LABEL)] = environments;
  }
  return kernels;
}

/**
 * Get the default kernel name given a selector.
 */
export function getDefaultKernelName(
  selector: SessionContext.IKernelSearch,
): string | null {
  const { specs, preference } = selector;
  const { name, language, canStart, autoStartDefault } = preference;
  if (!specs || canStart === false) {
    return null;
  }
  const defaultName = autoStartDefault ? specs.default : null;
  if (!name && !language) {
    return defaultName;
  }
  // Look for an exact match of a spec name.
  for (const specName in specs.kernelspecs) {
    if (specName === name) {
      return name;
    }
  }
  // Bail if there is no language.
  if (!language) {
    return defaultName;
  }
  // Check for a single kernel matching the language.
  const matches: string[] = [];
  for (const specName in specs.kernelspecs) {
    const kernelLanguage = specs.kernelspecs[specName]?.language;
    if (language === kernelLanguage) {
      matches.push(specName);
    }
  }
  if (matches.length === 1) {
    const specName = matches[0];
    console.warn(
      'No exact match found for ' +
        specName +
        ', using runtime ' +
        specName +
        ' that matches ' +
        'language=' +
        language,
    );
    return specName;
  }
  // No matches found.
  return defaultName;
}
