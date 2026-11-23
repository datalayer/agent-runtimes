/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** A live Jupyter notebook in a named side-panel tab. */

import { lazy, Suspense, type JSX } from 'react';
import { RowsIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import type { AgentWorkspaceContext } from '../../core';
import type { AgentSidePanelProps } from '../../shell/SidePanel';
import type { ToolCallRenderContext } from '../../../types/chat';
import { createNotebookTools } from '../../../tools/adapters/agent-runtimes/notebookHooks';
import { CallLine, cardRole, toolOf } from '../../pageTools/cards';
import {
  defineToolCardPlugin,
  type ToolCardPluginOptions,
} from '../../toolCards/kit';
import type { SidePlacement } from '../../toolCards/chrome';

export const PAGE_NOTEBOOK_ID = 'page-notebook';
const NotebookView = lazy(() => import('../notebook/NotebookView'));
const FRONTEND_TOOLS = createNotebookTools(PAGE_NOTEBOOK_ID);
export const PAGE_NOTEBOOK_TOOL_NAMES = FRONTEND_TOOLS.map(tool => tool.name);

function NotebookPanel(props: AgentSidePanelProps): JSX.Element {
  const workspace = props.workspace as AgentWorkspaceContext | undefined;
  if (!workspace) {
    return <Box minHeight={320} aria-busy="true" />;
  }
  return (
    <Suspense fallback={<Box minHeight={320} aria-busy="true" />}>
      <NotebookView surfaceId={PAGE_NOTEBOOK_ID} workspace={workspace} />
    </Suspense>
  );
}

function NotebookCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const role = cardRole(context, undefined);
  if (role === 'default') {
    return <>{context.defaultUI}</>;
  }
  const tool = toolOf(context, PAGE_NOTEBOOK_TOOL_NAMES);
  return (
    <CallLine icon={RowsIcon} busy={role === 'pending'} data={tool}>
      {role === 'pending' ? 'Updating the notebook…' : 'Updated the notebook'}
    </CallLine>
  );
}

const PAGE_NOTEBOOK: ToolCardPluginOptions = {
  id: 'page-notebook',
  displayName: 'Notebook',
  description:
    'A live Jupyter notebook the agent reads, writes and runs in a side-panel tab.',
  octicon: 'rows',
  emoji: '\u{1F4D3}',
  tools: PAGE_NOTEBOOK_TOOL_NAMES,
  Card: NotebookCard,
  frontendTools: FRONTEND_TOOLS,
  Panel: NotebookPanel,
  panelWidth: 760,
};

export const PageNotebookPlugin = defineToolCardPlugin(PAGE_NOTEBOOK);

export const pageNotebookSidePlugin = (side: SidePlacement, tab?: string) =>
  defineToolCardPlugin(
    { ...PAGE_NOTEBOOK, ...(tab ? { panelLabel: tab } : {}) },
    side,
  );

export default PageNotebookPlugin;
