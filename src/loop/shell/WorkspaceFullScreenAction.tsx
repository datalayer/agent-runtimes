/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The full-screen control, as a standalone icon.
 *
 * The chat header has always carried one; this is the same behaviour —
 * `useWorkspaceFullScreen`, promoting the whole workspace — packaged for
 * anywhere else a host or plugin wants it. The window-frame plugin puts it in
 * the workspace header, which is what keeps the control reachable for a shell
 * that hides the chat's chrome.
 *
 * Unlike the chat view's own control, this one is a bare icon with no view of
 * its own to paint an overlay on — so it asks the hook to paint one for it
 * (`paintOverlay`), offset by `ChatPluginConfig.fullScreenTopOffset` for a
 * host whose own fixed header needs to survive full screen. A host that never
 * sets that config gets `0`: the same full-viewport overlay, or the same
 * native-API promotion, as before this existed.
 *
 * No hint animation here, deliberately: the chat's control breathes when the
 * first answer arrives because that is where the reader is looking; a header
 * icon that pulsed would be chrome asking for attention it has not earned.
 *
 * @module loop/shell/WorkspaceFullScreenAction
 */

import type { JSX } from 'react';
import { useRef } from 'react';
import { IconButton } from '@primer/react';
import { ScreenFullIcon, ScreenNormalIcon } from '@primer/octicons-react';
import { useReactorPlatform } from '@datalayer/reactor/react';
import { useWorkspaceFullScreen } from './useWorkspaceFullScreen';
import { CHAT_PLUGIN_NAME, type ChatPluginConfig } from '../plugins/chat';

export function WorkspaceFullScreenAction(): JSX.Element {
  /* The button itself anchors the lookup: it is inside the workspace, which
     is all `useWorkspaceFullScreen` needs to find what to promote. */
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const reactor = useReactorPlatform();
  const fullScreenTopOffset =
    reactor.getConfig<ChatPluginConfig>(CHAT_PLUGIN_NAME)
      ?.fullScreenTopOffset ?? 0;
  const { fullScreen, toggle } = useWorkspaceFullScreen(anchorRef, {
    paintOverlay: Boolean(fullScreenTopOffset),
    topOffset: fullScreenTopOffset,
  });

  return (
    <IconButton
      ref={anchorRef}
      icon={fullScreen ? ScreenNormalIcon : ScreenFullIcon}
      aria-label={fullScreen ? 'Exit full screen' : 'Enter full screen'}
      variant="invisible"
      size="small"
      // The far end of the trailing cluster: past the editor selector's auto
      // margin, after the trial clock's `order: 1`.
      sx={{ order: 2 }}
      onClick={toggle}
    />
  );
}

export default WorkspaceFullScreenAction;
