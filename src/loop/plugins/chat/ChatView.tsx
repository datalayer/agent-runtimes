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
 * @module loop/plugins/chat/ChatView
 */

import { ChatBase } from '../../../chat/base/ChatBase';
import type { LoopViewProps } from '../../core';

export default function ChatView({ workspace }: LoopViewProps): JSX.Element {
  return (
    <ChatBase
      protocol={{
        type: 'ag-ui',
        endpoint: `${workspace.serverUrl}/api/v1/ag-ui/agent/`,
        agentId: workspace.agentId,
        configEndpoint: `${workspace.serverUrl}/api/v1/configure/config`,
        enableConfigQuery: true,
      }}
      showHeader={false}
      // The workspace owns the prompt: two input boxes on one screen is one too
      // many, and the shell's is the one that runs slash commands.
      showInput={false}
      enableStreaming
    />
  );
}
