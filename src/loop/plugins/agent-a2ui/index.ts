/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-a2ui` — generated surfaces, as a capacity.
 *
 * Mounts the `example-a2ui-agent` agent: ask for a form or a configurator
 * and the answer arrives as an interactive A2UI surface, rendered in the
 * workspace's a2ui view. Cast from the shared capacity mould.
 *
 * @module loop/plugins/agent-a2ui
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_A2UI_PLUGIN_NAME = '@datalayer/loop-plugin-agent-a2ui';

export const AgentA2uiPlugin = defineAgentCapacityPlugin({
  key: 'a2ui',
  displayName: 'Agent A2UI',
  description: 'Generate interactive A2UI surfaces from plain requests.',
  specId: 'example-a2ui-agent',
  octicon: 'browser',
  emoji: '🪟',
  suggestions: [
    {
      text: 'Support ticket intake',
      message:
        'Build a support ticket intake form with category, priority and a description.',
    },
    {
      text: 'Trip booking',
      message:
        'Create a trip booking form with destination, dates, travelers and budget.',
    },
    {
      text: 'Feedback survey',
      message:
        'Generate a customer feedback survey with a rating slider and comments.',
    },
    {
      text: 'Product configurator',
      message:
        'Make a product configurator for a laptop with CPU, RAM and add-ons.',
    },
  ],
});

export default AgentA2uiPlugin;
