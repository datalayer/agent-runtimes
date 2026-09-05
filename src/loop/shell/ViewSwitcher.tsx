/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The workspace's one piece of navigation.
 *
 * It is built from contributions rather than a hard-coded list of modes, which
 * is the whole difference from `EphemeralSurfaceControl`: a fifth view costs a
 * plugin, not an edit to a union type.
 *
 * @module loop/shell/ViewSwitcher
 */

import type { JSX } from 'react';
import { Box, Tooltip } from '@primer/react';
import type { Contribution } from '@datalayer/reactor';
import {
  canOpenView,
  type LoopWorkspaceContext,
  type ViewTypeContribution,
} from '../core';

export type ViewSwitcherProps = {
  views: Contribution<ViewTypeContribution>[];
  workspace: LoopWorkspaceContext;
  /**
   * Drop the labels and keep the icons.
   *
   * For a side panel, where four labelled tabs would use the width the views
   * need. The tooltip still carries the title, so nothing is lost but space.
   */
  compact?: boolean;
};

export function ViewSwitcher({
  views,
  workspace,
  compact = false,
}: ViewSwitcherProps): JSX.Element | null {
  // One choice is not a choice.
  if (views.length < 2) {
    return null;
  }

  return (
    <Box
      role="tablist"
      aria-label="Workspace views"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        bg: 'neutral.muted',
        borderRadius: '6px',
        p: '2px',
        gap: '1px',
      }}
    >
      {views.map(entry => {
        const view = entry.value;
        const open = canOpenView(view, workspace);
        const active = workspace.activeViewType === view.viewType;
        const Icon = view.icon;
        // A greyed-out tab with no explanation is worse than no tab.
        // In compact mode the tooltip is the only place the title appears, so
        // it says the title even when the view is fine.
        const label = open
          ? view.title
          : `${view.title} — ${
              view.unavailableReason?.(workspace) ?? 'unavailable'
            }`;

        return (
          <Tooltip key={view.viewType} text={label} direction="n">
            <Box
              as="button"
              role="tab"
              aria-selected={active}
              // `aria-disabled` rather than `disabled`: a disabled button is
              // not focusable, so a keyboard or screen-reader user would never
              // hear *why* the view is unavailable. It stays focusable, the
              // tooltip explains, and the handler declines.
              aria-disabled={!open}
              onClick={() => open && workspace.setActiveViewType(view.viewType)}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                border: 'none',
                borderRadius: '5px',
                px: 2,
                py: '4px',
                fontSize: 0,
                cursor: open ? 'pointer' : 'not-allowed',
                opacity: open ? 1 : 0.5,
                bg: active ? 'canvas.default' : 'transparent',
                color: active ? 'fg.default' : 'fg.muted',
                boxShadow: active ? 'shadow.small' : 'none',
              }}
            >
              {Icon ? <Icon size={14} /> : null}
              {compact && Icon ? null : view.title}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
