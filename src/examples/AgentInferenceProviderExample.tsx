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
import {
  Button,
  Box,
  Heading,
  SegmentedControl,
  Spinner,
  Text,
} from '@primer/react';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { Chat } from '../chat';
import { useAIAgentsWebSocket } from '../hooks';

const AGENTSPEC_ID = 'example-inference';
const AGENT_NAME = 'inference-provider-example-agent';
const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';

const queryClient = new QueryClient();

type InferenceProviderKind = 'local' | 'datalayer';

type ProviderEventRecord = {
  id: string;
  type: string;
  summary: string;
  payload: string;
  createdAt: string;
};

const nowIso = () => new Date().toISOString();

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const stringifyPayload = (value: unknown) => {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const ProviderBadge: React.FC<{ provider: InferenceProviderKind }> = ({
  provider,
}) => (
  <Box
    sx={{
      px: 2,
      py: '2px',
      borderRadius: 999,
      border: '1px solid',
      borderColor: 'border.default',
      fontSize: 0,
      color: 'fg.muted',
      bg: 'canvas.inset',
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
    }}
  >
    {provider}
  </Box>
);

const AgentInferenceProviderExampleInner: React.FC = () => {
  const { token } = useSimpleAuthStore();
  const [provider, setProvider] = useState<InferenceProviderKind>('local');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerEvents, setProviderEvents] = useState<ProviderEventRecord[]>(
    [],
  );
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(
    () => new Set(),
  );

  const currentAgentRef = useRef<string | null>(null);
  const requestEpochRef = useRef(0);

  const baseUrl = DEFAULT_LOCAL_BASE_URL;

  const inferenceUrl = useMemo(() => {
    if (provider === 'local') {
      return 'local inference';
    }
    const env = (import.meta as any).env ?? {};
    return (
      env.VITE_DATALAYER_AI_INFERENCE_URL ||
      env.VITE_DATALAYER_RUN_URL ||
      'https://prod1.datalayer.run'
    );
  }, [provider]);

  const authFetch = useCallback(
    (url: string, init: RequestInit = {}) => {
      return fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.headers ?? {}),
        },
      });
    },
    [token],
  );

  const appendProviderEvent = useCallback(
    (type: string, summary: string, payload: unknown) => {
      setProviderEvents(prev => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type,
          summary,
          payload: stringifyPayload(payload),
          createdAt: nowIso(),
        },
        ...prev,
      ]);
    },
    [],
  );

  const deleteAgent = useCallback(
    async (id: string) => {
      await authFetch(`${baseUrl}/api/v1/agents/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).catch(() => {
        // Best-effort cleanup in example mode.
      });
    },
    [authFetch, baseUrl],
  );

  const launchAgentForProvider = useCallback(
    async (nextProvider: InferenceProviderKind) => {
      requestEpochRef.current += 1;
      const requestEpoch = requestEpochRef.current;
      setIsLaunching(true);
      setError(null);

      const previousAgentId = currentAgentRef.current;
      if (previousAgentId) {
        await deleteAgent(previousAgentId);
      }

      try {
        const configureResponse = await authFetch(
          `${baseUrl}/api/v1/configure/inference/provider`,
          {
            method: 'PUT',
            body: JSON.stringify({ provider: nextProvider }),
          },
        );

        appendProviderEvent(
          'configure.provider',
          `Configured runtime inference provider to ${nextProvider}`,
          {
            status: configureResponse.status,
            provider: nextProvider,
          },
        );

        const name = uniqueAgentId(`${AGENT_NAME}-${nextProvider}`);
        const createResponse = await authFetch(`${baseUrl}/api/v1/agents`, {
          method: 'POST',
          body: JSON.stringify({
            name,
            transport: 'vercel-ai',
            agent_spec_id: AGENTSPEC_ID,
            inferenceProvider: nextProvider,
          }),
        });

        if (!createResponse.ok) {
          const detail = await createResponse.text();
          throw new Error(
            detail || `Failed to create agent (${createResponse.status})`,
          );
        }

        const payload = (await createResponse.json()) as { id?: string };
        const nextAgentId = payload.id || name;

        if (requestEpoch !== requestEpochRef.current) {
          return;
        }

        currentAgentRef.current = nextAgentId;
        setAgentId(nextAgentId);

        appendProviderEvent('agent.created', 'Launched local agent runtime', {
          agentId: nextAgentId,
          agentSpecId: AGENTSPEC_ID,
          inferenceProvider: nextProvider,
          baseUrl,
        });
      } catch (launchError) {
        if (requestEpoch !== requestEpochRef.current) {
          return;
        }
        setAgentId(null);
        currentAgentRef.current = null;
        setError(toErrorMessage(launchError));
        appendProviderEvent('agent.error', 'Failed to launch agent', {
          provider: nextProvider,
          error: toErrorMessage(launchError),
        });
      } finally {
        if (requestEpoch === requestEpochRef.current) {
          setIsLaunching(false);
        }
      }
    },
    [appendProviderEvent, authFetch, baseUrl, deleteAgent],
  );

  useEffect(() => {
    void launchAgentForProvider(provider);
  }, [launchAgentForProvider, provider]);

  useEffect(() => {
    return () => {
      const existing = currentAgentRef.current;
      if (existing) {
        void deleteAgent(existing);
      }
    };
  }, [deleteAgent]);

  const onProviderChange = useCallback((next: InferenceProviderKind) => {
    setProvider(next);
  }, []);

  useAIAgentsWebSocket({
    enabled: Boolean(agentId) && !isLaunching,
    baseUrl,
    path: '/api/v1/tool-approvals/ws',
    queryParams: agentId ? { agent_id: agentId } : undefined,
    onMessage: message => {
      const eventType =
        typeof message.type === 'string'
          ? message.type
          : typeof message.event === 'string'
            ? message.event
            : 'stream.message';
      appendProviderEvent('provider.stream', `Received ${eventType}`, {
        provider,
        agentId,
        message: message.raw ?? message,
      });
    },
    reconnectDelayMs: attempt =>
      Math.min(1000 * 2 ** Math.max(0, attempt - 1), 10000),
  });

  const orderedProviderEvents = useMemo(
    () =>
      [...providerEvents].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    [providerEvents],
  );

  const toggleEventExpanded = useCallback((eventId: string) => {
    setExpandedEventIds(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);

  return (
    <ThemedProvider>
      <Box
        sx={{
          height: '100%',
          minHeight: 0,
          width: '100%',
          display: 'grid',
          gridTemplateColumns: ['1fr', '1fr', 'minmax(680px, 1fr) 420px'],
          gridTemplateRows: 'minmax(0, 1fr)',
          overflow: 'hidden',
          bg: 'canvas.default',
        }}
      >
        <Box
          sx={{
            height: '100%',
            borderRight: ['none', 'none', '1px solid'],
            borderColor: 'border.default',
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 2,
            }}
          >
            <Box>
              <Heading as="h2" sx={{ fontSize: 4, mb: 1 }}>
                Agent Inference Provider Example
              </Heading>
              <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                Launches a local agent runtime from {AGENTSPEC_ID} and lets you
                switch between local and datalayer inference.
              </Text>
            </Box>
            <ProviderBadge provider={provider} />
          </Box>

          <SegmentedControl aria-label="Inference provider" fullWidth>
            <SegmentedControl.Button
              selected={provider === 'local'}
              onClick={() => onProviderChange('local')}
            >
              local
            </SegmentedControl.Button>
            <SegmentedControl.Button
              selected={provider === 'datalayer'}
              onClick={() => onProviderChange('datalayer')}
            >
              datalayer
            </SegmentedControl.Button>
          </SegmentedControl>

          <Box
            sx={{
              display: 'flex',
              gap: 2,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            {isLaunching ? <Spinner size="small" /> : null}
            <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
              Runtime URL: {baseUrl}
            </Text>
            <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
              Inference URL: {inferenceUrl}
            </Text>
            <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
              Agent ID: {agentId || 'launching...'}
            </Text>
          </Box>

          {error ? (
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'danger.emphasis',
                bg: 'danger.subtle',
                color: 'danger.fg',
                fontSize: 1,
              }}
            >
              {error}
            </Box>
          ) : null}

          <Box
            sx={{
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: 0,
              minHeight: 0,
              border: '1px solid',
              borderColor: 'border.default',
              borderRadius: 2,
              overflow: 'hidden',
              bg: 'canvas.default',
            }}
          >
            {agentId && !isLaunching ? (
              <Chat
                protocol="vercel-ai"
                baseUrl={baseUrl}
                agentId={agentId}
                authToken={token ?? undefined}
                title="Agent Inference Provider Example"
                subtitle={`Spec: ${AGENTSPEC_ID}`}
                placeholder="Ask the inference provider something..."
                showHeader={true}
                showNewChatButton={true}
                showClearButton={false}
                showModelSelector={true}
                showToolsMenu={true}
                showSkillsMenu={true}
                showTokenUsage={true}
                autoFocus
                height="100%"
                runtimeId={agentId}
                historyEndpoint={`${baseUrl}/api/v1/history`}
                onMessageSent={content => {
                  appendProviderEvent(
                    'provider.request',
                    `Sent message via ${provider}`,
                    {
                      provider,
                      agentId,
                      content,
                    },
                  );
                }}
                onMessageReceived={message => {
                  appendProviderEvent(
                    'provider.message',
                    'Received stream message',
                    message,
                  );
                }}
                suggestions={[
                  {
                    title: 'Compare providers',
                    message:
                      'Give me a short 3-point comparison between local and datalayer inference providers.',
                  },
                ]}
                submitOnSuggestionClick
              />
            ) : (
              <Box
                sx={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  color: 'fg.muted',
                }}
              >
                <Spinner size="small" />
                <Text sx={{ fontSize: 1 }}>Launching provider runtime…</Text>
              </Box>
            )}
          </Box>
        </Box>

        <Box
          sx={{
            p: 3,
            display: ['none', 'none', 'flex'],
            flexDirection: 'column',
            gap: 2,
            minHeight: 0,
            overflow: 'hidden',
            bg: 'canvas.inset',
          }}
        >
          <Heading as="h3" sx={{ fontSize: 2 }}>
            Provider Event Stream
          </Heading>
          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
            Low-level request/response events exchanged with the inference
            provider (newest first).
          </Text>

          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {providerEvents.length === 0 ? (
              <Box
                sx={{
                  border: '1px dashed',
                  borderColor: 'border.default',
                  borderRadius: 2,
                  p: 3,
                }}
              >
                <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                  No provider events yet.
                </Text>
              </Box>
            ) : (
              orderedProviderEvents.map(event => (
                <Box
                  key={event.id}
                  sx={{
                    border: '1px solid',
                    borderColor: 'border.default',
                    borderRadius: 2,
                    p: 2,
                    bg: 'canvas.default',
                  }}
                >
                  <Text
                    sx={{
                      display: 'block',
                      fontSize: 0,
                      color: 'fg.muted',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {event.type}
                  </Text>
                  <Text
                    sx={{
                      display: 'block',
                      fontWeight: 600,
                      fontSize: 1,
                      mt: 1,
                    }}
                  >
                    {event.summary}
                  </Text>
                  <Text
                    sx={{
                      display: 'block',
                      color: 'fg.muted',
                      fontSize: 0,
                      mt: 1,
                    }}
                  >
                    {new Date(event.createdAt).toLocaleTimeString()}
                  </Text>
                  <Box sx={{ mt: 2 }}>
                    <Button
                      size="small"
                      variant="invisible"
                      onClick={() => toggleEventExpanded(event.id)}
                    >
                      {expandedEventIds.has(event.id)
                        ? 'Hide details'
                        : 'Show details'}
                    </Button>
                  </Box>
                  {expandedEventIds.has(event.id) ? (
                    <Text
                      as="pre"
                      sx={{
                        mt: 2,
                        mb: 0,
                        p: 2,
                        borderRadius: 2,
                        bg: 'canvas.subtle',
                        fontSize: 0,
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'mono',
                      }}
                    >
                      {event.payload}
                    </Text>
                  ) : null}
                </Box>
              ))
            )}
          </Box>
        </Box>
      </Box>
    </ThemedProvider>
  );
};

const AgentInferenceProviderExample: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AgentInferenceProviderExampleInner />
    </QueryClientProvider>
  );
};

export default AgentInferenceProviderExample;
