/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-skills` — the capacity, as a plugin.
 *
 * Mounts the `example-skills` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `loop/plugins/agent-capacity`.
 *
 * The openers are the spec's own.
 *
 * @module loop/plugins/agent-skills
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_SKILLS_PLUGIN_NAME = '@datalayer/loop-plugin-agent-skills';

export const AgentSkillsPlugin = defineAgentCapacityPlugin({
  key: 'skills',
  displayName: 'Agent Skills',
  description: 'Agent Skills',
  specId: 'example-skills',
  octicon: 'mortar-board',
  emoji: '🎓',
});

export default AgentSkillsPlugin;
