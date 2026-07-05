/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

export interface IDocumentState {
  documentSaveRequest?: Date;
}

export type DocumentState = IDocumentState & {
  save: (documentSaveRequest: Date) => void;
};

export const documentStore = createStore<DocumentState>((set, get) => ({
  documentSaveRequest: undefined,
  save: (documentSaveRequest: Date) =>
    set((state: DocumentState) => ({ documentSaveRequest })),
}));

export function useDocumentStore(): DocumentState;
export function useDocumentStore<T>(selector: (state: DocumentState) => T): T;
export function useDocumentStore<T>(selector?: (state: DocumentState) => T) {
  return useStore(documentStore, selector!);
}

export default useDocumentStore;
