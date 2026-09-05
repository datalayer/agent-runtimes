/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentA2AExample
 *
 * Delegation to separate agents over the A2A protocol. The orchestrator is
 * created from the `example-a2a` spec on the selected target; its researcher
 * and writer are not subagents inside its process but agents of their own,
 * launched on the first delegation — beside the orchestrator on the local
 * server, or on Datalayer runtimes when the orchestrator runs in the cloud —
 * and spoken to over A2A.
 *
 * - The chat boxes each remote run under its delegation tool card
 * - The A2A sidebar lists the remote agents, where each runs, its card and
 *   task, and keeps the live run box in view
 */

/// <reference types="vite/client" />

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Text, Spinner, Heading, Label } from '@primer/react';
import { BroadcastIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { AuthRequiredView, ErrorView } from './components';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { LoopEmbed } from '../loop';
import { AgentA2APlugin } from '../loop/plugins/agent-a2a';
import { A2ASidebarPlugin } from '../loop/plugins/a2a-sidebar';
import { getAgentspecs } from '../specs/agents';
import { useExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { useRuntimeTargetStore } from './utils/runtimeTargetStore';

const LOOP_PLUGINS_A2A = [AgentA2APlugin, A2ASidebarPlugin];

const AGENT_NAME = 'a2a-example-agent';
const AGENTSPEC_ID = 'example-a2a';

/** The agents the orchestrator reaches over A2A, from its spec. */
const remoteAgentCount = (): number =>
  (getAgentspecs(AGENTSPEC_ID)?.subagents?.subagents ?? []).filter(
    subagent => subagent.a2a,
  ).length;

const AgentA2AInner: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const { token } = useSimpleAuthStore();
  const runtimeTarget = useRuntimeTargetStore(state => state.target);
  const agentName = useRef(uniqueAgentId(AGENT_NAME)).current;
  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(agentName);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);

  const agentBaseUrl = useExampleAgentRuntimesUrl();

  const authFetch = useCallback(
    (url: string, opts: RequestInit = {}) =>
      fetch(url, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(opts.headers ?? {}),
        },
      }),
    [token],
  );

  useEffect(() => {
    let isCancelled = false;

    const createAgentForTarget = async () => {
      setRuntimeStatus('launching');
      setIsReady(false);
      setHookError(null);
      setIsReconnectedAgent(false);

      try {
        const response = await authFetch(`${agentBaseUrl}/api/v1/agents`, {
          method: 'POST',
          body: JSON.stringify({
            name: agentName,
            description:
              'A2A example – delegation to a researcher and a writer reached over A2A',
            agent_library: 'pydantic-ai',
            transport: 'vercel-ai',
            agent_spec_id: AGENTSPEC_ID,
            memory: 'ephemeral',
            enable_skills: true,
            tools: [],
          }),
        });

        let resolvedAgentId = agentName;
        let isAlreadyRunning = false;

        if (response.ok) {
          const data = await response.json();
          resolvedAgentId = data?.id || agentName;
        } else {
          const contentType = response.headers.get('content-type') || '';
          let detail = '';

          if (contentType.includes('application/json')) {
            const data = await response.json().catch(() => null);
            detail =
              (typeof data?.detail === 'string' && data.detail) ||
              (typeof data?.message === 'string' && data.message) ||
              '';
          } else {
            detail = await response.text();
          }

          if (response.status === 409 || /already exists/i.test(detail || '')) {
            isAlreadyRunning = true;
          } else {
            throw new Error(
              detail || `Failed to create the agent: ${response.status}`,
            );
          }
        }

        if (!isCancelled) {
          setAgentId(resolvedAgentId);
          setIsReconnectedAgent(isAlreadyRunning);
          setIsReady(true);
          setRuntimeStatus('ready');
        }
      } catch (error) {
        if (!isCancelled) {
          setHookError(
            error instanceof Error ? error.message : 'Agent failed to start',
          );
          setRuntimeStatus('error');
        }
      }
    };

    void createAgentForTarget();

    return () => {
      isCancelled = true;
    };
  }, [agentBaseUrl, agentName, authFetch, runtimeTarget]);

  if (!isReady && runtimeStatus !== 'error') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 3,
          bg: 'canvas.default',
        }}
      >
        <Spinner size="large" />
        <Text sx={{ color: 'fg.muted' }}>
          Launching the A2A example agent ({runtimeTarget})...
        </Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
    return <ErrorView error={hookError} onLogout={onLogout} />;
  }

  const remoteAgents = remoteAgentCount();

  return (
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
        {isReconnectedAgent && (
          <Label variant="secondary" size="small">
            Reconnected
          </Label>
        )}
        <Label variant="accent">{runtimeTarget}</Label>
        <Label variant="accent">
          {remoteAgents} A2A agent{remoteAgents === 1 ? '' : 's'}
        </Label>
      </Box>

      {/* The sidebar is a Loop plugin: it renders in the workspace's own
          sidebar column, next to the chat. */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <LoopEmbed
          serverUrl={agentBaseUrl}
          target="local"
          agentId={agentId}
          defaultEditor="none"
          showHeader
          plugins={LOOP_PLUGINS_A2A}
        />
      </Box>
    </Box>
  );
};

const AgentA2AExample: React.FC = () => {
  const { token, clearAuth } = useSimpleAuthStore();

  const handleLogout = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  if (!token) {
    return (
      <ThemedProvider>
        <AuthRequiredView />
      </ThemedProvider>
    );
  }

  return (
    <ThemedProvider>
      <AgentA2AInner onLogout={handleLogout} />
    </ThemedProvider>
  );
};

export default AgentA2AExample;
