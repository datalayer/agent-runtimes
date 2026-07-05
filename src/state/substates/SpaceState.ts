/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
type IBaseSpace = Record<string, any>;

export type ISpaceState = {
  spaces: IBaseSpace[];
};

export type SpaceState = ISpaceState & {
  updateSpaces: (spaces: IBaseSpace[]) => void;
};

export const spaceStore = createStore<SpaceState>((set, get) => ({
  spaces: [],
  updateSpaces: (spaces: IBaseSpace[]) =>
    set((state: SpaceState) => ({
      spaces,
    })),
}));

export function useSpaceStore(): SpaceState;
export function useSpaceStore<T>(selector: (state: SpaceState) => T): T;
export function useSpaceStore<T>(selector?: (state: SpaceState) => T) {
  return useStore(spaceStore, selector!);
}

export default useSpaceStore;
