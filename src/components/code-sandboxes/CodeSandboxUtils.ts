/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { SessionContext } from '@jupyterlab/apputils';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { IMultiServiceManager } from '../../runtimes';
import { IRuntimeLocation, IRuntimeDesc } from '../../models';

const ASSIGN_NEW_RUNTIME_LABEL = 'Assign a new Code Sandbox';

import { ensureCodeSandboxGivenName } from './CodeSandboxNames';
import { isCodeSandboxProviderAvailable } from './codeSandboxProviders';
import {
  CodeSandboxVariant,
  codeSandboxVariantOf,
} from '../../models/CodeSandboxVariant';

const ASSIGN_EXISTING_REMOTE_RUNTIME_LABEL =
  'Assign an existing Remote Code Sandbox';

const ASSIGN_EXISTING_RUNTIME_LABEL = 'Assign an existing Code Sandbox';

export type IDatalayerCodeSandboxDesc = IRuntimeDesc & {
  gpu?: string;
  /** The provider the environment belongs to — see `CodeSandboxVariant`. */
  provider?: CodeSandboxVariant;
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
  /*
   * The kernels of a Jupyter Server belong to the page that talks to one —
   * inside JupyterLab. The web application's "local" manager points at
   * whatever server its configuration names, and offering those kernels
   * there lists sandboxes the user never started and cannot reason about.
   * One rule for the whole file: the provider registry answers it, for the
   * existing sandboxes here exactly as for the new-sandbox group below.
   */
  const jupyterProviderAvailable = isCodeSandboxProviderAvailable(
    'local',
    multiServiceManager,
  );
  const sessions = jupyterProviderAvailable
    ? multiServiceManager.local.sessions.running()
    : [];
  const kernels: { [g: string]: IDatalayerCodeSandboxDesc[] } = {};
  // Add the sessions.
  const runningSessions = Array.from(sessions)
    .filter(session => session.kernel && session.kernel.id !== kernelId)
    // Annotated for the same reason as the chain below: what is pushed into
    // this list includes sandboxes that carry a pod rather than a kernel.
    .map((session): IDatalayerCodeSandboxDesc => {
      const spec = specs?.kernelspecs[session.kernel!.name];
      return {
        kernelId: session.kernel!.id,
        name: spec?.name ?? session.kernel!.name,
        language: spec?.language ?? '',
        displayName: ensureCodeSandboxGivenName(
          session.kernel!.id,
          spec?.display_name ?? session.kernel!.name,
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
              spec?.display_name ?? session.kernel!.name,
            ),
            location: 'browser' as IRuntimeLocation,
          } satisfies IDatalayerCodeSandboxDesc;
        }),
    )
    .filter(filterKernels);
  // Add the running runtimes.
  const listedAsSession = runningSessions.map(s => s.kernelId);
  const runningKernels = Array.from(
    jupyterProviderAvailable ? multiServiceManager.local.kernels.running() : [],
  )
    .filter(k => !listedAsSession.includes(k.id))
    // Annotated, because the element type of the chain below is taken from
    // this first link: a sandbox with no kernel joins it further down.
    .map((k): IDatalayerCodeSandboxDesc => {
      const spec = specs?.kernelspecs[k.name];
      return {
        kernelId: k.id,
        name: spec?.name ?? k.name,
        language: spec?.language ?? '',
        displayName: ensureCodeSandboxGivenName(
          k.id,
          spec?.display_name ?? k.name,
        ),
        location: 'local' as IRuntimeLocation,
      };
    })
    .concat(
      (multiServiceManager.remote?.runtimesManager.get() ?? [])
        /*
         * A sandbox with no KERNEL is still a sandbox that runs.
         *
         * The ones of an external provider — Kaggle, Modal — run at their
         * provider and carry no kernel of this platform, so their `id` is
         * empty. Asking for a truthy one dropped every one of them: they
         * appeared in the table of the Code Sandboxes and nowhere in the
         * picker, which is the one place a notebook can be pointed at them.
         * What they always have is the pod that stands for them.
         */
        .filter(k => (k.id || k.runtime_name) && !listedAsSession.includes(k.id))
        .map(runtime => {
          const environment = multiServiceManager
            .remote!.environments.get()
            .find(env => env.name === runtime.environment.name)!;
          return {
            // Keep the control-plane identity as well as the Jupyter kernel
            // identity. External sandboxes may not have a kernel until they
            // are attached, but their runtime uid is already unique.
            id: runtime.uid,
            // Empty for an external sandbox: it has none, and saying so is
            // what keeps the picker from trying to connect to one.
            kernelId: runtime.id || undefined,
            name: environment!.name,
            language: environment!.language,
            provider: codeSandboxVariantOf(
              (environment as any)?.owner ??
                (runtime.environment as any)?.owner,
            ),
            displayName:
              // The name it was GIVEN first: the title of the environment is
              // what it runs, and every sandbox of that environment answers
              // it — the launcher asks for a name precisely so two of them
              // can be told apart here.
              runtime.given_name || environment!.title || environment!.name,
            location: 'remote' as IRuntimeLocation,
            runtimeName: runtime.runtime_name,
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
              spec?.display_name ?? k.name,
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
    // A kernel-less sandbox is named by its pod; without it every external
    // sandbox of one environment collapsed into a single entry.
    const key = `${desc.location}:${desc.kernelId ?? desc.runtimeName ?? desc.name}`;
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
  /*
   * The sandboxes of a Jupyter Server, which is a provider like the others.
   *
   * It is the one provider that only exists where the page is talking to such
   * a server: inside JupyterLab. Elsewhere its kernels are somebody else's,
   * and offering them promises what cannot be reached.
   */
  const environments = Object.values(
    jupyterProviderAvailable ? (specs?.kernelspecs ?? {}) : {},
  )
    .filter(spec => !!spec)
    .map(
      spec =>
        ({
          name: spec!.name,
          language: spec!.language,
          displayName: spec!.display_name,
          gpu: spec!.resources?.['nvidia.com/gpu'],
          location: 'local' as IRuntimeLocation,
          provider: CodeSandboxVariant.JupyterServer,
        }) as IDatalayerCodeSandboxDesc,
    )
    .filter(filterKernels);
  /*
   * Every provider that can be used from here, and only those.
   *
   * A provider is a place a sandbox runs — the platform, this Jupyter Server,
   * the browser — and each is offered when it is REACHABLE, not according to
   * which application is asking. Withholding the platform inside JupyterLab
   * took `ai-agents-env` off the list and left no way to launch a remote
   * sandbox from there at all; the rule that was wanted is the other one, and
   * it is stated where the Jupyter Server is read below.
   */
  const remoteEnvironments =
    multiServiceManager.remote?.environments.get() ?? [];
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
            provider: codeSandboxVariantOf((spec as any)?.owner),
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
