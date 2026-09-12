/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-compaction` — history compaction, as a capacity.
 *
 * Mounts the `example-compaction` agent, a long-winded one, under a context
 * token budget: once the history grows past it, older turns are summarized.
 * Cast from the shared capacity mould; the openers are the spec's own.
 *
 * @module loop/plugins/agent-compaction
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_COMPACTION_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-compaction';

/** The budget the plain plugin mounts the agent under, in tokens. */
export const DEFAULT_COMPACTION_MAX_TOKENS = 8000;

/**
 * The capacity for a given budget: what a page that lets the person pick the
 * budget builds once the choice is made.
 */
export function createAgentCompactionPlugin(maxTokens: number) {
  return defineAgentCapacityPlugin({
    key: 'compaction',
    displayName: 'Agent Compaction',
    description: `History compaction under a ${maxTokens.toLocaleString()} token budget.`,
    specId: 'example-compaction',
    octicon: 'history',
    emoji: '🗜️',
    createPayload: { compactionMaxTokens: maxTokens },
  });
}

export const AgentCompactionPlugin = createAgentCompactionPlugin(
  DEFAULT_COMPACTION_MAX_TOKENS,
);

export default AgentCompactionPlugin;
