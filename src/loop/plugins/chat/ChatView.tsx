/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The chat view: today's `ChatBase`, wrapped.
 *
 * `ChatBase` is not refactored here. It is 4000-odd lines that work, and
 * dismantling it before the notebook and document plugins exist would stall
 * everything behind a refactor with nothing to show. Until Phase 6 it keeps its
 * own ephemeral surfaces switched on, so replacing the chat page early costs a
 * transitional setting rather than a feature gap.
 *
 * What this view does own is the bridge: the workspace's prompt is the shell's,
 * so the chat has to be *driven* from outside rather than typed into.
 *
 * @module loop/plugins/chat/ChatView
 */

import { useCallback, useEffect, useRef } from 'react';
import { ChatBase } from '../../../chat/base/ChatBase';
import type { LoopViewProps } from '../../core';

type ChatControls = { send: (message: string) => void; stop: () => void };

export default function ChatView({ workspace }: LoopViewProps): JSX.Element {
  const controlsRef = useRef<ChatControls | null>(null);
  const { setViewControls } = workspace;

  // Stable: ChatBase calls these in effects, and a new identity every render
  // would make it re-publish on every render.
  const handleSendReady = useCallback(
    (controls: ChatControls | null) => {
      controlsRef.current = controls;
      setViewControls(controls ? { stop: controls.stop } : null);
    },
    [setViewControls],
  );

  const handleLoadingChange = useCallback(
    (busy: boolean) => {
      setViewControls({ busy, stop: controlsRef.current?.stop });
    },
    [setViewControls],
  );

  // Stop reporting when the view goes away, or the shell would keep a stop
  // button for something that is no longer there.
  useEffect(() => () => setViewControls(null), [setViewControls]);

  useEffect(
    () =>
      workspace.prompts.subscribe(message => {
        // A prompt typed before the adapter is ready is dropped rather than
        // queued: silently sending it minutes later, out of context, is worse
        // than the shell saying nothing happened.
        controlsRef.current?.send(message);
      }),
    [workspace.prompts],
  );

  // The AG-UI mount is per agent, and `default` is the agent a server runs when
  // it was not told otherwise — the same fallback the chat page uses, so a
  // workspace opened without an agent still talks to something.
  const agentId = workspace.agentId?.trim() || 'default';

  return (
    <ChatBase
      protocol={{
        type: 'ag-ui',
        endpoint: `${workspace.serverUrl}/api/v1/ag-ui/${agentId}/`,
        agentId,
        // `/api/v1/configure`, not `/api/v1/configure/config`: the hooks
        // strip one trailing `config`/`configure` segment to find the API base,
        // so the longer form yields `…/api/v1/configure` and every derived URL
        // doubles the segment.
        configEndpoint: `${workspace.serverUrl}/api/v1/configure`,
        enableConfigQuery: true,
      }}
      // The header carries the indicators and token usage that the cutover
      // checklist asks for. The shell's own header row holds the view switcher;
      // Phase 6 moves the indicators into its slot, once the sandbox plugin
      // owns that data.
      showHeader
      // The workspace owns the prompt: two input boxes on one screen is one too
      // many, and the shell's is the one that runs slash commands.
      showInput={false}
      onSendReady={handleSendReady}
      onLoadingChange={handleLoadingChange}
      enableStreaming
    />
  );
}
