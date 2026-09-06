/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentA2AExample
 *
 * Delegation to separate agents over the A2A protocol. The orchestrator runs
 * on the local agent-runtimes server, created there by the Loop from the
 * `example-a2a` blueprint; its researcher and writer are not subagents inside
 * its process but agents of their own, launched on the first delegation —
 * beside the orchestrator on the local server, or on Datalayer runtimes when
 * the orchestrator itself runs in the cloud — and spoken to over A2A.
 *
 * - The chat boxes each remote run under its delegation tool card
 * - The A2A sidebar lists the remote agents, where each runs, its card and
 *   task, and keeps the live run box in view
 */

/// <reference types="vite/client" />

import React, { useMemo } from 'react';
import { Heading, Label } from '@primer/react';
import { BroadcastIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { resolveExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { LoopEmbed } from '../loop';
import { AgentA2APlugin } from '../loop/plugins/agent-a2a';
import { A2ASidebarPlugin } from '../loop/plugins/a2a-sidebar';
import { getAgentspecs } from '../specs/agents';

const AGENT_NAME = 'a2a-example-agent';
const AGENTSPEC_ID = 'example-a2a';

/** The agents the orchestrator reaches over A2A, from its spec. */
const remoteAgentCount = (): number =>
  (getAgentspecs(AGENTSPEC_ID)?.subagents?.subagents ?? []).filter(
    subagent => subagent.a2a,
  ).length;

const AgentA2AExample: React.FC = () => {
  const agentName = useMemo(() => uniqueAgentId(AGENT_NAME), []);
  const plugins = useMemo(() => [AgentA2APlugin, A2ASidebarPlugin], []);
  const remoteAgents = remoteAgentCount();

  return (
    <ThemedProvider>
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          bg: 'canvas.default',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            px: 3,
            py: 2,
            borderBottom: '1px solid',
            borderColor: 'border.default',
            flexShrink: 0,
          }}
        >
          <BroadcastIcon size={16} />
          <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
            A2A Demo
          </Heading>
          <Label variant="accent">local</Label>
          <Label variant="accent">
            {remoteAgents} A2A agent{remoteAgents === 1 ? '' : 's'}
          </Label>
        </Box>

        {/* The Loop creates the orchestrator on the Local target from the
            capacity plugin's blueprint, the way the hooks example does. The
            agent-target switch stays visible: with it hidden the Loop pins the
            agent to the page, and the delegation over A2A happens on the
            server, so the agent must run there. The sidebar is a Loop plugin
            and renders in the workspace's own sidebar column. */}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <LoopEmbed
            serverUrl={resolveExampleAgentRuntimesUrl('local')}
            target="local"
            showAgentVariants
            agentId={agentName}
            defaultEditor="none"
            showHeader
            plugins={plugins}
          />
        </Box>
      </Box>
    </ThemedProvider>
  );
};

export default AgentA2AExample;
