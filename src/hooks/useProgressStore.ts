/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Global "top progress bar" store.
 *
 * Drives a single, app-wide GitHub-style indeterminate progress bar rendered
 * at the bottom edge of a view header. Any UI component can signal that
 * background work is happening without owning its own spinner.
 *
 * Concurrency is handled by reference-counting active tasks keyed by an
 * arbitrary id, so multiple overlapping loads keep the bar visible until the
 * last one finishes. Use {@link ProgressState.setTaskActive} to bind the bar
 * to a boolean loading flag, or {@link ProgressState.startTask} /
 * {@link ProgressState.stopTask} for imperative start/stop pairs. The
 * {@link useProgressTask} hook wraps this store for the common effect-driven
 * case.
 *
 * @module hooks/useProgressStore
 */

import { create } from 'zustand';

/**
 * State shape for the global top progress bar.
 */
export type ProgressState = {
  /** Map of currently-active task ids. */
  tasks: Record<string, true>;
  /** True while at least one task is active. */
  isActive: boolean;
  /**
   * Mark a task as active. Returns the task id so callers can stop it later.
   * When no id is supplied a unique one is generated.
   */
  startTask: (id?: string) => string;
  /** Mark a task as no longer active. */
  stopTask: (id: string) => void;
  /**
   * Bind the bar to a boolean loading flag for a given task id. Convenient
   * inside effects: `setTaskActive('volumes', volumesLoading)`.
   */
  setTaskActive: (id: string, active: boolean) => void;
  /** Clear every active task (hides the bar). */
  reset: () => void;
};

const computeActive = (tasks: Record<string, true>): boolean =>
  Object.keys(tasks).length > 0;

export const useProgressStore = create<ProgressState>((set, get) => ({
  tasks: {},
  isActive: false,
  startTask: id => {
    const taskId =
      id || `progress-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set(state => {
      if (state.tasks[taskId]) {
        return state;
      }
      const tasks = { ...state.tasks, [taskId]: true as const };
      return { tasks, isActive: computeActive(tasks) };
    });
    return taskId;
  },
  stopTask: id => {
    set(state => {
      if (!state.tasks[id]) {
        return state;
      }
      const tasks = { ...state.tasks };
      delete tasks[id];
      return { tasks, isActive: computeActive(tasks) };
    });
  },
  setTaskActive: (id, active) => {
    if (active) {
      get().startTask(id);
    } else {
      get().stopTask(id);
    }
  },
  reset: () => set({ tasks: {}, isActive: false }),
}));

export default useProgressStore;
