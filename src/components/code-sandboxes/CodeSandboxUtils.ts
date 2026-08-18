/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { SessionContext } from '@jupyterlab/apputils';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { IMultiServiceManager } from '../../runtimes';
import { IRuntimeLocation, IRuntimeDesc } from '../../models';

const ASSIGN_NEW_RUNTIME_LABEL = 'Assign a new Code Sandbox';

import { loadJupyterConfig } from '@datalayer/jupyter-react';
import { ensureCodeSandboxGivenName } from './CodeSandboxNames';

const ASSIGN_EXISTING_REMOTE_RUNTIME_LABEL =
  'Assign an existing Remote Code Sandbox';

const ASSIGN_EXISTING_RUNTIME_LABEL = 'Assign an existing Code Sandbox';

export type IDatalayerCodeSandboxDesc = IRuntimeDesc & {
  gpu?: string;
};

/**
 * Create the grouped runtime descriptions.
 */
export function getGroupedCodeSandboxDescs(
  multiServiceManager: IMultiServiceManager,
  kernelId?: string,
  translator?: ITranslator,
  filterKernels: (desc: IDatalayerCodeSandboxDesc) => boolean = () => true,
  variant?: 'document' | 'cell',
): { [g: string]: IDatalayerCodeSandboxDesc[] } | undefined {
  translator = translator ?? nullTranslator;
  const trans = translator.load('jupyterlab');
  // The specifications land asynchronously, and a runtime that already runs
  // is listed with or without them: what a kernel needs to be picked is its
  // identifier, the specification only names it. Only the environments to
  // start a new runtime in come from the specifications, and they wait.
  const specs = multiServiceManager.local.kernelspecs.specs;
  const sessions = multiServiceManager.local.sessions.running();
  const kernels: { [g: string]: IDatalayerCodeSandboxDesc[] } = {};
  // Add the sessions.
  const runningSessions = Array.from(sessions)
    .filter(session => session.kernel && session.kernel.id !== kernelId)
    .map(session => {
      const spec = specs?.kernelspecs[session.kernel!.name];
      return {
        kernelId: session.kernel!.id,
        name: spec?.name ?? session.kernel!.name,
        language: spec?.language ?? '',
        displayName: ensureCodeSandboxGivenName(
          session.kernel!.id,
          spec?.display_name ?? session.kernel!.name
        ),
        location: 'local' as IRuntimeLocation,
      };
    })
    .concat(
      Array.from(multiServiceManager.browser?.sessions.running() ?? [])
        .filter(session => session.kernel && session.kernel.id !== kernelId)
        .map(session => {
          // The browser specifications load on their own schedule.
          const spec =
            multiServiceManager.browser?.kernelspecs.specs?.kernelspecs[
              session.kernel!.name
            ];
          return {
            id: '', // TODO Assign a proper ID.
            kernelId: session.kernel!.id,
            name: spec?.name ?? session.kernel!.name,
            language: spec?.language ?? '',
            displayName: ensureCodeSandboxGivenName(
              session.kernel!.id,
              spec?.display_name ?? session.kernel!.name
            ),
            location: 'browser' as IRuntimeLocation,
          } satisfies IDatalayerCodeSandboxDesc;
        }),
    )
    .filter(filterKernels);
  // Add the running runtimes.
  const listedAsSession = runningSessions.map(s => s.kernelId);
  const runningKernels = Array.from(multiServiceManager.local.kernels.running())
    .filter(k => !listedAsSession.includes(k.id))
    .map(k => {
      const spec = specs?.kernelspecs[k.name];
      return {
        kernelId: k.id,
        name: spec?.name ?? k.name,
        language: spec?.language ?? '',
        displayName: ensureCodeSandboxGivenName(
          k.id,
          spec?.display_name ?? k.name
        ),
        location: 'local' as IRuntimeLocation,
      };
    })
    .concat(
      (multiServiceManager.remote?.runtimesManager.get() ?? [])
        .filter(k => k.id && !listedAsSession.includes(k.id))
        .map(runtime => {
          const environment = multiServiceManager
            .remote!.environments.get()
            .find(env => env.name === runtime.environment.name)!;
          return {
            kernelId: runtime.id,
            name: environment!.name,
            language: environment!.language,
            displayName:
              // The name it was GIVEN first: the title of the environment is
              // what it runs, and every sandbox of that environment answers
              // it — the launcher asks for a name precisely so two of them
              // can be told apart here.
              runtime.given_name || environment!.title || environment!.name,
            location: 'remote' as IRuntimeLocation,
            podName: runtime.pod_name,
            gpu: environment.resources?.['nvidia.com/gpu'],
          } satisfies IDatalayerCodeSandboxDesc;
        }),
    )
    .concat(
      Array.from(multiServiceManager.browser?.kernels.running() ?? [])
        .filter(k => !listedAsSession.includes(k.id))
        .map(k => {
          const spec =
            multiServiceManager.browser?.kernelspecs.specs?.kernelspecs[k.name];
          return {
            kernelId: k.id,
            name: spec?.name ?? k.name,
            language: spec?.language ?? '',
            displayName: ensureCodeSandboxGivenName(
              k.id,
              spec?.display_name ?? k.name
            ),
            location: 'browser' as IRuntimeLocation,
          } satisfies IDatalayerCodeSandboxDesc;
        }),
    )
    .filter(filterKernels);
  runningSessions.push(...runningKernels);
  // The sources overlap — a kernel of a session, a manager standing in for
  // another — and a runtime listed twice would be picked twice.
  const seen = new Set<string>();
  const distinctRunning = runningSessions.filter(desc => {
    const key = `${desc.location}:${desc.kernelId ?? desc.name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  runningSessions.length = 0;
  runningSessions.push(...distinctRunning);
  if (runningSessions.length) {
    const key =
      variant === 'cell'
        ? ASSIGN_EXISTING_REMOTE_RUNTIME_LABEL
        : ASSIGN_EXISTING_RUNTIME_LABEL;
    kernels[key] = runningSessions;
  }
  // Environments.
  const environments = Object.values(specs?.kernelspecs ?? {})
    .filter(spec => !!spec)
    .map(
      spec =>
        ({
          name: spec!.name,
          language: spec!.language,
          displayName: spec!.display_name,
          gpu: spec!.resources?.['nvidia.com/gpu'],
          location: 'local' as IRuntimeLocation,
        }) as IDatalayerCodeSandboxDesc,
    )
    .filter(filterKernels);
  /*
   * Inside JupyterLab, only the sandboxes of this Jupyter Server are offered.
   *
   * The application is running against a server of its own; a sandbox of the
   * platform is started elsewhere, costs credits and belongs to the flows of
   * the web application. Offering both here made "new sandbox" mean two very
   * different things a click apart.
   */
  const insideJupyterLab = loadJupyterConfig().insideJupyterLab;
  const remoteEnvironments = insideJupyterLab
    ? []
    : (multiServiceManager.remote?.environments.get() ?? []);
  environments.push(
    ...remoteEnvironments
      .map(
        spec =>
          ({
            name: spec!.name,
            language: spec!.language,
            displayName: spec!.title,
            location: 'remote' as IRuntimeLocation,
            gpu: spec!.resources?.['nvidia.com/gpu'],
            burningRate: spec!.burning_rate,
          }) satisfies IDatalayerCodeSandboxDesc,
      )
      .filter(filterKernels),
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
          }) satisfies IDatalayerCodeSandboxDesc,
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
