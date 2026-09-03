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
  suggestions: [
    {
      text: 'Print demo_params',
      message:
        'Use execute_code to print(demo_params) from the sandbox, then explain what it is.',
    },
    {
      text: 'Inspect demo_params',
      message:
        "Use execute_code to print('demo_params =', demo_params) and confirm its type.",
    },
  ],
});

export default AgentParametersPlugin;
