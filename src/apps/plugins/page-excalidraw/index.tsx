/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-page-excalidraw` — drawings the agent makes in the
 * conversation, on an Excalidraw canvas, with frontend tools run in the page
 * (the user, 19 November 2026: the Analyst's Excalidraw tools).
 *
 * The tools are `@datalayer/reactor-excalidraw`'s eleven, bound to the
 * conversation's drawings: insert a drawing, read it, add, change, connect
 * and delete its shapes, draw from Mermaid. Placed in a side panel, the
 * canvas is drawn there, editable, and each call here is a line; in the
 * message, the last call that changed a drawing draws it.
 *
 * @module apps/plugins/page-excalidraw
 */

import { Suspense, lazy, type JSX } from 'react';
import { PaintbrushIcon } from '@primer/octicons-react';
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
import {
  EXCALIDRAW_TOOL_NAMES,
  PAGE_EXCALIDRAW,
  pageExcalidrawTools,
} from './store';

export const PAGE_EXCALIDRAW_PLUGIN_NAME =
  '@datalayer/loop-plugin-page-excalidraw';

const DrawingStage = lazy(() => import('./DrawingStage'));

export const PAGE_EXCALIDRAW_LINES = {
  drawing: 'Drawing…',
  panelTitle: 'The canvas',
  panelEmpty:
    'What the agent draws in this conversation shows here, on a canvas you can draw on too.',
} as const;

const count = (value: unknown, one: string): string => {
  const n = Array.isArray(value) ? value.length : 0;
  return n === 1 ? `1 ${one}` : `${n} ${one}s`;
};

/** What one call did, in a line. */
export function excalidrawCallSays(
  tool: string,
  args: Record<string, unknown>,
): string {
  switch (tool.replace(/^datalayer_/, '')) {
    case 'excalidrawInsertNode':
      return Array.isArray(args.elements) && args.elements.length > 0
        ? `Drew ${count(args.elements, 'shape')}`
        : 'Started an empty drawing';
    case 'excalidrawFromMermaid':
      return args.blockId
        ? 'Redrew the drawing from Mermaid'
        : 'Drew a Mermaid diagram as shapes';
    case 'excalidrawListDrawings':
      return 'Looked for the drawings';
    case 'excalidrawReadScene':
      return 'Read the drawing';
    case 'excalidrawAddElements':
      return `Added ${count(args.elements, 'shape')}`;
    case 'excalidrawUpdateElements':
      return `Changed ${count(args.updates, 'shape')}`;
    case 'excalidrawConnectElements':
      return 'Connected two shapes';
    case 'excalidrawDeleteElements':
      return `Removed ${count(args.elementIds, 'shape')}`;
    case 'excalidrawSetAppState':
      return 'Set up the canvas';
    case 'excalidrawResize':
      return 'Resized the drawing';
    case 'excalidrawClearScene':
      return 'Emptied the drawing';
    default:
      return tool;
  }
}

function Stage(): JSX.Element {
  const { state } = useConversationBound(
    PAGE_EXCALIDRAW,
    EXCALIDRAW_TOOL_NAMES,
  );
  return (
    <Suspense fallback={<Box minHeight={420} aria-busy="true" />}>
      <DrawingStage drawings={state} revision={PAGE_EXCALIDRAW.getRevision()} />
    </Suspense>
  );
}

export function PageExcalidrawCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const { latest } = useConversationBound(
    PAGE_EXCALIDRAW,
    EXCALIDRAW_TOOL_NAMES,
  );
  const tool = toolOf(context, EXCALIDRAW_TOOL_NAMES);
  // Placed in a side panel, the canvas is drawn there: every call is a line here.
  const role = cardRole(context, latest, useCardSide());
  if (role === 'default') {
    return <>{context.defaultUI}</>;
  }
  const line = (
    <CallLine icon={PaintbrushIcon} busy={role === 'pending'} data={tool}>
      {role === 'pending'
        ? PAGE_EXCALIDRAW_LINES.drawing
        : excalidrawCallSays(tool, context.args ?? {})}
    </CallLine>
  );
  if (role !== 'live' || !PAGE_EXCALIDRAW.built) {
    return line;
  }
  return (
    <>
      {line}
      <Stage />
    </>
  );
}

/** The canvas in a side panel, live and editable, when the UI is placed there. */
export function PageExcalidrawPanel(): JSX.Element {
  useConversationBound(PAGE_EXCALIDRAW, EXCALIDRAW_TOOL_NAMES);
  return PAGE_EXCALIDRAW.built ? (
    <Stage />
  ) : (
    <PanelEmpty
      icon={PaintbrushIcon}
      title={PAGE_EXCALIDRAW_LINES.panelTitle}
      data="page-excalidraw"
    >
      {PAGE_EXCALIDRAW_LINES.panelEmpty}
    </PanelEmpty>
  );
}

const PAGE_EXCALIDRAW_CARD: ToolCardPluginOptions = {
  id: 'page-excalidraw',
  displayName: 'Excalidraw in the page',
  description:
    'Drawings the agent makes in the conversation, on an Excalidraw canvas, with tools run in the page.',
  octicon: 'paintbrush',
  emoji: '\u{1F58C}\u{FE0F}',
  tools: EXCALIDRAW_TOOL_NAMES,
  Card: PageExcalidrawCard,
  frontendTools: pageExcalidrawTools(),
  Panel: PageExcalidrawPanel,
  panelWidth: 640,
};

export const PageExcalidrawPlugin = defineToolCardPlugin(PAGE_EXCALIDRAW_CARD);

/** Placed in a side panel (`right`, `left`): the canvas there, a line per call here. */
export const pageExcalidrawSidePlugin = (side: SidePlacement) =>
  defineToolCardPlugin(PAGE_EXCALIDRAW_CARD, side);

export default PageExcalidrawPlugin;
