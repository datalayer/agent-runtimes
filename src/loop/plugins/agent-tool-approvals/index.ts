/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-tool-approvals` — tool approvals, as a capacity.
 *
 * Mounts the `example-tool-approvals` agent: two echo tools, one of which is
 * held for a person's approval before it runs. Cast from the shared capacity
 * mould; the openers are the spec's own.
 *
 * @module loop/plugins/agent-tool-approvals
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_TOOL_APPROVALS_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-tool-approvals';

export interface ToolApprovalsCapacityOptions {
  /** The agentspec to mount; the example lets a person pick another. */
  specId?: string;
  /** Create the agent with approvals switched off, to compare. */
  disableToolApprovals?: boolean;
}

/** The capacity for a spec and an approvals setting: what a page that offers both builds per choice. */
export function createAgentToolApprovalsPlugin(
  options: ToolApprovalsCapacityOptions = {},
) {
  const specId = options.specId ?? 'example-tool-approvals';
  const disableToolApprovals = options.disableToolApprovals ?? false;
  return defineAgentCapacityPlugin({
    key: 'tool-approvals',
    displayName: 'Agent Tool Approvals',
    description: disableToolApprovals
      ? 'Runtime tools with approvals switched off, to compare.'
      : 'Runtime tools, the sensitive one held for a person to approve.',
    specId,
    octicon: 'shield-check',
    emoji: '🛡️',
    createPayload: {
      enable_skills: false,
      skills: [],
      tools: ['runtime-echo', 'runtime-sensitive-echo'],
      disableToolApprovals,
    },
  });
}

export const AgentToolApprovalsPlugin = createAgentToolApprovalsPlugin();

export default AgentToolApprovalsPlugin;
