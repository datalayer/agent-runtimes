/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The kernel of the notebook a team member gave, while one is open.
 *
 * `TeamNotebookView` runs the notebook on a Pyodide kernel in the page and
 * says so here; the team's graph reads it for the browser agent's *Code
 * Sandbox Details…*, which lists that kernel's variables. Light: a signal,
 * nothing of Jupyter loaded with it.
 *
 * @module components/teams/teamNotebookKernel
 */

import { signal } from '@datalayer/reactor';
import type { Kernel } from '@jupyterlab/services';

/** The open team notebook's kernel, or `null` when none is open. */
export const teamNotebookKernel = signal<Kernel.IKernelConnection | null>(null);
