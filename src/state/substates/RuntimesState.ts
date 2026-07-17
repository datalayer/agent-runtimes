/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { JSONExt } from '@lumino/coreutils';
import { Poll } from '@lumino/polling';
import type { IMultiServiceManager } from '../../runtimes';
import { getRuntimes } from '../../runtimes';
import type { IRuntimesConfiguration } from '@datalayer/core/lib/config';
import type {
  IRuntimePod,
  ICodeSandboxSnapshot,
  IRuntimeModel,
} from '../../models';
import { coreStore } from '@datalayer/core/lib/state/substates/CoreState';
import { iamStore } from '@datalayer/core/lib/state/substates/IAMState';

/**
 * Datalayer Runtimes state.
 */
export type RuntimesState = {
  /**
   * Runtimes configuration
   */
  configuration: IRuntimesConfiguration;
  setConfiguration: (config: IRuntimesConfiguration) => void;
  /**
   * Runtimes RUN URL.
   */
  runtimesUrl: string;
  tab: number;
  getIntTab: () => number;
  setTab: (tab: number) => void;
  /**
   * Runtime pods.
   */
  runtimePods: IRuntimePod[];
  /**
   * Refresh the runtime pods.
   */
  refreshRuntimePods: () => Promise<void>;
  /**
   * Remove a runtime pod from the local state by its pod name.
   *
   * Used to prune a pod immediately after it is deleted, without waiting for
   * the next `refreshRuntimePods()` poll tick. This lets the remote service
   * managers dispose right away and stop polling the (now dead) pod ingress.
   */
  removeRuntimePod: (podName: string) => void;
  /**
   * Cached runtime models.
   */
  runtimeModels: readonly IRuntimeModel[];
  /**
   * Add a runtime model.
   */
  addRuntimeModel: (model: IRuntimeModel) => void;
  /**
   * Remove a runtime model by ID.
   */
  removeRuntimeModel: (id: string) => void;
  /**
   * Set the runtimes models list.
   */
  setRuntimeModels: (models: readonly IRuntimeModel[]) => void;
  /**
   * Jupyter service manager.
   */
  multiServiceManager?: IMultiServiceManager;
  setMultiServiceManager: (multiServiceManager: IMultiServiceManager) => void;
  showDisclaimer: boolean;
  setShowDisclaimer: (showDisclaimer: boolean) => void;
  /**
   * Code Sandbox snapshots.
   */
  runtimeSnapshots: readonly ICodeSandboxSnapshot[];
  /**
   * Add a code sandbox snapshot.
   */
  addSandboxSnapshot: (snapshot: ICodeSandboxSnapshot) => void;
  /**
   * Remove a Code Sandbox Snapshot.
   */
  removeSandboxSnapshot: (id: string) => void;
  /**
   * Set Code Sandbox Snapshots.
   */
  setSandboxSnapshots: (snapshots: ICodeSandboxSnapshot[]) => void;
  /**
   * Package version.
   */
  version: string;
  setVersion: (version: string) => void;
};

/**
 * Kernel store
 */
