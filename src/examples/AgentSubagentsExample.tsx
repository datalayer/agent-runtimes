/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent Subagents, demonstrated as a Loop capacity plugin.
 *
 * The capacity lives in `@datalayer/loop-plugin-agent-subagents`: the
 * agentspec the agent is created from, and the openers worth asking it.
 * This file is only the mounting — a reactor application assembled from the
 * standard chat plugins plus that one capacity.
 *
 * @module examples/AgentSubagentsExample
 */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { resolveExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { LoopEmbed } from '../loop';
import { AgentSubagentsPlugin } from '../loop/plugins/agent-subagents';

setupPrimerPortals();

const AgentSubagentsExample: React.FC = () => {
  // Unique per mount, so two tabs do not fight over one server-side agent.
  const agentName = useMemo(() => uniqueAgentId('subagents-example-agent'), []);
  const plugins = useMemo(() => [AgentSubagentsPlugin], []);
  return (
    <ThemedProvider>
      <Box sx={{ height: '100vh', minHeight: 0 }}>
        <LoopEmbed
          // The examples Vite server has no /api proxy; the page origin would
          // send agent creation to port 3000 and fail loudly.
          serverUrl={resolveExampleAgentRuntimesUrl('local')}
          // The capacity runs server-side in the pydantic-ai loop, so the
          // agent lives on the Local target; the control stays visible so
          // the target is never one the reader cannot see or move off.
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

export default AgentSubagentsExample;
