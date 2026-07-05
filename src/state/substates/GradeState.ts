/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

export type IGradeState = {
  gradeRequest?: Date;
};

export type GradeState = IGradeState & {
  grade: (gradeRequest: Date) => void;
};

export const gradeStore = createStore<GradeState>((set, get) => ({
  gradeRequest: undefined,
  grade: (gradeRequest: Date) => set((state: GradeState) => ({ gradeRequest })),
}));

export function useGradeStore(): GradeState;
export function useGradeStore<T>(selector: (state: GradeState) => T): T;
export function useGradeStore<T>(selector?: (state: GradeState) => T) {
  return useStore(gradeStore, selector!);
}

export default useGradeStore;
