/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-checkpoints` — checkpointing, as a capacity.
 *
 * Mounts the `example-checkpoints` agent: its conversation is snapshotted
 * after every turn, and it can save, list and rewind to checkpoints on
 * request. Cast from the shared capacity mould; the openers are the spec's
 * own. Pair it with the checkpoints sidebar to see and use the checkpoints
 * from outside the chat.
 *
 * @module loop/plugins/agent-checkpoints
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_CHECKPOINTS_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-checkpoints';

export const AgentCheckpointsPlugin = defineAgentCapacityPlugin({
  key: 'checkpoints',
  displayName: 'Agent Checkpoints',
  description:
    'Conversation checkpoints: taken every turn, saved on request, rewound to.',
  specId: 'example-checkpoints',
  octicon: 'versions',
  emoji: '💾',
});

export default AgentCheckpointsPlugin;
