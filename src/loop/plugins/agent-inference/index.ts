/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-inference` — the inference provider, as a capacity.
 *
 * Mounts the `example-inference` agent on a given inference provider — the
 * server's own model access, or Datalayer's inference service. Cast from the
 * shared capacity mould; the openers are the spec's own.
 *
 * @module loop/plugins/agent-inference
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_INFERENCE_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-inference';

/** Where the agent's model calls go. */
export type InferenceProviderKind = 'local' | 'datalayer';

/** The capacity for one provider: what a page that switches providers builds per choice. */
export function createAgentInferencePlugin(provider: InferenceProviderKind) {
  return defineAgentCapacityPlugin({
    key: 'inference',
    displayName: 'Agent Inference Provider',
    description: `Model calls through the ${provider} inference provider.`,
    specId: 'example-inference',
    octicon: 'cpu',
    emoji: '🧠',
    createPayload: { inferenceProvider: provider },
  });
}

export const AgentInferencePlugin = createAgentInferencePlugin('local');

export default AgentInferencePlugin;