export const runtimesStore = createStore<RuntimesState>((set, get) => {
  return {
    configuration: {
      maxNotebookRuntimes: 5,
      maxCellRuntimes: 3,
    },
    setConfiguration: (configuration: IRuntimesConfiguration) => {
      set(state =>
        JSONExt.deepEqual(state.configuration as any, configuration as any)
          ? {}
          : { configuration: { ...configuration } },
      );
    },
    runtimesUrl: coreStore.getState().configuration?.runtimesUrl,
    tab: 0.0,
    getIntTab: () => Math.floor(get().tab),
    setTab: (tab: number) => set(state => ({ tab })),
    /**
     * Remote runtime pods.
     */
    runtimePods: [],
    /**
     * Refresh the runtime pods.
     */
    refreshRuntimePods: async () => {
      const servers = await getRuntimes();
      // Update the state with the Remote Kernels.
      if (!JSONExt.deepEqual(get().runtimePods as any, servers as any)) {
        set({ runtimePods: [...servers] });
      }
    },
    /**
     * Remove a runtime pod by its pod name.
     */
    removeRuntimePod: (podName: string) => {
      if (!podName) {
        return;
      }
      const current = get().runtimePods;
      const next = current.filter(pod => pod.pod_name !== podName);
      if (next.length !== current.length) {
        set({ runtimePods: next });
      }
    },
    /**
     * Cached runtime models.
     */
    runtimeModels: [],
    /**
     * Add a runtime model
     */
    addRuntimeModel: (model: IRuntimeModel) => {
      const kernels = get().runtimeModels;
      // Identity check: a runtime may not have a kernel `id` yet (it appears
      // only once a kernel is attached), so fall back to the stable pod `uid`.
      // See the IRuntimeModel / IRuntimePod / Kernel.IModel docs in models/Runtime.ts.
      const index = kernels.findIndex(
        m =>
          (model.id && model.id === m.id) ||
          (!!model.uid && model.uid === m.uid),
      );
      if (index < 0) {
        set({ runtimeModels: [...kernels, model] });
      }
    },
    /**
     * Remove a runtime model by ID.
     */
    removeRuntimeModel: (id: string) => {
      const kernels = [...get().runtimeModels];
      const index = kernels?.findIndex(model => id === model.id) ?? -1;
      if (index >= 0) {
        kernels.splice(index, 1);
        set({ runtimeModels: kernels });
      }
    },
    setRuntimeModels: (models: readonly IRuntimeModel[]) => {
      if (!JSONExt.deepEqual(get().runtimeModels as any, models as any)) {
        set({ runtimeModels: [...models] });
      }
    },
    multiServiceManager: undefined,
    setMultiServiceManager: multiServiceManager => {
      set(state => ({ multiServiceManager }));
    },
    showDisclaimer: false,
    setShowDisclaimer: showDisclaimer => {
      set(state => ({ showDisclaimer }));
    },
    /**
     * Kernel Snapshots.
     */
    runtimeSnapshots: [],
    /**
     * Add a Kernel Snapshot
     */
    addSandboxSnapshot: (snapshot: ICodeSandboxSnapshot) => {
      const snapshots = get().runtimeSnapshots;
      const index = snapshots.findIndex(s => s.id === snapshot.id);
      if (index < 0) {
        const kernelSnapshots = [...snapshots, snapshot];
        set({ runtimeSnapshots: kernelSnapshots });
      } else if (!JSONExt.deepEqual(snapshots[index] as any, snapshot as any)) {
        const kernelSnapshots = [...snapshots];
        kernelSnapshots.splice(index, 1, snapshot);
        set({ runtimeSnapshots: kernelSnapshots });
      }
    },
    /**
     * Remove a Kernel Snapshot.
     */
    removeSandboxSnapshot: (id: string) => {
      const snapshots = get().runtimeSnapshots;
      const index = snapshots.findIndex(s => s.id === id);
      if (index >= 0) {
        const kernelSnapshots = [...snapshots];
        kernelSnapshots.splice(index, 1);
        set({ runtimeSnapshots: kernelSnapshots });
      }
    },
    /**
     * Set Kernel Snapshots.
     */
    setSandboxSnapshots: (snapshots: ICodeSandboxSnapshot[]) => {
      if (!JSONExt.deepEqual(get().runtimeSnapshots as any, snapshots as any)) {
        set({ runtimeSnapshots: [...snapshots] });
      }
    },
    version: '',
    setVersion: version => {
      if (version && !get().version) {
        set(state => ({ version }));
      }
    },
  };
});

// Poll remote kernels
const kernelsPoll = new Poll({
  auto: true,
  factory: () => runtimesStore.getState().refreshRuntimePods(),
  frequency: {
    interval: 61 * 1000,
    backoff: true,
    max: 300 * 1000,
  },
  name: '@datalayer/jupyter-kernels:KernelsManager#kernels',
  standby: () =>
    iamStore.getState().token || runtimesStore.getState().runtimesUrl
      ? 'when-hidden'
      : true,
});

// Force refresh at expiration date if next tick is after it.
runtimesStore.subscribe((state: RuntimesState, prevState: RuntimesState) => {
  if (
    !JSONExt.deepEqual(state.runtimePods as any, prevState.runtimePods as any)
  ) {
    const now = Date.now();
    const minExpiredAt =
      Math.min(
        ...state.runtimePods.map(kernel =>
          kernel.expired_at ? parseFloat(kernel.expired_at) : Infinity,
        ),
      ) * 1_000;
    // Refresh 2 sec after the closest expiration time
    // to let some times to the system to dispose the resources.
    if (now + kernelsPoll.frequency.interval > minExpiredAt + 2_000) {
      setTimeout(
        () => {
          kernelsPoll.refresh();
        },
        minExpiredAt + 2_000 - now,
      );
    }
  }
});

coreStore.subscribe((state, prevState) => {
  if (
    state.configuration.runtimesUrl &&
    state.configuration.runtimesUrl !== prevState.configuration.runtimesUrl
  ) {
    const runtimesUrl = state.configuration.runtimesUrl;
    console.log(`Updating runtimesUrl with new value ${runtimesUrl}`);
    runtimesStore.setState({ runtimesUrl });
    kernelsPoll
      .refresh()
      .then(() => kernelsPoll.tick)
      .catch(reason => {
        console.error(
          'Failed to refresh kernel servers list following service URL changed.',
          reason,
        );
      });
  }
});

export function useRuntimesStore(): RuntimesState;
export function useRuntimesStore<T>(selector: (state: RuntimesState) => T): T;
export function useRuntimesStore<T>(selector?: (state: RuntimesState) => T) {
  return useStore(runtimesStore, selector!);
}

export default useRuntimesStore;
