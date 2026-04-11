/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * McpStatusIndicator — Round coloured dot that shows the aggregate
 * status of MCP servers.  A @primer/react Tooltip lists per-server
 * details on hover.
 *
 * Aggregate logic
 * ───────────────
 * - no servers array / empty → "none"  (gray, hidden or subtle)
 * - any server "starting"   → "starting"  (amber, pulsing)
 * - any server "failed"     → "failed"    (red)
 * - all servers "started"   → "started"   (green)
 * - otherwise               → "not_started" (gray)
 *
 * @module chat/indicators/McpStatusIndicator
 */

import { useEffect, useMemo } from 'react';
import { Tooltip } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { useQuery } from '@tanstack/react-query';
import { useAgentRuntimesClient } from '../../client/AgentRuntimesClientContext';
import type {
  McpAggregateStatus,
  McpServerStatus,
  McpToolsetsStatusResponse,
} from '../../types/mcp';
import { MCP_STATUS_COLORS, MCP_STATUS_LABELS } from '../../types/mcp';

/* ── Props ─────────────────────────────────────────────── */

export interface McpStatusIndicatorProps {
  /** API base URL (e.g. "http://127.0.0.1:8765"). Defaults to
   *  the current host on non-localhost, or localhost:8765. */
  apiBase?: string;
  /** Optional auth token for authenticated requests (e.g. K8s ingress). */
  authToken?: string;
}

/* ── Helpers ───────────────────────────────────────────── */

function getApiBase(apiBase?: string): string {
  if (apiBase) return apiBase;
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1'
    ? 'http://127.0.0.1:8765'
    : '';
}

function deriveAggregate(servers: McpServerStatus[]): McpAggregateStatus {
  if (!servers || servers.length === 0) return 'none';
  if (servers.some(s => s.status === 'starting')) return 'starting';
  if (servers.some(s => s.status === 'failed')) return 'failed';
  if (servers.every(s => s.status === 'started')) return 'started';
  return 'not_started';
}

function buildTooltipText(
  aggregate: McpAggregateStatus,
  servers: McpServerStatus[],
): string {
  if (aggregate === 'none') return MCP_STATUS_LABELS.none;
  const lines = [MCP_STATUS_LABELS[aggregate]];
  for (const s of servers) {
    let detail = `• ${s.id}: ${s.status}`;
    if (s.status === 'started' && s.tools_count !== undefined) {
      detail += ` (${s.tools_count} tools)`;
    }
    if (s.status === 'failed' && s.error) {
      detail += ` — ${s.error}`;
    }
    lines.push(detail);
  }
  return lines.join('\n');
}

const MCP_PULSE_KEYFRAMES = `
@keyframes mcp-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`;

function useInjectKeyframes() {
  useEffect(() => {
    const id = '__mcp-pulse-keyframes__';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = MCP_PULSE_KEYFRAMES;
    document.head.appendChild(style);
  }, []);
}

/* ── Component ─────────────────────────────────────────── */

export function McpStatusIndicator({
  apiBase,
  authToken,
}: McpStatusIndicatorProps) {
  useInjectKeyframes();
  const client = useAgentRuntimesClient();
  const base = getApiBase(apiBase);
  const { data } = useQuery<McpToolsetsStatusResponse>({
    queryKey: ['mcp-toolsets-status', apiBase],
    queryFn: async () => {
      if (!base) {
        throw new Error('No apiBase for MCP status');
      }
      return client.getMcpStatus(base, authToken);
    },
    enabled: !!base,
    refetchInterval: 5000,
  });

  const servers = data?.servers ?? [];
  const aggregate = useMemo(() => deriveAggregate(servers), [servers]);
  const tooltipText = useMemo(
    () => buildTooltipText(aggregate, servers),
    [aggregate, servers],
  );

  // Hide when no servers are configured at all.
  if (aggregate === 'none') return null;

  return (
    <Tooltip text={tooltipText} direction="n">
      <button
        type="button"
        aria-label={tooltipText}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          padding: 0,
          border: 'none',
          background: 'none',
          cursor: 'default',
          lineHeight: 0,
        }}
      >
        <Box
          as="span"
          sx={{
            display: 'inline-block',
            width: 12,
            height: 12,
            borderRadius: '50%',
            bg: MCP_STATUS_COLORS[aggregate],
            flexShrink: 0,
            ...(aggregate === 'starting' && {
              animation: 'mcp-pulse 1.5s ease-in-out infinite',
            }),
          }}
        />
      </button>
    </Tooltip>
  );
}

export default McpStatusIndicator;
