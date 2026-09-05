/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-compaction` — the capacity, as a plugin.
 *
 * Mounts the `example-monitoring` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `loop/plugins/agent-capacity`.
 *
 * @module loop/plugins/agent-compaction
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_COMPACTION_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-compaction';

export const AgentCompactionPlugin = defineAgentCapacityPlugin({
  key: 'compaction',
  displayName: 'Agent Compaction',
  description: 'History summarization under a token budget',
  specId: 'example-monitoring',
  octicon: 'fold',
  emoji: '🗜️',
  suggestions: [
    {
      text: 'Fill the context',
      message:
        'Write a detailed, multi-paragraph essay on the history of computing, covering hardware, software, and networking eras.',
    },
    {
      text: 'Keep going',
      message:
        'Now expand each section with more detail and concrete examples, adding at least three paragraphs per era.',
    },
    {
      text: 'Recall earlier',
      message:
        'Summarize everything we have discussed so far in this conversation.',
    },
  ],
});

export default AgentCompactionPlugin;
