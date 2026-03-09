/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * DurableMemoryExample
 *
 * Demonstrates the Mem0 memory backend for durable agents.
 * Creates an agent with `memory: mem0` so that user preferences
 * and conversation context persist across sessions.
 *
 * The left panel shows a standard Chat. The right panel shows the
 * agent's memory contents (fetched from the REST API) and lets you
 * search them.
 *
 * Backend: `python -m agent_runtimes --port 8765 --debug`
 */

/// <reference types="vite/client" />

import React, { useEffect, useState, useCallback } from 'react';
import {
  Text,
  Button,
  Spinner,
  TextInput,
  Heading,
  Label,
  Flash,
} from '@primer/react';
import { AlertIcon, SearchIcon, DatabaseIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './stores/themedProvider';
import { Chat } from '../chat';

// ─── Constants ─────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:8765';
const AGENT_NAME = 'memory-demo-agent';
const AGENT_SPEC_ID = 'mocks/monitor-sales-kpis'; // uses mem0 memory

// ─── Types ─────────────────────────────────────────────────────────────────

interface MemoryEntry {
  id: string;
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

// ─── Component ─────────────────────────────────────────────────────────────

const DurableMemoryExample: React.FC = () => {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(true);

  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemoryEntry[]>([]);
  const [searching, setSearching] = useState(false);

  // ── Create agent on mount ────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const ensureAgent = async () => {
      try {
        const check = await fetch(
          `${BASE_URL}/api/v1/agents/${encodeURIComponent(AGENT_NAME)}`,
        );
        if (check.ok) {
          if (!cancelled) {
            setAgentId(AGENT_NAME);
            setIsCreating(false);
          }
          return;
        }

        const res = await fetch(`${BASE_URL}/api/v1/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: AGENT_NAME,
            agent_spec_id: AGENT_SPEC_ID,
            transport: 'ag-ui',
            description: 'Agent with Mem0 persistent memory',
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ detail: 'Unknown' }));
          if (res.status === 400 && data.detail?.includes('already exists')) {
            if (!cancelled) {
              setAgentId(AGENT_NAME);
              setIsCreating(false);
            }
            return;
          }
          throw new Error(data.detail);
        }

        const data = await res.json();
        if (!cancelled) {
          setAgentId(data.id);
          setIsCreating(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed');
          setIsCreating(false);
        }
      }
    };

    ensureAgent();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Fetch memory list ────────────────────────────────────────────────────

  const fetchMemories = useCallback(async () => {
    if (!agentId) return;
    try {
      const res = await fetch(`${BASE_URL}/api/v1/agents/${agentId}/memory`);
      if (res.ok) {
        const data = await res.json();
        setMemories(Array.isArray(data) ? data : (data.memories ?? []));
      }
    } catch {
      // Endpoint may not be wired yet — that's ok
    }
  }, [agentId]);

  useEffect(() => {
    if (agentId) {
      fetchMemories();
      const interval = setInterval(fetchMemories, 10_000);
      return () => clearInterval(interval);
    }
  }, [agentId, fetchMemories]);

  // ── Search memory ────────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    if (!agentId || !searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `${BASE_URL}/api/v1/agents/${agentId}/memory/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
  }, [agentId, searchQuery]);

  // ── Loading state ────────────────────────────────────────────────────────

  if (isCreating) {
    return (
      <ThemedProvider>
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
          <Text sx={{ color: 'fg.muted' }}>Creating memory-enabled agent…</Text>
        </Box>
      </ThemedProvider>
    );
  }

  if (error || !agentId) {
    return (
      <ThemedProvider>
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
          <Text sx={{ color: 'danger.fg' }}>{error || 'No agent ID'}</Text>
        </Box>
      </ThemedProvider>
    );
  }

  // ── Main layout ──────────────────────────────────────────────────────────

  return (
    <ThemedProvider>
      <Box sx={{ display: 'flex', height: '100vh' }}>
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
            transport="ag-ui"
            baseUrl={BASE_URL}
            agentId={agentId}
            title="Memory Agent"
            placeholder="Chat — the agent remembers you across sessions…"
            description="Agent with Mem0 persistent memory"
            showHeader={true}
            showTokenUsage={true}
            autoFocus
            height="100%"
            runtimeId={agentId}
            historyEndpoint={`${BASE_URL}/api/v1/history`}
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
    </ThemedProvider>
  );
};

export default DurableMemoryExample;
