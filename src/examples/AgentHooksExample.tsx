/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Lifecycle hooks, demonstrated as a Loop capacity plugin.
 *
 * The capacity lives in `@datalayer/loop-plugin-agent-hooks`: the agentspec
 * the agent is created from, and the openers worth asking it. This file is
 * only the mounting — a reactor application assembled from the standard
 * chat plugins plus that one capacity — where it used to be a bespoke
 * `<Chat>` carrying the same facts as props.
 *
 * @module examples/AgentHooksExample
 */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { resolveExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { LoopEmbed } from '../loop';
import { AgentHooksPlugin } from '../loop/plugins/agent-hooks';

setupPrimerPortals();

const AGENT_NAME = 'hooks-example-agent';

const AgentHooksExample: React.FC = () => {
  // Unique per mount, so two tabs do not fight over one server-side agent.
  const agentName = useMemo(() => uniqueAgentId(AGENT_NAME), []);
  const plugins = useMemo(() => [AgentHooksPlugin], []);
  return (
    <ThemedProvider>
      <Box sx={{ height: '100vh', minHeight: 0 }}>
        <LoopEmbed
          // The examples Vite server has no /api proxy; the page origin would
          // send agent creation to port 3000 and fail loudly.
          serverUrl={resolveExampleAgentRuntimesUrl('local')}
          // Hooks run server-side in the pydantic-ai loop, so the agent lives
          // on the Local target; the control stays visible so the target is
          // never one the reader cannot see or move off.
          target="local"
          showAgentVariants
          agentId={agentName}
          // The conversation is the demonstration; no editor beside it.
          defaultEditor="none"
          showHeader
          plugins={plugins}
        />
      </Box>
    </ThemedProvider>
  );
};

export default AgentHooksExample;
