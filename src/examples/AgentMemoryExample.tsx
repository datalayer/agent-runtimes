/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentMemoryExample
 *
 * Demonstrates the Mem0 memory backend for durable agents.
 * Creates a local agent-runtimes agent using the `example-memory` spec.
 *
 * The left panel shows a standard Chat. The right panel shows the
 * agent's memory contents (fetched from the runtime sidecar) and lets
 * you search them.
 */

/// <reference types="vite/client" />

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Text,
  Button,
  Spinner,
  TextInput,
  Heading,
  Label,
  Flash,
} from '@primer/react';
import { SearchIcon, DatabaseIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { AuthRequiredView, ErrorView } from './components';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';

const queryClient = new QueryClient();
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { Chat } from '../chat';
import { useExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';

// ─── Constants ─────────────────────────────────────────────────────────────

const AGENT_NAME = 'memory-example-agent';
const AGENTSPEC_ID = 'example-memory';

// ─── Types ─────────────────────────────────────────────────────────────────

interface MemoryEntry {
  id: string;
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

// ─── Inner component (rendered after auth) ─────────────────────────────────

const AgentMemoryInner: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const { token } = useSimpleAuthStore();
  const agentName = useRef(uniqueAgentId(AGENT_NAME)).current;
  const agentBaseUrl = useExampleAgentRuntimesUrl();
  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(agentName);

  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemoryEntry[]>([]);
  const [searching, setSearching] = useState(false);

  const podName = isReady ? `local:${agentId}` : '(launching…)';

  // Authenticated fetch helper (for sidecar endpoints)
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

      try {
        const response = await authFetch(`${agentBaseUrl}/api/v1/agents`, {
          method: 'POST',
          body: JSON.stringify({
            name: agentName,
            description: 'Agent with Mem0 persistent memory',
            agent_library: 'pydantic-ai',
            transport: 'vercel-ai',
            agent_spec_id: AGENTSPEC_ID,
            enable_skills: true,
            tools: [],
          }),
        });

        let resolvedAgentId = agentName;

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

          if (!(response.status === 409 || /already exists/i.test(detail))) {
            throw new Error(
              detail || `Failed to create local agent: ${response.status}`,
            );
          }
        }

        if (!isCancelled) {
          setAgentId(resolvedAgentId);
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
  }, [agentBaseUrl, agentName, authFetch]);

  // ── Fetch memory list ────────────────────────────────────────────────────

  const fetchMemories = useCallback(async () => {
    if (!isReady || !agentBaseUrl) return;
    try {
      const res = await authFetch(
        `${agentBaseUrl}/api/v1/agents/${agentId}/memory`,
      );
      if (res.ok) {
        const data = await res.json();
        setMemories(Array.isArray(data) ? data : (data.memories ?? []));
      }
    } catch {
      // Endpoint may not be wired yet — that's ok
    }
  }, [isReady, agentBaseUrl, agentId, authFetch]);

  useEffect(() => {
    if (isReady) {
      fetchMemories();
      const interval = setInterval(fetchMemories, 10_000);
      return () => clearInterval(interval);
    }
  }, [isReady, fetchMemories]);

  // ── Search memory ────────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    if (!isReady || !agentBaseUrl || !searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await authFetch(
        `${agentBaseUrl}/api/v1/agents/${agentId}/memory/search`,
        {
          method: 'POST',
          body: JSON.stringify({ query: searchQuery, limit: 5 }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : (data.results ?? []));
      }
    } catch {
      // Endpoint may not exist yet
    } finally {
      setSearching(false);
    }
  }, [isReady, agentBaseUrl, agentId, searchQuery, authFetch]);

  // ── Loading state ────────────────────────────────────────────────────────

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
          Launching local memory-enabled agent…
        </Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
    return <ErrorView error={hookError} onLogout={onLogout} />;
  }

  // ── Main layout ──────────────────────────────────────────────────────────

  return (
    <Box
      sx={{
        height: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Toolbar */}
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
        <DatabaseIcon size={16} />
        <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
          Durable Memory — {podName}
        </Heading>
      </Box>
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left: Chat */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            borderRight: '1px solid',
            borderColor: 'border.default',
          }}
        >
          <Chat
            protocol="vercel-ai"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            title="Memory Agent"
            brandIcon={<DatabaseIcon size={16} />}
            placeholder="Chat — the agent remembers you across sessions…"
            description="Agent with Mem0 persistent memory"
            showHeader={true}
            showTokenUsage={true}
            autoFocus
            height="100%"
            runtimeId={podName}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
            suggestions={[
              {
                title: 'Remember',
                message: 'My favourite colour is midnight blue.',
              },
              { title: 'Recall', message: 'What is my favourite colour?' },
              {
                title: 'Preference',
                message: 'I prefer reports in bullet-point format.',
              },
            ]}
            submitOnSuggestionClick
          />
        </Box>

        {/* Right: Memory inspector */}
        <Box
          sx={{
            width: 340,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            bg: 'canvas.subtle',
          }}
        >
          <Box
            sx={{
              px: 3,
              py: 2,
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <DatabaseIcon size={16} />
              <Heading as="h3" sx={{ fontSize: 2 }}>
                Memory Inspector
              </Heading>
            </Box>
            <Label variant="accent" sx={{ mb: 2 }}>
              Mem0 backend
            </Label>

            <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
              <TextInput
                size="small"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search agent memory…"
                sx={{ flex: 1 }}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
              <Button
                size="small"
                leadingVisual={SearchIcon}
                onClick={handleSearch}
                disabled={searching}
              >
                {searching ? <Spinner size="small" /> : 'Search'}
              </Button>
            </Box>
          </Box>

          {/* Search results */}
          {searchResults.length > 0 && (
            <Box
              sx={{
                px: 3,
                py: 2,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Text
                sx={{
                  fontWeight: 'semibold',
                  fontSize: 0,
                  display: 'block',
                  mb: 1,
                }}
              >
                Search Results ({searchResults.length})
              </Text>
              {searchResults.map((entry, i) => (
                <Box
                  key={entry.id || i}
                  sx={{
                    p: 2,
                    mb: 1,
                    bg: 'canvas.default',
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'border.muted',
                    fontSize: 0,
                  }}
                >
                  <Text sx={{ display: 'block' }}>{entry.content}</Text>
                  {entry.score != null && (
                    <Text sx={{ color: 'fg.muted', fontSize: '10px' }}>
                      score: {entry.score.toFixed(3)}
                    </Text>
                  )}
                </Box>
              ))}
            </Box>
          )}

          {/* All memories */}
          <Box sx={{ flex: 1, overflow: 'auto', px: 3, py: 2 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 2,
              }}
            >
              <Text sx={{ fontWeight: 'semibold', fontSize: 0 }}>
                Stored Memories ({memories.length})
              </Text>
              <Button size="small" variant="invisible" onClick={fetchMemories}>
                Refresh
              </Button>
            </Box>
            {memories.length === 0 ? (
              <Flash variant="default" sx={{ fontSize: 0 }}>
                No memories yet. Start chatting — the agent will remember facts
                and preferences automatically.
              </Flash>
            ) : (
              memories.map((entry, i) => (
                <Box
                  key={entry.id || i}
                  sx={{
                    p: 2,
                    mb: 1,
                    bg: 'canvas.default',
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'border.muted',
                    fontSize: 0,
                  }}
                >
                  <Text sx={{ display: 'block' }}>{entry.content}</Text>
                </Box>
              ))
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

// ─── Sync token to core IAM store ──────────────────────────────────────────

const syncTokenToIamStore = (token: string) => {
  import('@datalayer/core/lib/state').then(({ iamStore }) => {
    iamStore.setState({ token });
  });
};

// ─── Main component with auth gate ─────────────────────────────────────────

const AgentMemoryExample: React.FC = () => {
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
        <AgentMemoryInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentMemoryExample;
