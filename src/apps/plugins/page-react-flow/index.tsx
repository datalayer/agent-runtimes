/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** A React Flow diagram the Functional Analyst and the person edit together. */

import { lazy, Suspense, type JSX } from 'react';
import { WorkflowIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CallLine,
  cardRole,
  toolOf,
  useConversationBound,
} from '../../pageTools/cards';
import {
  defineToolCardPlugin,
  useCardSide,
  type ToolCardPluginOptions,
} from '../../toolCards/kit';
import type { SidePlacement } from '../../toolCards/chrome';
import {
  PAGE_REACT_FLOW,
  REACT_FLOW_TOOL_NAMES,
  pageReactFlowTools,
} from './store';

export const PAGE_REACT_FLOW_PLUGIN_NAME =
  '@datalayer/agent-plugin-page-react-flow';

const FlowStage = lazy(() => import('./FlowStage'));

const lines: Record<string, string> = {
  list_shapes: 'Read the flow diagram',
  insert_shape: 'Added a shape',
  link_shapes: 'Linked two shapes',
  move_shape: 'Moved a shape',
};

function Stage(): JSX.Element {
  const { state } = useConversationBound(
    PAGE_REACT_FLOW,
    REACT_FLOW_TOOL_NAMES,
  );
  return (
    <Suspense fallback={<Box minHeight={420} aria-busy="true" />}>
      <FlowStage flow={state} revision={PAGE_REACT_FLOW.getRevision()} />
    </Suspense>
  );
}

export function PageReactFlowCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const { latest } = useConversationBound(
    PAGE_REACT_FLOW,
    REACT_FLOW_TOOL_NAMES,
  );
  const tool = toolOf(context, REACT_FLOW_TOOL_NAMES);
  const role = cardRole(context, latest, useCardSide());
  if (role === 'default') {
    return <>{context.defaultUI}</>;
  }
  const line = (
    <CallLine icon={WorkflowIcon} busy={role === 'pending'} data={tool}>
      {role === 'pending' ? 'Editing the flow…' : (lines[tool] ?? tool)}
    </CallLine>
  );
  if (role !== 'live' || !PAGE_REACT_FLOW.built) {
    return line;
  }
  return (
    <>
      {line}
      <Stage />
    </>
  );
}

export function PageReactFlowPanel(): JSX.Element {
  useConversationBound(PAGE_REACT_FLOW, REACT_FLOW_TOOL_NAMES);
  // The empty canvas is useful too: the person may draw first, then the agent
  // discovers those stable IDs with list_shapes.
  return <Stage />;
}

const PAGE_REACT_FLOW_CARD: ToolCardPluginOptions = {
  id: 'page-react-flow',
  displayName: 'React Flow in the page',
  description:
    'An editable node-and-link diagram shared by the person and the agent, with stable element IDs.',
  octicon: 'workflow',
  emoji: '\u{1F500}',
  tools: REACT_FLOW_TOOL_NAMES,
  Card: PageReactFlowCard,
  frontendTools: pageReactFlowTools(),
  Panel: PageReactFlowPanel,
  panelWidth: 720,
};

export const PageReactFlowPlugin = defineToolCardPlugin(PAGE_REACT_FLOW_CARD);

export const pageReactFlowSidePlugin = (side: SidePlacement, tab?: string) =>
  defineToolCardPlugin(
    { ...PAGE_REACT_FLOW_CARD, ...(tab ? { panelLabel: tab } : {}) },
    side,
  );

export default PageReactFlowPlugin;
