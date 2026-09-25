/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-code-sandbox` — the code sandbox, as a capacity.
 *
 * Mounts the `example-code-sandbox` agent: Python run through `execute_code`
 * in a sandbox the server manages, whose variant can be switched live. Cast
 * from the shared capacity mould; the openers are the spec's own.
 *
 * @module loop/plugins/agent-code-sandbox
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_CODE_SANDBOX_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-code-sandbox';

export const AgentCodeSandboxPlugin = defineAgentCapacityPlugin({
  key: 'code-sandbox',
  displayName: 'Agent Code Sandbox',
  description:
    'Python run in a server-managed sandbox: eval or a Jupyter kernel.',
  specId: 'example-code-sandbox',
  octicon: 'codespaces',
  emoji: '📦',
});

export default AgentCodeSandboxPlugin;
