/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vite/client" />

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box } from '@datalayer/primer-addons';
import { AuthRequiredView, ErrorView } from './components';
import { Spinner, Text } from '@primer/react';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { Chat } from '../chat';
import { useAgentRuntimePendingCount } from '../stores/agentRuntimeStore';

const queryClient = new QueryClient();
const AGENT_NAME_PREFIX = 'tool-approval-demo-agent';
const DEFAULT_AGENT_SPEC_ID = 'demo-full';
const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';

const getSelectedAgentSpecIdFromUi = (): string => {
  const params = new URLSearchParams(window.location.search);

  const directKeys = [
    'agent_spec_id',
    'agentSpecId',
    'spec_id',
    'specId',
    'spec',
  ];
  for (const key of directKeys) {
    const value = params.get(key);
    if (value && value.trim()) {
      return value.trim();
    }
  }

  const selectedAgentId = params.get('selectedAgentId');
  if (selectedAgentId?.startsWith('spec:')) {
    const specId = selectedAgentId.slice('spec:'.length).trim();
    if (specId) {
      return specId;
    }
  }

  return DEFAULT_AGENT_SPEC_ID;
};

const buildAgentNameForSpec = (specId: string): string => {
  const slug = specId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const base = slug ? `${AGENT_NAME_PREFIX}-${slug}` : AGENT_NAME_PREFIX;
  return uniqueAgentId(base);
};

const AgentToolApprovalsInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();
  const [selectedSpecId] = useState<string>(() =>
    getSelectedAgentSpecIdFromUi(),
  );
  const agentName = useMemo(
    () => buildAgentNameForSpec(selectedSpecId),
    [selectedSpecId],
  );

  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(agentName);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);

  const chatAuthToken: string | undefined = token === null ? undefined : token;
  const agentBaseUrl = DEFAULT_LOCAL_BASE_URL;
  const podName = 'localhost';
  const pendingApprovalCount = useAgentRuntimePendingCount();
  const createAttemptedRef = useRef(false);

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
    if (createAttemptedRef.current) {
      return;
    }
    createAttemptedRef.current = true;
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
            description: 'Agent with runtime tool approvals',
            agent_library: 'pydantic-ai',
            transport: 'vercel-ai',
            agent_spec_id: selectedSpecId,
            enable_skills: false,
            skills: [],
            tools: ['runtime-echo', 'runtime-sensitive-echo'],
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
  }, [agentBaseUrl, authFetch, agentName, selectedSpecId]);

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
        <Text sx={{ color: 'fg.muted' }}>Launching tool approvals demo...</Text>
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
      {isReconnectedAgent && (
        <Box
          sx={{
            px: 3,
            py: 1,
            borderBottom: '1px solid',
            borderColor: 'border.default',
          }}
        >
          <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
            Agent already running - reconnected.
          </Text>
        </Box>
      )}

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Chat
            protocol="vercel-ai"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            authToken={chatAuthToken}
            title={`Tool Approval Agent - ${podName}`}
            placeholder="Ask for actions that require approval..."
            showHeader={true}
            showNewChatButton={true}
            showClearButton={false}
            showTokenUsage={true}
            autoFocus
            height="100%"
            runtimeId={agentId}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
            headerActions={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                  Pending: {pendingApprovalCount}
                </Text>
              </Box>
            }
            suggestions={[
              {
                title: 'List your tools',
                message: 'list your tools',
              },
              {
                title: 'Run tool with approval',
                message:
                  "Call the runtime_sensitive_echo tool with text 'hello' and reason 'audit', then reply with the tool result.",
              },
              {
                title: 'Run tool without approval',
                message:
                  "Call the runtime_echo tool with text 'hello world', then reply with the tool result.",
              },
            ]}
            submitOnSuggestionClick
          />
        </Box>
      </Box>
    </Box>
  );
};

const syncTokenToIamStore = (token: string) => {
  import('@datalayer/core/lib/state').then(({ iamStore }) => {
    iamStore.setState({ token });
  });
};

const AgentToolApprovalsExample: React.FC = () => {
  const { token, clearAuth } = useSimpleAuthStore();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (token && !hasSynced.current) {
      hasSynced.current = true;
      syncTokenToIamStore(token);
    }
  }, [token]);

  const handleLogout = useCallback(() => {
    clearAuth();
    hasSynced.current = false;
    import('@datalayer/core/lib/state').then(({ iamStore }) => {
      iamStore.setState({ token: undefined });
    });
  }, [clearAuth]);

  if (!token) {
    return (
      <ThemedProvider>
        <AuthRequiredView />
      </ThemedProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedProvider>
        <AgentToolApprovalsInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentToolApprovalsExample;
