/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Spinner } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { strip } from '@datalayer/core/lib/utils';

export interface AgentSummaryData {
  agentName: string;
  location: string;
  specId?: string;
  status?: string;
  baseUrl?: string;
  sandboxBaseUrl?: string;
  agentId?: string;
  isReady?: boolean;
  error?: string;
}

export interface AgentSummaryProps {
  summary: AgentSummaryData | null;
  title?: string;
}

/**
 * Statuses that represent an agent actively being created/started. The spinner
 * only shows for these; app-navigation states ("selected", "switching") and
 * settled states ("ready", "running", ...) never spin.
 */
const CREATING_STATUSES = new Set([
  'creating',
  'starting',
  'launching',
  'connecting',
  'pending',
  'resuming',
]);

const MAX_AGENT_NAME_LENGTH = 32;

/**
 * Compact agent summary badge with a hover overlay for details.
 */
export const AgentSummary: React.FC<AgentSummaryProps> = ({
  summary,
  title = 'Active Agent',
}) => {
  const [isHovering, setIsHovering] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    clearCloseTimer();
    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setIsHovering(false);
      closeTimerRef.current = null;
    }, 300);
  };

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, []);

  // Both the agent status and the code sandbox status are served by the
  // agent-runtimes API server (summary.baseUrl). Derive each endpoint from that
  // single base so local and cloud runs point at the right server rather than
  // at the Jupyter sandbox URL.
  const apiBase = summary?.baseUrl
    ? (() => {
        const normalized = summary.baseUrl.replace(/\/$/, '');
        return normalized.endsWith('/api/v1') ? normalized : `${normalized}/api/v1`;
      })()
    : undefined;
  const agentStatusUrl = apiBase ? `${apiBase}/runtime/status` : undefined;
  const sandboxStatusUrl = apiBase ? `${apiBase}/agents/sandbox/status` : undefined;

  if (!summary) {
    return null;
  }

  const normalizedStatus = (summary.status || '').toLowerCase();
  // Only show the spinner while the agent is genuinely being created: it is not
  // ready, has no id yet, and its status is an active creation/startup state.
  const isCreating =
    !summary.isReady &&
    !summary.agentId &&
    CREATING_STATUSES.has(normalizedStatus);
  const hasError = Boolean(summary.error);
  // The agent is optional: some examples run only a code sandbox. Show the
  // agent status when there is an agent (or one is being created).
  const hasAgent = Boolean(summary.agentId) || isCreating;
  const shortAgentName = strip(summary.agentName, MAX_AGENT_NAME_LENGTH);
  const badgeLabel = `${summary.agentName} · ${summary.location}`;
  const badgeLabelShort = `${shortAgentName} · ${summary.location}`;

  return (
    <Box
      sx={{ position: 'relative' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Box
        as="button"
        type="button"
        title={badgeLabel}
        sx={{
          px: 2,
          py: '6px',
          maxWidth: 280,
          minWidth: 0,
          border: '1px solid',
          borderColor: hasError ? 'danger.emphasis' : 'border.default',
          borderRadius: 2,
          bg: hasError ? 'danger.subtle' : 'canvas.default',
          color: hasError ? 'danger.fg' : 'fg.default',
          fontSize: 0,
          cursor: 'default',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        {isCreating && <Spinner size="small" sx={{ width: 12, height: 12 }} />}
        {hasError && <span aria-hidden>⚠</span>}
        <Box
          as="span"
          sx={{
            display: 'block',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {badgeLabelShort}
        </Box>
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
            Agent base URL: {summary.baseUrl || '—'}
          </Box>
          <Box sx={{ color: 'fg.muted', wordBreak: 'break-all' }}>
            Code sandbox base URL: {summary.sandboxBaseUrl || '—'}
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
            Agent status:{' '}
            {hasAgent && agentStatusUrl ? (
              <Box
                as="a"
                href={agentStatusUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: 'accent.fg', textDecoration: 'underline' }}
              >
                {agentStatusUrl}
              </Box>
            ) : (
              'n/a'
            )}
          </Box>
          <Box sx={{ color: 'fg.muted', wordBreak: 'break-all' }}>
            Code sandbox status:{' '}
            {sandboxStatusUrl ? (
              <Box
                as="a"
                href={sandboxStatusUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: 'accent.fg', textDecoration: 'underline' }}
              >
                {sandboxStatusUrl}
              </Box>
            ) : (
              'n/a'
            )}
          </Box>
          {hasError && (
            <Box
              sx={{
                mt: 1,
                p: 1,
                border: '1px solid',
                borderColor: 'danger.muted',
                borderRadius: 2,
                bg: 'danger.subtle',
                color: 'danger.fg',
                wordBreak: 'break-word',
              }}
            >
              Error: {summary.error}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};
