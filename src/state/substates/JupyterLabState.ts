/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { JupyterLabAppAdapter } from '@datalayer/jupyter-react';
import { JupyterFrontEndPlugin } from '@jupyterlab/application';

// TODO import the Plugin type from jupyter-react.
export type Plugin = JupyterFrontEndPlugin<any, any, any> & {
  service: any;
};

export type IJupyterLabState = {
  jupyterLabAdapter?: JupyterLabAppAdapter;
};

export type JupyterLabState = IJupyterLabState & {
  setJupyterLabAdapter: (jupyterLabAdapter?: JupyterLabAppAdapter) => void;
  plugin: (id: string) => Plugin | undefined;
};

export const jupyterLabStore = createStore<JupyterLabState>((set, get) => ({
  jupyterLabAdapter: undefined,
  setJupyterLabAdapter: (jupyterLabAdapter?: JupyterLabAppAdapter) =>
    set((state: JupyterLabState) => ({ jupyterLabAdapter })),
  plugin: (id: string) => {
    return get().jupyterLabAdapter?.plugin(id);
  },
}));

export function useJupyterLabStore(): JupyterLabState;
export function useJupyterLabStore<T>(
  selector: (state: JupyterLabState) => T,
): T;
export function useJupyterLabStore<T>(
  selector?: (state: JupyterLabState) => T,
) {
  return useStore(jupyterLabStore, selector!);
}

export default useJupyterLabStore;
