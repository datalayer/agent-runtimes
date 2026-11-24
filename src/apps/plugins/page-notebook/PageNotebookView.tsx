/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The conversation's notebook in its side-panel tab, live: on the
 * workspace's kernel when its sandbox runs (the Agent's notebook view), and
 * otherwise on Python in this browser (the user, 24 November 2026: "for the
 * demo app, use the browser runtime instead"). It mirrors the in-memory
 * notebook the agent's tools write (`memoryNotebook`).
 */

import type { JSX } from 'react';
import { lazy, Suspense, useMemo } from 'react';
import type { INotebookContent } from '@jupyterlab/nbformat';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { AgentWorkspaceContext } from '../../core';
import { EphemeralNotebook } from '../../../chat/notebook/EphemeralNotebook';
import type { IKernelConnection } from '@jupyterlab/services/lib/kernel/kernel';
import {
  pageBrowserSandbox,
  usePageKernel,
} from '../../pageTools/usePageKernel';
import { pageKernelToolbarItems } from '../page-document/PageKernelIndicator';
import { pageNotebookViewId } from './memoryNotebook';

const NotebookView = lazy(() => import('../notebook/NotebookView'));

/** An empty notebook: the in-memory one's cells are put in once it mounts. */
const EMPTY: INotebookContent = {
  cells: [],
  metadata: {},
  nbformat: 4,
  nbformat_minor: 5,
};

const LIVE_SX = {
  height: '100%',
  minHeight: 0,
  '& .jp-NotebookPanel': { height: '100% !important', minHeight: 0 },
  '& .dla-Box-Notebook': {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
};

export default function PageNotebookView({
  workspace,
  conversation = '',
}: {
  workspace: AgentWorkspaceContext | undefined;
  /** The conversation whose notebook it mirrors (`conversationScope`). */
  conversation?: string;
}): JSX.Element {
  const kernel = usePageKernel();
  const viewId = pageNotebookViewId(conversation);
  const opening = useMemo(
    () => JSON.parse(JSON.stringify(EMPTY)) as INotebookContent,
    [],
  );
  // The kernel indicator in its toolbar, as the document's (the user,
  // 24 November 2026: "add the kernel indicator also in the notebook
  // toolbar"): Python in this browser, its state followed as it changes.
  const browserKernel =
    kernel.source === 'browser'
      ? ((pageBrowserSandbox().getKernelConnection() as IKernelConnection | null) ??
        null)
      : null;
  const toolbarExtraItems = useMemo(
    () => pageKernelToolbarItems('browser', browserKernel),
    [browserKernel],
  );
  if (kernel.source === 'workspace' && workspace) {
    return (
      <Suspense fallback={<Box minHeight={320} aria-busy="true" />}>
        <NotebookView surfaceId={viewId} workspace={workspace} />
      </Suspense>
    );
  }
  if (kernel.source === 'browser') {
    return (
      <Box sx={LIVE_SX} data-page-notebook-browser="">
        <EphemeralNotebook
          notebookId={viewId}
          nbformat={opening}
          inheritTheme
          serviceManager={kernel.serviceManager}
          kernelId={kernel.kernelId}
          showToolbar
          toolbarExtraItems={toolbarExtraItems}
        />
      </Box>
    );
  }
  return (
    <Box
      minHeight={320}
      display="flex"
      alignItems="center"
      justifyContent="center"
      aria-busy="true"
      data-page-notebook-starting=""
    >
      <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
        Starting Python in this browser…
      </Text>
    </Box>
  );
}
