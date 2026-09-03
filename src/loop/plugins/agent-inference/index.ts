/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-inference` — the capacity, as a plugin.
 *
 * Mounts the `example-inference` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `loop/plugins/agent-capacity`.
 *
 * @module loop/plugins/agent-inference
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_INFERENCE_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-inference';

export const AgentInferencePlugin = defineAgentCapacityPlugin({
  key: 'inference',
  displayName: 'Agent Inference Provider',
  description: 'Agent Inference Provider',
  specId: 'example-inference',
  octicon: 'cpu',
  emoji: '🧠',
  suggestions: [
    {
      text: 'Compare providers',
      message:
        'Give me a short 3-point comparison between local and datalayer inference providers.',
    },
  ],
});

export default AgentInferencePlugin;
