/*
 * Copyright (c) 2023-2026 Datalayer, Inc.
 *
 * Datalayer License
 */

/**
 * Pick up, in a React notebook, the executions a previous page left running.
 *
 * The sweep itself is {@link resumeServerExecutions}; this is when to run it.
 * The cells arrive with the document — a room that has to sync, a model that
 * has to be built, a sandbox that has to bind — so there is nothing to sweep
 * at the moment the editor mounts, and no one signal that says "now". The
 * notebook is looked at on a short timer for a short while; each pass is
 * cheap, reading metadata off the cells that are there, and a request is
 * only ever taken up once.
 *
 * @module jupyter/useResumeServerExecutions
 */

import { useEffect } from 'react';
import type { ServiceManager } from '@jupyterlab/services';
import { notebookStore } from '@datalayer/jupyter-react';
import {
  resumeServerExecutions,
  type ISweepableNotebook,
} from './serverExecution';

/** How often the cells are looked at, and for how long. */
const LOOK_EVERY_MS = 1_000;
const LOOK_FOR_MS = 30_000;

/**
 * Resume the server executions of a notebook, once it has cells.
 *
 * @param notebookId The notebook, as the store of Jupyter React names it
 * @param serviceManager The services of the notebook's sandbox — the server
 *   its cells were posted to. Nothing is done without one: there is then no
 *   kernel, and no server to ask.
 */
export function useResumeServerExecutions(
  notebookId: string | undefined,
  serviceManager?: ServiceManager.IManager,
): void {
  useEffect(() => {
    if (!notebookId || !serviceManager) {
      return;
    }
    let elapsed = 0;
    const sweep = (): void => {
      const adapter = notebookStore.getState().selectNotebook(notebookId)
        ?.adapter as { panel?: ISweepableNotebook } | undefined;
      // `panel`, not `notebookPanel`: the adapter of Jupyter React names it
      // that way, and asking for the other one found an empty list every time.
      const panel = adapter?.panel;
      if (!panel || panel.isDisposed) {
        return;
      }
      // The sweep waits for the kernel and asks its server; nothing to pass.
      void resumeServerExecutions(panel);
    };
    sweep();
    const timer = window.setInterval(() => {
      elapsed += LOOK_EVERY_MS;
      if (elapsed >= LOOK_FOR_MS) {
        window.clearInterval(timer);
        return;
      }
      sweep();
    }, LOOK_EVERY_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [notebookId, serviceManager]);
}

export default useResumeServerExecutions;
