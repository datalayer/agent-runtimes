/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-parameters` — the capacity, as a plugin.
 *
 * Mounts the `example-parameters` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `loop/plugins/agent-capacity`.
 *
 * The openers are the spec's own.
 *
 * @module loop/plugins/agent-parameters
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_PARAMETERS_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-parameters';

export const AgentParametersPlugin = defineAgentCapacityPlugin({
  key: 'parameters',
  displayName: 'Agent Parameters',
  description: 'Role: ${String(formData.role ?? ',
  specId: 'example-parameters',
  octicon: 'sliders',
  emoji: '🎚️',
});

export default AgentParametersPlugin;
