/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useState } from 'react';
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
 * Compact agent summary badge with a hover overlay for details.
 */
export const AgentSummary: React.FC<AgentSummaryProps> = ({
  summary,
  title = 'Active Agent',
}) => {
  const [isHovering, setIsHovering] = useState(false);

  if (!summary) {
    return null;
  }

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
        }}
      >
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
          <Box sx={{ color: 'fg.muted' }}>Spec: {summary.specId || 'n/a'}</Box>
          <Box sx={{ color: 'fg.muted' }}>
            Status: {summary.status || 'n/a'}
          </Box>
          <Box sx={{ color: 'fg.muted', wordBreak: 'break-all' }}>
            Base URL: {summary.baseUrl || 'n/a'}
          </Box>
          <Box sx={{ color: 'fg.muted', wordBreak: 'break-all' }}>
            Agent ID: {summary.agentId || 'pending'}
          </Box>
        </Box>
      )}
    </Box>
  );
};
