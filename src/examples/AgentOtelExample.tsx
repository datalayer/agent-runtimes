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
 * The OTEL backend is configured via `configuration.otelUrl` when available
 * (falling back to `configuration.otelUrl`, then `VITE_OTEL_BASE_URL`, then
 * `VITE_DATALAYER_OTEL_URL`, then the resolved runtime base URL).
 * Agent routes resolve from the shared local/cloud runtime target hook.
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
import { Text, Button, Spinner } from '@primer/react';
import { TelescopeIcon, PlugIcon, XIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import {
  OtelHeader,
  DashboardView,
  SqlView,
  SystemView,
  useSimpleAuthStore,
} from '@datalayer/core/lib/views/otel';
import { useCoreStore } from '@datalayer/core';
import { ThemedProvider } from './utils/themedProvider';
import { AuthRequiredView } from './components';
import { LoopEmbed } from '../loop';
import { AgentOtelPlugin } from '../loop/plugins/agent-otel';
import type { AgentLibrary } from '../types';
import { Protocol } from '../types';
import { useExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';

// ─── Environment / defaults ────────────────────────────────────────────────

const OTEL_BASE_URL_ENV: string = import.meta.env.VITE_OTEL_BASE_URL ?? '';
// Consume-side OTEL override (DATALAYER_OTEL_IN_URL). When set, telemetry is
// read from here instead of VITE_OTEL_BASE_URL (e.g. prod during local dev).
const OTEL_IN_BASE_URL_ENV: string =
  import.meta.env.VITE_OTEL_IN_BASE_URL ?? '';
const OTEL_URL_ENV: string = import.meta.env.VITE_DATALAYER_OTEL_URL ?? '';

const DEFAULT_AGENT_PROTOCOL: Protocol = 'vercel-ai';
const DEFAULT_AGENT_LIBRARY: AgentLibrary = 'pydantic-ai';

/** Spec id this example always launches. */
const AGENTSPEC_ID = 'example-otel';

// ─── AgentLaunchPanel ──────────────────────────────────────────────────────

interface AgentLaunchPanelProps {
  baseUrl: string;
  onConnected: (agentId: string, protocol: Protocol) => void;
  onDisconnected: () => void;
  isConnected: boolean;
  connectedAgentName?: string;
}

/**
 * Small form for picking an agent spec and launching it.
 * Renders as the `children` of the ChatSidebar so it appears above the chat.
 */
const AgentLaunchPanel: React.FC<AgentLaunchPanelProps> = ({
  baseUrl,
  onConnected,
  onDisconnected,
  isConnected,
  connectedAgentName,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const launchedRef = useRef(false);

  const handleLaunch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const transport: Protocol = DEFAULT_AGENT_PROTOCOL;

      const res = await fetch(`${baseUrl}/api/v1/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: AGENTSPEC_ID,
          description: `Launched from AgentOtelExample`,
          agent_library: DEFAULT_AGENT_LIBRARY,
          transport,
          agent_spec_id: AGENTSPEC_ID,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
        const detail =
          typeof err?.detail === 'string' ? err.detail : 'Unknown error';

        // Reuse existing agent when backend reports duplicate creation.
        if (res.status === 409 || /already exists/i.test(detail)) {
          const idMatch = detail.match(
            /Agent with ID '([^']+)' already exists/i,
          );
          const existingId = idMatch?.[1] || AGENTSPEC_ID;
          onConnected(existingId, transport);
          return;
        }

        throw new Error(detail || `Failed to create agent: ${res.status}`);
      }

      const data = await res.json();
      onConnected(data.id, transport);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to launch agent');
      console.warn('[AgentOtelExample] Failed to launch agent:', e);
    } finally {
      setLoading(false);
    }
  }, [baseUrl, onConnected]);

  // Auto-launch the example-otel agent on mount.
  useEffect(() => {
    if (launchedRef.current || isConnected) return;
    launchedRef.current = true;
    void handleLaunch();
  }, [handleLaunch, isConnected]);

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
        bg: 'canvas.default',
      }}
    >
      <Text sx={{ fontSize: 0, fontWeight: 'bold', color: 'fg.muted' }}>
        AGENT
      </Text>

      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Spinner size="small" />
          <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
            Launching {AGENTSPEC_ID}…
          </Text>
        </Box>
      ) : error ? (
        <>
          <Text sx={{ fontSize: 1, color: 'danger.fg' }}>{error}</Text>
          <Button
            variant="primary"
            size="small"
            onClick={handleLaunch}
            leadingVisual={PlugIcon}
            sx={{ width: '100%' }}
          >
            Retry
          </Button>
        </>
      ) : (
        <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
          Launching {AGENTSPEC_ID}…
        </Text>
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
}> = ({ token }) => {
  const { configuration } = useCoreStore();
  const agentBaseUrl = useExampleAgentRuntimesUrl();
  const resolvedUrl =
    OTEL_IN_BASE_URL_ENV ||
    configuration?.otelUrl ||
    configuration?.otelUrl ||
    OTEL_BASE_URL_ENV ||
    OTEL_URL_ENV ||
    agentBaseUrl;
  const otelBaseUrl = resolvedUrl;

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
  //
  // The launch panel creates the `example-otel` agent and reports its id; the
  // LoopEmbed below runs on the Local target pointed at that same id, so its
  // `ensureLocalAgent` finds the created agent and reuses it rather than
  // making a second one. The bespoke launcher and its Disconnect control are
  // kept — the chat column is the shared loop now, everything around it is the
  // example's own.
  const [connectedAgentId, setConnectedAgentId] = useState<string | null>(null);

  const handleAgentConnected = useCallback((agentId: string) => {
    setConnectedAgentId(agentId);
  }, []);

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

  const otelPlugins = useMemo(() => [AgentOtelPlugin], []);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
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
        showGenerateButtons
        showAccountControls={false}
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

        {/* ── Agent sidebar: the example's launcher over the shared loop ── */}
        <Box
          sx={{
            width: 380,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '1px solid',
            borderColor: 'border.default',
            bg: 'canvas.default',
            minHeight: 0,
          }}
        >
          {/* Agent launcher — kept verbatim, above the chat. */}
          <AgentLaunchPanel
            baseUrl={agentBaseUrl}
            onConnected={handleAgentConnected}
            onDisconnected={handleAgentDisconnected}
            isConnected={!!connectedAgentId}
            connectedAgentName={connectedAgentId ?? undefined}
          />
          {/* The conversation, as the shared loop. Local target on the
              launched agent id; the otel capacity plugin carries its spec and
              its telemetry openers. */}
          <Box sx={{ flex: 1, minHeight: 0 }}>
            {connectedAgentId ? (
              <LoopEmbed
                serverUrl={agentBaseUrl}
                target="local"
                agentId={connectedAgentId}
                defaultEditor="none"
                plugins={otelPlugins}
              />
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  px: 3,
                  color: 'fg.muted',
                  fontSize: 1,
                  textAlign: 'center',
                }}
              >
                Connect an agent to start chatting about your traces, logs, and
                metrics.
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

/**
 * AgentOtelExample – themed root with auth gate.
 */
const AgentOtelExample: React.FC = () => {
  const token = useSimpleAuthStore(s => s.token);

  return (
    <ThemedProvider>
      {!token ? <AuthRequiredView /> : <AgentOtelExampleInner token={token} />}
    </ThemedProvider>
  );
};

export default AgentOtelExample;
