/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentSubagentsExample
 *
 * Demonstrates multi-agent delegation using subagents-pydantic-ai.
 * The parent agent orchestrates a researcher and a writer subagent,
 * delegating tasks and combining results for the user.
 *
 * - Creates a local agent from the 'demo-subagents' spec
 * - Shows a Chat component for interacting with the orchestrator
 * - Sidebar displays subagent info and active task status
 */

/// <reference types="vite/client" />

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Text, Spinner, Heading, Label, Timeline } from '@primer/react';
import {
  PeopleIcon,
  PersonIcon,
  CheckCircleFillIcon,
  ClockIcon,
  XCircleFillIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { AuthRequiredView, ErrorView } from './components';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { Chat } from '../chat';

const AGENT_NAME = 'subagents-demo-agent';
const AGENT_SPEC_ID = 'demo-subagents';
const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';

interface SubagentInfo {
  name: string;
  description: string;
  preferredMode: string;
  typicalComplexity: string;
  canAskQuestions: boolean;
}

const SUBAGENTS: SubagentInfo[] = [
  {
    name: 'researcher',
    description:
      'Researches topics, gathers facts, and provides detailed analysis',
    preferredMode: 'sync',
    typicalComplexity: 'moderate',
    canAskQuestions: true,
  },
  {
    name: 'writer',
    description:
      'Writes clear, structured content based on research or instructions',
    preferredMode: 'sync',
    typicalComplexity: 'moderate',
    canAskQuestions: false,
  },
];

const AgentSubagentsInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();
  const agentName = useRef(uniqueAgentId(AGENT_NAME)).current;
  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(agentName);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);

  const agentBaseUrl = DEFAULT_LOCAL_BASE_URL;
  const chatAuthToken: string | undefined = token === null ? undefined : token;

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

    const createLocalAgent = async () => {
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
              'Subagents demo – multi-agent delegation with researcher and writer',
            agent_library: 'pydantic-ai',
            transport: 'vercel-ai',
            agent_spec_id: AGENT_SPEC_ID,
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
              detail || `Failed to create local agent: ${response.status}`,
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

    void createLocalAgent();

    return () => {
      isCancelled = true;
    };
  }, [agentBaseUrl, authFetch]);

  if (!isReady && runtimeStatus !== 'error') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: 3,
        }}
      >
        <Spinner size="large" />
        <Text sx={{ color: 'fg.muted' }}>
          Launching subagents demo agent...
        </Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
    return <ErrorView error={hookError} onLogout={onLogout} />;
  }

  return (
    <Box
      sx={{
        height: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: 'column',
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
        <PeopleIcon size={16} />
        <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
          Subagents Demo
        </Heading>
        {isReconnectedAgent && (
          <Label variant="secondary" size="small">
            Reconnected
          </Label>
        )}
        <Label variant="accent">{SUBAGENTS.length} subagents</Label>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Chat
            protocol="vercel-ai"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            authToken={chatAuthToken}
            title="Subagents Orchestrator"
            placeholder="Ask me to research a topic, write content, or both..."
            description="Multi-agent delegation with researcher & writer"
            showHeader={true}
            autoFocus
            height="100%"
            runtimeId={agentId}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
            suggestions={[
              {
                title: 'Research & write',
                message:
                  'Research the pros and cons of Python async patterns and write a summary.',
              },
              {
                title: 'Research only',
                message:
                  'Find recent advances in LLM fine-tuning and provide a detailed analysis.',
              },
              {
                title: 'Write only',
                message:
                  'Write a concise guide on REST API design best practices.',
              },
            ]}
            submitOnSuggestionClick
          />
        </Box>

        <Box
          sx={{
            width: 320,
            borderLeft: '1px solid',
            borderColor: 'border.default',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
          }}
        >
          <Box
            sx={{
              p: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
              Available Subagents
            </Heading>
            <Timeline>
              {SUBAGENTS.map(sa => (
                <Timeline.Item key={sa.name}>
                  <Timeline.Badge>
                    <PersonIcon />
                  </Timeline.Badge>
                  <Timeline.Body>
                    <Box sx={{ mb: 1 }}>
                      <Text sx={{ fontWeight: 'bold', fontSize: 1 }}>
                        {sa.name}
                      </Text>
                    </Box>
                    <Text
                      as="p"
                      sx={{ fontSize: 0, color: 'fg.muted', mt: 0, mb: 1 }}
                    >
                      {sa.description}
                    </Text>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Label size="small" variant="secondary">
                        {sa.preferredMode}
                      </Label>
                      <Label size="small" variant="secondary">
                        {sa.typicalComplexity}
                      </Label>
                      {sa.canAskQuestions && (
                        <Label size="small" variant="accent">
                          can ask questions
                        </Label>
                      )}
                    </Box>
                  </Timeline.Body>
                </Timeline.Item>
              ))}
            </Timeline>
          </Box>

          <Box
            sx={{
              p: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
              Delegation Tools
            </Heading>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                {
                  name: 'task',
                  desc: 'Assign a task to a subagent',
                  icon: ClockIcon,
                },
                {
                  name: 'check_task',
                  desc: 'Check status of a running task',
                  icon: CheckCircleFillIcon,
                },
                {
                  name: 'list_active_tasks',
                  desc: 'View all active delegated tasks',
                  icon: PeopleIcon,
                },
                {
                  name: 'soft_cancel_task',
                  desc: 'Gracefully cancel a task',
                  icon: XCircleFillIcon,
                },
              ].map(tool => (
                <Box
                  key={tool.name}
                  sx={{
                    p: 2,
                    border: '1px solid',
                    borderColor: 'border.default',
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <tool.icon size={14} />
                  <Box>
                    <Text
                      sx={{
                        fontSize: 1,
                        fontWeight: 'bold',
                        fontFamily: 'mono',
                      }}
                    >
                      {tool.name}
                    </Text>
                    <Text
                      as="p"
                      sx={{ fontSize: 0, color: 'fg.muted', mt: 0, mb: 0 }}
                    >
                      {tool.desc}
                    </Text>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>

          <Box sx={{ p: 3 }}>
            <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
              How It Works
            </Heading>
            <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 2 }}>
              The orchestrator agent delegates tasks to specialised subagents
              using the <code>task</code> tool. Each subagent runs independently
              with its own model, instructions, and context.
            </Text>
            <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 0 }}>
              Subagents can be configured with different execution modes (sync,
              async, auto), complexity hints, and question-asking capabilities
              for interactive workflows.
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

const AgentSubagentsExample: React.FC = () => {
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
      <AgentSubagentsInner onLogout={handleLogout} />
    </ThemedProvider>
  );
};

export default AgentSubagentsExample;
