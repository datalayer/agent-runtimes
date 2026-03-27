/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentMemoryExample
 *
 * Demonstrates the Mem0 memory backend for durable agents.
 * Creates a cloud agent runtime (environment: 'ai-agents-env') via the Datalayer
 * Runtimes API, then deploys an agent with persistent memory on its sidecar.
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
import {
  AlertIcon,
  SearchIcon,
  DatabaseIcon,
  SignOutIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';

const queryClient = new QueryClient();
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { Chat } from '../chat';
import { useAgents } from '../hooks/useAgents';

// ─── Constants ─────────────────────────────────────────────────────────────

const AGENT_NAME = 'memory-demo-agent';
const AGENT_SPEC_ID = 'monitor-sales-kpis'; // uses mem0 memory

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

  const {
    runtime,
    status: runtimeStatus,
    isReady,
    error: hookError,
  } = useAgents({
    agentSpecId: AGENT_SPEC_ID,
    autoStart: true,
    agentConfig: {
      name: AGENT_NAME,
      protocol: 'ag-ui',
      description: 'Agent with Mem0 persistent memory',
    },
  });

  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemoryEntry[]>([]);
  const [searching, setSearching] = useState(false);

  const agentBaseUrl = runtime?.agentBaseUrl || '';
  const agentId = runtime?.agentId || AGENT_NAME;
  const podName = runtime?.podName || '(launching…)';

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
          {runtimeStatus === 'launching'
            ? 'Launching runtime for memory agent…'
            : 'Creating memory-enabled agent…'}
        </Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
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
        <AlertIcon size={48} />
        <Text sx={{ color: 'danger.fg' }}>
          {hookError || 'Agent failed to start'}
        </Text>
      </Box>
    );
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
            protocol="ag-ui"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            title="Memory Agent"
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
          title="Memory Agent"
          description="Sign in to use agents with persistent memory."
          leadingIcon={<DatabaseIcon size={24} />}
        />
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
