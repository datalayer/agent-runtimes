/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Reusable hook that binds a boolean loading flag to the global top progress
 * bar ({@link useProgressStore}). While `active` is true the shared bar shows
 * activity; it is automatically released when `active` turns false or the
 * component unmounts.
 *
 * Because the bar reference-counts tasks by id, multiple overlapping loads
 * (across any views) keep the single app-wide bar visible until the last one
 * completes.
 *
 * @example
 * ```tsx
 * const { isPending } = useVolumes();
 * useProgressTask('volumes', isPending);
 * ```
 *
 * @module hooks/useProgressTask
 */

import { useEffect } from 'react';
import { useProgressStore } from './useProgressStore';

/**
 * Drive the shared top progress bar from a boolean loading flag.
 *
 * @param id - Stable, unique task id (e.g. `'volumes'`). Distinct ids let
 *   concurrent loads coexist without prematurely hiding the bar.
 * @param active - Whether the task is currently in progress.
 */
export function useProgressTask(id: string, active: boolean): void {
  const setTaskActive = useProgressStore(state => state.setTaskActive);
  useEffect(() => {
    setTaskActive(id, active);
    return () => {
      setTaskActive(id, false);
    };
  }, [id, active, setTaskActive]);
}

export default useProgressTask;
