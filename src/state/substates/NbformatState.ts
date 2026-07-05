/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

export type SaveRequest = {
  counter: number;
};

export type INbformatState = {
  saveRequest: SaveRequest;
};

export type NbformatState = INbformatState & {
  save: (saveRequest: SaveRequest) => void;
};

export const nbformatStore = createStore<NbformatState>((set, get) => ({
  saveRequest: {
    counter: -1,
  },
  save: (saveRequest: SaveRequest) =>
    set((state: NbformatState) => ({ saveRequest })),
}));

export function useNbformatStore(): NbformatState;
export function useNbformatStore<T>(selector: (state: NbformatState) => T): T;
export function useNbformatStore<T>(selector?: (state: NbformatState) => T) {
  return useStore(nbformatStore, selector!);
}

export default useNbformatStore;
