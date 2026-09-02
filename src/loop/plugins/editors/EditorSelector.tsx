/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The editor selector: the chat's surface picker, moved to the workspace.
 *
 * The chat draws its own strip when `showSurfaceSelector` is on; this is the
 * same choice offered from the workspace header instead, for a shell that
 * hides the chat's chrome. Same options — `'none'` plus whatever contributed
 * a {@link LoopChatSurface} — same gating, same channel to the chat.
 *
 * @module loop/plugins/editors/EditorSelector
 */

import type { JSX } from 'react';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Box, SegmentedControl } from '@primer/react';
import { useContributions } from '@datalayer/reactor/react';
import {
  LoopChatSurface,
  canOpenView,
  type LoopWorkspaceContext,
} from '../../core';
import {
  NONE_EDITOR,
  chooseEditor,
  getEditorChoice,
  setEditorOptions,
  subscribeEditorChoice,
} from './editorChoice';

export type EditorSelectorProps = {
  /** Handed by the header slot. */
  workspace?: LoopWorkspaceContext;
};

export function EditorSelector({
  workspace,
}: EditorSelectorProps): JSX.Element | null {
  const surfaces = useContributions(LoopChatSurface);
  const choice = useSyncExternalStore(subscribeEditorChoice, getEditorChoice);

  const ordered = useMemo(
    () =>
      [...surfaces]
        .map(entry => entry.value)
        .sort((left, right) => (left.order ?? 100) - (right.order ?? 100)),
    [surfaces],
  );

  // Published for the `/editor` command, which cycles from outside React and
  // cannot read contributions itself.
  useEffect(() => {
    setEditorOptions(ordered.map(surface => surface.surfaceId));
  }, [ordered]);

  if (!workspace || ordered.length === 0) {
    // Nothing to choose between. A control with one option is furniture, and
    // the surfaces arrive with the plugins that contribute them.
    return null;
  }

  return (
    <Box
      sx={{
        // Held to the trailing edge of the header, whatever else is in it:
        // the selector is chrome about the workspace, not about the message
        // being written.
        marginLeft: 'auto',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <SegmentedControl aria-label="Editor" size="small">
        <SegmentedControl.Button
          selected={choice.editorId === NONE_EDITOR}
          onClick={() => chooseEditor(NONE_EDITOR)}
        >
          None
        </SegmentedControl.Button>
        {ordered.map(surface => {
          const openable = canOpenView(surface, workspace);
          const reason = openable
            ? undefined
            : (surface.unavailableReason?.(workspace) ??
              'Not available right now');
          return (
            <SegmentedControl.Button
              key={surface.surfaceId}
              selected={choice.editorId === surface.surfaceId}
              // `aria-disabled` rather than `disabled`: a disabled button is
              // not focusable, so a keyboard or screen-reader user would never
              // hear *why* the editor is unavailable. It stays focusable, the
              // title explains, and the handler declines.
              aria-disabled={!openable}
              title={reason ?? surface.title}
              // Primer types this as its own icon shape; a contribution may
              // bring any component, which is the point of the extension
              // point.
              leadingIcon={surface.icon as never}
              onClick={() => {
                if (openable) {
                  chooseEditor(surface.surfaceId);
                }
              }}
            >
              {surface.title}
            </SegmentedControl.Button>
          );
        })}
      </SegmentedControl>
    </Box>
  );
}

export default EditorSelector;
