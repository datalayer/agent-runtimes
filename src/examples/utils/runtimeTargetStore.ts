/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

export type ExampleRuntimeTarget = 'local' | 'cloud';

const STORAGE_KEY = 'agent-runtimes.examples.runtime-target';

const readStoredTarget = (): ExampleRuntimeTarget => {
  if (typeof window === 'undefined') {
    return 'local';
  }
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === 'cloud' ? 'cloud' : 'local';
};

interface RuntimeTargetState {
  target: ExampleRuntimeTarget;
  setTarget: (target: ExampleRuntimeTarget) => void;
}

export const runtimeTargetStore = createStore<RuntimeTargetState>(set => ({
  target: readStoredTarget(),
  setTarget: (target: ExampleRuntimeTarget) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, target);
    }
    set({ target });
  },
}));

export function useRuntimeTargetStore(): RuntimeTargetState;
export function useRuntimeTargetStore<T>(
  selector: (state: RuntimeTargetState) => T,
): T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useRuntimeTargetStore(selector?: any) {
  return useStore(runtimeTargetStore, selector);
}
