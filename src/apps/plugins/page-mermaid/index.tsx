/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-page-mermaid` — Mermaid diagrams the agent writes
 * in the conversation, with frontend tools run in the page (the user, 19
 * November 2026: the Functional Analyst's Mermaid tools).
 *
 * The tools are `@datalayer/reactor-mermaid`'s six: write a diagram (checked
 * with Mermaid's parser first), read it back, list them, check a source,
 * render to SVG, list the diagram types. Placed in a side panel, the
 * diagrams are drawn there and each call here is a line; in the message,
 * the last call that wrote one draws them.
 *
 * @module apps/plugins/page-mermaid
 */

import { Suspense, lazy, type JSX } from 'react';
import { WorkflowIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CallLine,
  PanelEmpty,
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
import { MERMAID_TOOL_NAMES, PAGE_MERMAID, pageMermaidTools } from './store';

export const PAGE_MERMAID_PLUGIN_NAME = '@datalayer/loop-plugin-page-mermaid';

const DiagramView = lazy(() => import('./DiagramView'));

export const PAGE_MERMAID_LINES = {
  writing: 'Writing the diagram…',
  panelTitle: 'The diagrams',
  panelEmpty:
    'The Mermaid diagrams the agent writes in this conversation show here, with their source.',
} as const;

const said = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value.trim() : '';

/** What one call did, in a line. */
export function mermaidCallSays(
  tool: string,
  args: Record<string, unknown>,
): string {
  switch (tool.replace(/^datalayer_/, '')) {
    case 'mermaidSetDiagram': {
      const title = said(args.title) ? ` “${said(args.title)}”` : '';
      return args.diagramId
        ? `Rewrote the diagram${title}`
        : `Wrote the diagram${title}`;
    }
    case 'mermaidReadDiagram':
      return 'Read the diagram';
    case 'mermaidListDiagrams':
      return 'Looked for the diagrams';
    case 'mermaidValidate':
      return 'Checked a diagram source';
    case 'mermaidRenderSvg':
      return 'Rendered a diagram to SVG';
    case 'mermaidListDiagramTypes':
      return 'Listed the diagram types';
    default:
      return tool;
  }
}

function View(): JSX.Element {
  const { state } = useConversationBound(PAGE_MERMAID, MERMAID_TOOL_NAMES);
  return (
    <Suspense fallback={<Box minHeight={200} aria-busy="true" />}>
      <DiagramView diagrams={state} revision={PAGE_MERMAID.getRevision()} />
    </Suspense>
  );
}

export function PageMermaidCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const { latest } = useConversationBound(PAGE_MERMAID, MERMAID_TOOL_NAMES);
  const tool = toolOf(context, MERMAID_TOOL_NAMES);
  const role = cardRole(context, latest, useCardSide());
  if (role === 'default') {
    return <>{context.defaultUI}</>;
  }
  const line = (
    <CallLine icon={WorkflowIcon} busy={role === 'pending'} data={tool}>
      {role === 'pending'
        ? PAGE_MERMAID_LINES.writing
        : mermaidCallSays(tool, context.args ?? {})}
    </CallLine>
  );
  if (role !== 'live' || !PAGE_MERMAID.built) {
    return line;
  }
  return (
    <>
      {line}
      <View />
    </>
  );
}

/** The diagrams in a side panel, when the UI is placed there. */
export function PageMermaidPanel(): JSX.Element {
  useConversationBound(PAGE_MERMAID, MERMAID_TOOL_NAMES);
  return PAGE_MERMAID.built ? (
    <View />
  ) : (
    <PanelEmpty
      icon={WorkflowIcon}
      title={PAGE_MERMAID_LINES.panelTitle}
      data="page-mermaid"
    >
      {PAGE_MERMAID_LINES.panelEmpty}
    </PanelEmpty>
  );
}

const PAGE_MERMAID_CARD: ToolCardPluginOptions = {
  id: 'page-mermaid',
  displayName: 'Mermaid in the page',
  description:
    'Mermaid diagrams the agent writes in the conversation, checked and drawn, with tools run in the page.',
  octicon: 'workflow',
  emoji: '\u{1F9DC}',
  tools: MERMAID_TOOL_NAMES,
  Card: PageMermaidCard,
  frontendTools: pageMermaidTools(),
  Panel: PageMermaidPanel,
  panelWidth: 560,
};

export const PageMermaidPlugin = defineToolCardPlugin(PAGE_MERMAID_CARD);

/** Placed in a side panel (`right`, `left`): the diagrams there, a line per call here. */
export const pageMermaidSidePlugin = (side: SidePlacement) =>
  defineToolCardPlugin(PAGE_MERMAID_CARD, side);

export default PageMermaidPlugin;
