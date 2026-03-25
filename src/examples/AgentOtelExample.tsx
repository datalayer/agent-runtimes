/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentOtelExample
 *
 * Combines the Datalayer OTEL observability dashboard with an AI agent sidebar.
 * The main view shows the same Live / SQL / System content as the standalone
 * OTEL example (sourced from `@datalayer/core/views/otel`).  The right panel
 * is a ChatSidebar whose agent is selected from the agent-runtimes library spec
 * list and launched on demand.
 *
 * The OTEL backend is configured via `configuration.otelRunUrl` when available
 * (falling back to `configuration.runUrl`, then `VITE_OTEL_BASE_URL`, then
 * `VITE_DATALAYER_RUN_URL`, then https://prod1.datalayer.run).
 * Agent routes use `VITE_BASE_URL` when provided, otherwise the same resolved
 * direct run URL to avoid proxy-relative calls.
 *
 * For Python-side observability, wire in `agent_runtimes/otel.py`:
 *   from agent_runtimes.otel import setup_otel
 *   setup_otel(service_name="my-otel-demo")
 */

/// <reference types="vite/client" />

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { Text, Button, Select, FormControl } from '@primer/react';
import { TelescopeIcon, PlugIcon, XIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './stores/themedProvider';
import {
  OtelHeader,
  DashboardView,
  SqlView,
  SystemView,
  useSimpleAuthStore,
} from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { useCoreStore } from '@datalayer/core';
import type { Transport } from '../chat';
import type { AgentLibrary } from '../config';
import { ChatSidebar, type ProtocolConfig } from '../chat';
import { DEFAULT_MODEL } from '../specs';

// ─── Environment / defaults ────────────────────────────────────────────────

const OTEL_BASE_URL_ENV: string = import.meta.env.VITE_OTEL_BASE_URL ?? '';
const DATALAYER_RUN_URL_ENV: string =
  import.meta.env.VITE_DATALAYER_RUN_URL ?? '';

/**
 * Base URL of the agent-runtimes server.
 * Defaults to proxy-relative calls when VITE_BASE_URL is unset.
 */
const AGENT_BASE_URL_ENV: string = import.meta.env.VITE_BASE_URL || '';

const DEFAULT_AGENT_TRANSPORT: Transport = 'vercel-ai';
const DEFAULT_AGENT_LIBRARY: AgentLibrary = 'pydantic-ai';

// ─── Types ─────────────────────────────────────────────────────────────────

/** A minimal representation of a spec from /api/v1/agents/library. */
interface LibrarySpec {
  id: string;
  name?: string;
  description?: string;
  transport?: string;
}

// ─── AgentSelectorPanel ────────────────────────────────────────────────────

interface AgentSelectorPanelProps {
  baseUrl: string;
  onConnected: (agentId: string, transport: Transport) => void;
  onDisconnected: () => void;
  isConnected: boolean;
  connectedAgentName?: string;
}

/**
 * Small form for picking an agent spec and launching it.
 * Renders as the `children` of the ChatSidebar so it appears above the chat.
 */
const AgentSelectorPanel: React.FC<AgentSelectorPanelProps> = ({
  baseUrl,
  onConnected,
  onDisconnected,
  isConnected,
  connectedAgentName,
}) => {
  const [specs, setSpecs] = useState<LibrarySpec[]>([]);
  const [selectedSpecId, setSelectedSpecId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch library specs on mount
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${baseUrl}/api/v1/agents/library`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: LibrarySpec[] = await res.json();
        setSpecs(data);
        if (data.length > 0) setSelectedSpecId(data[0].id);
      } catch (e) {
        setError('Could not load agent specs from the backend.');
        console.warn('[AgentOtelExample] Failed to load library specs:', e);
      }
    };
    void load();
  }, [baseUrl]);

  const handleLaunch = useCallback(async () => {
    if (!selectedSpecId) return;
    setLoading(true);
    setError(null);

    try {
      const spec = specs.find(s => s.id === selectedSpecId);
      const transport =
        (spec?.transport as Transport) ?? DEFAULT_AGENT_TRANSPORT;

      const res = await fetch(`${baseUrl}/api/v1/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedSpecId,
          description: `Launched from AgentOtelExample`,
          agent_library: DEFAULT_AGENT_LIBRARY,
          transport,
          model: DEFAULT_MODEL,
          system_prompt:
            'You are a helpful AI assistant observing OTEL telemetry data.',
          agent_spec_id: selectedSpecId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail || `Failed to create agent: ${res.status}`);
      }

      const data = await res.json();
      onConnected(data.id, transport);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to launch agent');
    } finally {
      setLoading(false);
    }
  }, [selectedSpecId, specs, baseUrl, onConnected]);

  if (isConnected) {
    return (
      <Box
        sx={{
          px: 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexShrink: 0,
          bg: 'success.subtle',
        }}
      >
        <PlugIcon size={14} />
        <Text sx={{ fontSize: 1, flex: 1, color: 'success.fg' }}>
          {connectedAgentName ?? 'Agent connected'}
        </Text>
        <Button
          size="small"
          variant="invisible"
          onClick={onDisconnected}
          leadingVisual={XIcon}
          sx={{ color: 'fg.muted' }}
        >
          Disconnect
        </Button>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        px: 3,
        py: 2,
        borderBottom: '1px solid',
        borderColor: 'border.default',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        flexShrink: 0,
        bg: 'canvas.subtle',
      }}
    >
      <Text sx={{ fontSize: 0, fontWeight: 'bold', color: 'fg.muted' }}>
        SELECT AGENT
      </Text>

      {specs.length > 0 ? (
        <>
          <FormControl>
            <FormControl.Label visuallyHidden>Agent spec</FormControl.Label>
            <Select
              value={selectedSpecId}
              onChange={e => setSelectedSpecId(e.target.value)}
              block
              size="small"
              disabled={loading}
            >
              {specs.map(s => (
                <Select.Option key={s.id} value={s.id}>
                  {s.name ?? s.id}
                </Select.Option>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="primary"
            size="small"
            onClick={handleLaunch}
            disabled={loading || !selectedSpecId}
            leadingVisual={PlugIcon}
            sx={{ width: '100%' }}
          >
            {loading ? 'Launching…' : 'Launch Agent'}
          </Button>
        </>
      ) : error ? (
        <Text sx={{ fontSize: 1, color: 'danger.fg' }}>{error}</Text>
      ) : (
        <Text sx={{ fontSize: 1, color: 'fg.muted' }}>Loading specs…</Text>
      )}

      {error && specs.length > 0 && (
        <Text sx={{ fontSize: 1, color: 'danger.fg' }}>{error}</Text>
      )}
    </Box>
  );
};

// ─── Main Example ───────────────────────────────────────────────────────────

type OtelView = 'dashboard' | 'sql' | 'system';

const TAB_SX = (active: boolean) => ({
  px: 3,
  py: 2,
  cursor: 'pointer',
  fontSize: 1,
  fontWeight: active ? 'bold' : 'normal',
  color: active ? 'accent.fg' : 'fg.muted',
  borderBottom: '2px solid',
  borderColor: active ? 'accent.fg' : 'transparent',
  '&:hover': { color: 'fg.default' },
});

const AgentOtelExampleInner: React.FC<{
  token: string;
  onSignOut: () => void;
}> = ({ token, onSignOut }) => {
  const { configuration } = useCoreStore();
  const resolvedRunUrl =
    configuration?.otelRunUrl ||
    configuration?.runUrl ||
    OTEL_BASE_URL_ENV ||
    DATALAYER_RUN_URL_ENV ||
    'https://prod1.datalayer.run';
  const otelBaseUrl = resolvedRunUrl;
  const agentBaseUrl = AGENT_BASE_URL_ENV;

  // ── OTEL view state ─────────────────────────────────────────────
  const [view, setView] = useState<OtelView>('dashboard');
  const signalSetterRef = useRef<
    ((s: 'traces' | 'logs' | 'metrics') => void) | null
  >(null);

  const handleSignalRef = useCallback(
    (setter: (s: 'traces' | 'logs' | 'metrics') => void) => {
      signalSetterRef.current = setter;
    },
    [],
  );

  const handleNavigate = useCallback(
    (signal: 'traces' | 'logs' | 'metrics') => {
      setView('dashboard');
      signalSetterRef.current?.(signal);
    },
    [],
  );

  // ── Agent state ─────────────────────────────────────────────────
  const [connectedAgentId, setConnectedAgentId] = useState<string | null>(null);
  const [connectedAgentTransport, setConnectedAgentTransport] =
    useState<Transport>(DEFAULT_AGENT_TRANSPORT);

  const handleAgentConnected = useCallback(
    (agentId: string, transport: Transport) => {
      setConnectedAgentId(agentId);
      setConnectedAgentTransport(transport);
    },
    [],
  );

  const handleAgentDisconnected = useCallback(async () => {
    if (connectedAgentId) {
      try {
        await fetch(`${agentBaseUrl}/api/v1/agents/${connectedAgentId}`, {
          method: 'DELETE',
        });
      } catch (e) {
        console.warn('[AgentOtelExample] Failed to delete agent:', e);
      }
    }
    setConnectedAgentId(null);
  }, [connectedAgentId, agentBaseUrl]);

  // Build AG-UI protocol config from connected agent
  const protocolConfig = useMemo((): ProtocolConfig | undefined => {
    if (!connectedAgentId) return undefined;
    if (connectedAgentTransport === 'ag-ui') {
      return {
        type: 'ag-ui',
        endpoint: `${agentBaseUrl}/api/v1/examples/${connectedAgentId}/`,
        agentId: connectedAgentId,
      };
    }
    if (connectedAgentTransport === 'a2a') {
      return {
        type: 'a2a',
        endpoint: `${agentBaseUrl}/api/v1/a2a/${connectedAgentId}`,
        agentId: connectedAgentId,
      };
    }
    // Fallback – try ag-ui
    return {
      type: 'ag-ui',
      endpoint: `${agentBaseUrl}/api/v1/examples/${connectedAgentId}/`,
      agentId: connectedAgentId,
    };
  }, [connectedAgentId, connectedAgentTransport, agentBaseUrl]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 90px)',
        overflow: 'hidden',
        bg: 'canvas.default',
        color: 'fg.default',
      }}
    >
      {/* ── Header ── */}
      <OtelHeader
        baseUrl={otelBaseUrl}
        token={token}
        onNavigate={handleNavigate}
        onSignOut={onSignOut}
        showGenerateButtons={false}
        trailing={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <TelescopeIcon size={16} />
            <Text sx={{ fontSize: 1, color: 'fg.muted' }}>{otelBaseUrl}</Text>
          </Box>
        }
      />

      {/* ── Content row ─────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* ── Main OTEL area ──────────────────────────────────────── */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          {/* Tab bar */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              px: 2,
              bg: 'canvas.default',
              borderBottom: '1px solid',
              borderColor: 'border.default',
              flexShrink: 0,
            }}
          >
            {(['dashboard', 'sql', 'system'] as OtelView[]).map(v => (
              <Box key={v} sx={TAB_SX(view === v)} onClick={() => setView(v)}>
                <Text>
                  {v === 'dashboard' ? 'Live' : v === 'sql' ? 'SQL' : 'System'}
                </Text>
              </Box>
            ))}
          </Box>

          {/* View */}
          <Box
            sx={{
              display: 'flex',
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {view === 'dashboard' ? (
              <DashboardView
                baseUrl={otelBaseUrl}
                wsBaseUrl={otelBaseUrl}
                token={token}
                autoRefreshMs={5000}
                defaultSignal="traces"
                limit={200}
                onSignalRef={handleSignalRef}
              />
            ) : view === 'sql' ? (
              <SqlView baseUrl={otelBaseUrl} token={token} />
            ) : (
              <SystemView baseUrl={otelBaseUrl} token={token} />
            )}
          </Box>
        </Box>

        {/* ── Agent sidebar ────────────────────────────────────────── */}
        <ChatSidebar
          title="AI Agent"
          position="right"
          width={380}
          defaultOpen={true}
          showNewChatButton={true}
          showClearButton={true}
          showSettingsButton={false}
          clickOutsideToClose={false}
          placeholder="Ask the agent about your telemetry data…"
          description="Connect an agent to start chatting about your traces, logs, and metrics."
          panelProps={
            protocolConfig
              ? {
                  protocol: protocolConfig,
                  useStore: true,
                  suggestions: [
                    {
                      title: '🔍 Recent traces',
                      message: 'What do the most recent traces show?',
                    },
                    {
                      title: '⚠️ Errors',
                      message:
                        'Are there any errors or anomalies in the telemetry?',
                    },
                    {
                      title: '📊 Metrics summary',
                      message: 'Give me a summary of the current metrics.',
                    },
                    {
                      title: '🕵️ Root cause',
                      message: 'Help me find the root cause of slow requests.',
                    },
                  ],
                }
              : { useStore: true }
          }
        >
          {/* Agent selector rendered above the chat area */}
          <AgentSelectorPanel
            baseUrl={agentBaseUrl}
            onConnected={handleAgentConnected}
            onDisconnected={handleAgentDisconnected}
            isConnected={!!connectedAgentId}
            connectedAgentName={connectedAgentId ?? undefined}
          />
        </ChatSidebar>
      </Box>
    </Box>
  );
};

/**
 * AgentOtelExample – themed root with auth gate.
 */
const AgentOtelExample: React.FC = () => {
  const token = useSimpleAuthStore(s => s.token);
  const setAuth = useSimpleAuthStore(s => s.setAuth);
  const clearAuth = useSimpleAuthStore(s => s.clearAuth);

  return (
    <ThemedProvider>
      {!token ? (
        <SignInSimple
          onSignIn={setAuth}
          onApiKeySignIn={apiKey => setAuth(apiKey, 'api-key-user')}
          title="Datalayer OTEL"
          description="Sign in to access the observability dashboard."
          leadingIcon={<TelescopeIcon size={24} />}
        />
      ) : (
        <AgentOtelExampleInner token={token} onSignOut={clearAuth} />
      )}
    </ThemedProvider>
  );
};

export default AgentOtelExample;
