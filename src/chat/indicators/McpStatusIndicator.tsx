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
import type {
  McpAggregateStatus,
  McpServerStatus,
  McpToolsetsStatusResponse,
} from '../../types/mcp';
import { MCP_STATUS_COLORS, MCP_STATUS_LABELS } from '../../types/mcp';

/* ── Props ─────────────────────────────────────────────── */

export interface McpStatusIndicatorProps {
  /** Pre-fetched MCP status data pushed via WebSocket.  When provided the
   *  component will NOT poll the REST endpoint. */
  data?: McpToolsetsStatusResponse | null;
  /** @deprecated — Only used when `data` is not provided. */
  apiBase?: string;
  /** @deprecated — Only used when `data` is not provided. */
  authToken?: string;
}

/* ── Helpers ───────────────────────────────────────────── */

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
  if (aggregate === 'none') return 'No MCP Server defined';
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
  data: wsData,
  apiBase,
  authToken,
}: McpStatusIndicatorProps) {
  useInjectKeyframes();

  // REST polling removed — data comes exclusively via WS `agent.snapshot`.
  const effectiveData = wsData;
  const servers = effectiveData?.servers ?? [];
  const aggregate = useMemo(() => deriveAggregate(servers), [servers]);
  const tooltipText = useMemo(
    () => buildTooltipText(aggregate, servers),
    [aggregate, servers],
  );

  // Show a subtle gray dot when no MCP servers are configured.
  // The tooltip tells the user none are defined.

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
