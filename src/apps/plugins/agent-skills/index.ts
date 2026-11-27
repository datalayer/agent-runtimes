/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-agent-skills` — the capacity, as a plugin.
 *
 * Mounts the `skills-assistant` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `apps/plugins/agent-capacity`.
 *
 * The openers are the spec's own.
 *
 * @module apps/plugins/agent-skills
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_SKILLS_PLUGIN_NAME = '@datalayer/agent-plugin-agent-skills';

export const AgentSkillsPlugin = defineAgentCapacityPlugin({
  key: 'skills',
  displayName: 'Agent Skills',
  description: 'Agent Skills',
  specId: 'skills-assistant',
  octicon: 'mortar-board',
  emoji: '🎓',
});

export default AgentSkillsPlugin;
