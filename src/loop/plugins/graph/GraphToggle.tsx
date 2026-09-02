/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The button that opens the plugin graph, and closes it again.
 *
 * It belongs to the graph plugin rather than to the sidebar that renders it.
 * The sidebar used to draw it and had to ask, by name, whether a graph view
 * was mounted before showing it — which is a panel knowing about a plugin.
 * Contributed here, the button simply goes when the plugin does.
 *
 * @module loop/plugins/graph/GraphToggle
 */

import type { JSX } from 'react';
import { useRef } from 'react';
import { Button } from '@primer/react';

import type { LoopWorkspaceContext } from '../../core';
import { GRAPH_VIEW_TYPE } from './viewType';

export type GraphToggleProps = {
  /** The workspace, so the button can move it to the graph and back. */
  workspace?: LoopWorkspaceContext;
};

export default function GraphToggle({
  workspace,
}: GraphToggleProps): JSX.Element | null {
  // Where to go back to. Remembered rather than assumed: "back" should return
  // to what the person was looking at, not to whichever view happens to be
  // first.
  const previous = useRef<string>('');

  if (!workspace) {
    return null;
  }

  const onGraph = workspace.activeViewType === GRAPH_VIEW_TYPE;

  return (
    <Button
      sx={{ width: '100%' }}
      onClick={() => {
        if (onGraph) {
          workspace.setActiveViewType(previous.current);
          return;
        }
        previous.current = workspace.activeViewType;
        workspace.setActiveViewType(GRAPH_VIEW_TYPE);
      }}
    >
      {onGraph ? 'Back to the workspace' : 'View plugin graph'}
    </Button>
  );
}
