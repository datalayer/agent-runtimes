/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useState } from 'react';
import { Spinner } from '@primer/react';
import { Box } from '@datalayer/primer-addons';

export interface AgentSummaryData {
  agentName: string;
  location: string;
  specId?: string;
  status?: string;
  baseUrl?: string;
  agentId?: string;
}

export interface AgentSummaryProps {
  summary: AgentSummaryData | null;
  title?: string;
}

/**
 * Statuses that represent a settled runtime (creation finished, for good or
 * ill). Anything else while the agent has no id is treated as "creating".
 */
const SETTLED_STATUSES = new Set([
  'running',
  'ready',
  'resumed',
  'paused',
  'terminated',
  'archived',
  'stopped',
  'error',
  'failed',
]);

/**
 * Compact agent summary badge with a hover overlay for details.
 */
export const AgentSummary: React.FC<AgentSummaryProps> = ({
  summary,
  title = 'Active Agent',
}) => {
  const [isHovering, setIsHovering] = useState(false);

  const runtimeStatusUrl = summary?.baseUrl
    ? (() => {
        const normalized = summary.baseUrl.replace(/\/$/, '');
        if (normalized.endsWith('/api/v1')) {
          return `${normalized}/runtime/status`;
        }
        return `${normalized}/api/v1/runtime/status`;
      })()
    : undefined;

  if (!summary) {
    return null;
  }

  const normalizedStatus = (summary.status || '').toLowerCase();
  // The agent is still being created while it has no id and its status has not
  // settled into a terminal/running state.
  const isCreating =
    !summary.agentId && !SETTLED_STATUSES.has(normalizedStatus);

  return (
    <Box
      sx={{ position: 'relative' }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <Box
        as="button"
        type="button"
        sx={{
          px: 2,
          py: '6px',
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          bg: 'canvas.default',
          color: 'fg.default',
          fontSize: 0,
          cursor: 'default',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        {isCreating && <Spinner size="small" sx={{ width: 12, height: 12 }} />}
        {summary.agentName} · {summary.location}
      </Box>

      {isHovering && (
        <Box
          sx={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 360,
            p: 2,
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            bg: 'canvas.overlay',
            boxShadow: 'shadow.large',
            zIndex: 120,
            fontSize: 0,
            color: 'fg.default',
          }}
        >
          <Box sx={{ mb: 1, fontWeight: 600 }}>{title}</Box>
          <Box sx={{ color: 'fg.muted' }}>Name: {summary.agentName}</Box>
          <Box sx={{ color: 'fg.muted' }}>Location: {summary.location}</Box>
          <Box sx={{ color: 'fg.muted' }}>Spec: {summary.specId || '—'}</Box>
          <Box sx={{ color: 'fg.muted' }}>
            Status: {isCreating ? 'creating' : summary.status || '—'}
          </Box>
          <Box sx={{ color: 'fg.muted', wordBreak: 'break-all' }}>
            Base URL: {summary.baseUrl || '—'}
          </Box>
          <Box
            sx={{
              color: 'fg.muted',
              wordBreak: 'break-all',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            Agent ID:{' '}
            {summary.agentId ? (
              summary.agentId
            ) : isCreating ? (
              <>
                <Spinner size="small" sx={{ width: 12, height: 12 }} />
                Creating…
              </>
            ) : (
              '—'
            )}
          </Box>
          <Box sx={{ color: 'fg.muted', wordBreak: 'break-all' }}>
            Runtime status:{' '}
            {runtimeStatusUrl ? (
              <Box
                as="a"
                href={runtimeStatusUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: 'accent.fg', textDecoration: 'underline' }}
              >
                {runtimeStatusUrl}
              </Box>
            ) : (
              'n/a'
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};
