/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentCodemodeExample
 *
 * Compares two Tavily-based agents side-by-side:
 * - Tavily MCP without codemode conversion
 * - Tavily MCP with codemode conversion
 *
 * A sidebar gauge tracks consumed tokens for each agent in real time.
 */

/// <reference types="vite/client" />

import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { Text, Button, Spinner, Heading, Label, Flash } from '@primer/react';
import { CodeIcon, SignOutIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import ReactECharts from 'echarts-for-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { useAIAgentsWebSocket } from '../hooks';
import { Chat } from '../chat';
import {
  parseAgentStreamMessage,
  type AgentStreamSnapshotPayload,
} from '../types/stream';

const queryClient = new QueryClient();

const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';

const SHARED_SUGGESTION_MESSAGE =
  'Extract information from the https://datalayer.ai website and use your sandbox to create a variable "about_datalayer" with that information';

type RuntimeStatus = 'launching' | 'ready' | 'error';

interface DemoAgentConfig {
  key: string;
  title: string;
  subtitle: string;
  specId: string;
  color: string;
}

const DEMO_AGENT_CONFIGS: DemoAgentConfig[] = [
  {
    key: 'no-codemode',
    title: 'Tavily MCP (No Codemode)',
    subtitle: 'Raw MCP tools without codemode conversion',
    specId: 'demo-tavily-no-codemode',
    color: '#0969DA',
  },
  {
    key: 'codemode',
    title: 'Tavily MCP (Codemode)',
    subtitle: 'MCP tools converted into programmatic tools',
    specId: 'demo-tavily-codemode',
    color: '#8250DF',
  },
];

interface AgentRuntimePaneProps {
  config: DemoAgentConfig;
  token: string;
  onTokenConsumed: (agentKey: string, tokens: number) => void;
}

function extractConsumedTokens(payload: AgentStreamSnapshotPayload): number {
  const snapshotCost = payload.contextSnapshot?.costUsage ?? payload.costUsage;
  const totalFromCost = Number(snapshotCost?.totalTokensUsed ?? 0);
  if (totalFromCost > 0) {
    return totalFromCost;
  }
  return Number(payload.contextSnapshot?.totalTokens ?? 0);
}

const AgentRuntimePane: React.FC<AgentRuntimePaneProps> = ({
  config,
  token,
  onTokenConsumed,
}) => {
  const runtimeName = useRef(uniqueAgentId(`codemode-${config.key}`)).current;
  const [runtimeStatus, setRuntimeStatus] =
    useState<RuntimeStatus>('launching');
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(runtimeName);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);

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
    let cancelled = false;

    const createLocalAgent = async () => {
      setRuntimeStatus('launching');
      setHookError(null);
      setIsReconnectedAgent(false);

      try {
        const response = await authFetch(
          `${DEFAULT_LOCAL_BASE_URL}/api/v1/agents`,
          {
            method: 'POST',
            body: JSON.stringify({
              name: runtimeName,
              description: config.subtitle,
              agent_library: 'pydantic-ai',
              transport: 'vercel-ai',
              agent_spec_id: config.specId,
              enable_skills: true,
              tools: [],
            }),
          },
        );

        let resolvedAgentId = runtimeName;
        let alreadyRunning = false;

        if (response.ok) {
          const data = await response.json();
          resolvedAgentId = data?.id || runtimeName;
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
            alreadyRunning = true;
          } else {
            throw new Error(
              detail || `Failed to create local agent: ${response.status}`,
            );
          }
        }

        if (!cancelled) {
          setAgentId(resolvedAgentId);
          setIsReconnectedAgent(alreadyRunning);
          setRuntimeStatus('ready');
        }
      } catch (error) {
        if (!cancelled) {
          setHookError(
            error instanceof Error ? error.message : 'Agent failed to start',
          );
          setRuntimeStatus('error');
        }
      }
    };

    void createLocalAgent();

    return () => {
      cancelled = true;
    };
  }, [authFetch, config.specId, config.subtitle, runtimeName]);

  const handleStreamMessage = useCallback(
    (message: { raw?: unknown }) => {
      try {
        const stream = parseAgentStreamMessage(message?.raw ?? message);
        if (!stream || stream.type !== 'agent.snapshot') {
          return;
        }

        const payload = stream.payload as unknown as AgentStreamSnapshotPayload;
        const consumed = extractConsumedTokens(payload);
        if (consumed >= 0) {
          onTokenConsumed(config.key, consumed);
        }
      } catch {
        // Ignore malformed stream payloads.
      }
    },
    [config.key, onTokenConsumed],
  );

  useAIAgentsWebSocket({
    enabled: runtimeStatus === 'ready',
    baseUrl: DEFAULT_LOCAL_BASE_URL,
    path: '/api/v1/tool-approvals/ws',
    queryParams: { agent_id: agentId },
    onMessage: handleStreamMessage,
    reconnectDelayMs: attempt =>
      Math.min(1000 * 2 ** Math.max(0, attempt - 1), 10000),
  });

  if (runtimeStatus === 'launching') {
    return (
      <Box
        sx={{
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          p: 3,
          minHeight: 220,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Spinner size="small" />
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
          Launching {config.title}...
        </Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
    return (
      <Flash variant="danger" sx={{ borderRadius: 2 }}>
        {config.title}: {hookError || 'Failed to start'}
      </Flash>
    );
  }

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        overflow: 'hidden',
        minHeight: 560,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          px: 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box>
          <Text sx={{ fontWeight: 'bold', display: 'block' }}>
            {config.title}
          </Text>
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{config.subtitle}</Text>
        </Box>
        {isReconnectedAgent && (
          <Label size="small" variant="attention">
            Reconnected
          </Label>
        )}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <Chat
          protocol="vercel-ai"
          baseUrl={DEFAULT_LOCAL_BASE_URL}
          agentId={agentId}
          title={config.title}
          placeholder="Ask both agents the same request to compare behavior..."
          description={config.subtitle}
          showHeader={true}
          autoFocus={false}
          height="100%"
          runtimeId={agentId}
          historyEndpoint={`${DEFAULT_LOCAL_BASE_URL}/api/v1/history`}
          suggestions={[
            {
              title: 'Datalayer extraction',
              message: SHARED_SUGGESTION_MESSAGE,
            },
          ]}
          submitOnSuggestionClick
        />
      </Box>
    </Box>
  );
};

const AgentCodemodeInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();
  const [consumedByAgent, setConsumedByAgent] = useState<
    Record<string, number>
  >({
    'no-codemode': 0,
    codemode: 0,
  });

  const handleTokenConsumed = useCallback(
    (agentKey: string, tokens: number) => {
      setConsumedByAgent(prev => ({
        ...prev,
        [agentKey]: Math.max(prev[agentKey] ?? 0, tokens),
      }));
    },
    [],
  );

  const maxGaugeValue = useMemo(() => {
    const values = Object.values(consumedByAgent);
    const currentMax = values.length > 0 ? Math.max(...values) : 0;
    if (currentMax <= 2000) {
      return 2000;
    }
    const magnitude = 10 ** Math.floor(Math.log10(currentMax));
    return Math.ceil((currentMax * 1.2) / magnitude) * magnitude;
  }, [consumedByAgent]);

  const gaugeOption = useMemo(() => {
    return {
      series: DEMO_AGENT_CONFIGS.map((config, index) => ({
        type: 'gauge',
        center: ['50%', index === 0 ? '30%' : '74%'],
        radius: '45%',
        min: 0,
        max: maxGaugeValue,
        splitNumber: 5,
        progress: {
          show: true,
          width: 12,
          itemStyle: {
            color: config.color,
          },
        },
        axisLine: {
          lineStyle: {
            width: 12,
            color: [[1, '#d1d9e0']],
          },
        },
        axisTick: { show: false },
        splitLine: { length: 8, lineStyle: { color: '#8c959f', width: 1 } },
        axisLabel: {
          distance: 12,
          color: '#57606a',
          fontSize: 10,
        },
        pointer: {
          width: 3,
          length: '60%',
        },
        anchor: {
          show: true,
          size: 8,
          itemStyle: {
            color: config.color,
          },
        },
        title: {
          show: true,
          offsetCenter: [0, '95%'],
          color: '#24292f',
          fontSize: 11,
          fontWeight: 'bold',
        },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, '64%'],
          color: '#24292f',
          fontSize: 14,
          fontWeight: 'bold',
          formatter: (value: number) =>
            `${Math.round(value).toLocaleString()} tok`,
        },
        data: [
          {
            value: consumedByAgent[config.key] ?? 0,
            name: config.title,
          },
        ],
      })),
      tooltip: {
        trigger: 'item',
        formatter: (params: { seriesName?: string; value?: number }) =>
          `${params.seriesName || 'Agent'}<br/>${Math.round(params.value || 0).toLocaleString()} tokens`,
      },
    };
  }, [consumedByAgent, maxGaugeValue]);

  if (!token) {
    return null;
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
        <CodeIcon size={16} />
        <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
          Codemode Comparison: Tavily MCP vs Tavily Codemode
        </Heading>
        {token && <UserBadge token={token} variant="small" />}
        <Button
          size="small"
          variant="invisible"
          onClick={onLogout}
          leadingVisual={SignOutIcon}
          sx={{ color: 'fg.muted' }}
        >
          Sign out
        </Button>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            p: 3,
            display: 'grid',
            gridTemplateColumns: ['1fr', null, '1fr 1fr'],
            gap: 3,
            overflow: 'auto',
          }}
        >
          {DEMO_AGENT_CONFIGS.map(config => (
            <AgentRuntimePane
              key={config.key}
              config={config}
              token={token}
              onTokenConsumed={handleTokenConsumed}
            />
          ))}
        </Box>

        <Box
          sx={{
            width: 340,
            borderLeft: '1px solid',
            borderColor: 'border.default',
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          <Box>
            <Heading as="h4" sx={{ fontSize: 1, mb: 1 }}>
              Consumed Tokens
            </Heading>
            <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
              Live comparison of token consumption for both agents.
            </Text>
          </Box>

          <ReactECharts
            option={gaugeOption}
            style={{ height: 360, width: '100%' }}
          />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {DEMO_AGENT_CONFIGS.map(config => (
              <Box
                key={config.key}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 2,
                }}
              >
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                  {config.title}
                </Text>
                <Text sx={{ fontSize: 0, fontWeight: 'bold' }}>
                  {(consumedByAgent[config.key] ?? 0).toLocaleString()} tokens
                </Text>
              </Box>
            ))}
          </Box>
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

const AgentCodemodeExample: React.FC = () => {
  const { token, setAuth, clearAuth } = useSimpleAuthStore();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (token && !hasSynced.current) {
      hasSynced.current = true;
      syncTokenToIamStore(token);
    }
  }, [token]);

  const handleSignIn = useCallback(
    (newToken: string, handle: string) => {
      setAuth(newToken, handle);
      hasSynced.current = true;
      syncTokenToIamStore(newToken);
    },
    [setAuth],
  );

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
        <SignInSimple
          onSignIn={handleSignIn}
          onApiKeySignIn={apiKey => handleSignIn(apiKey, 'api-key-user')}
          title="Agent Codemode"
          description="Sign in to compare Tavily MCP with and without codemode conversion."
          leadingIcon={<CodeIcon size={24} />}
        />
      </ThemedProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedProvider>
        <AgentCodemodeInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentCodemodeExample;
