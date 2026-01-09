/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Default tool call display component.
 * Shows tool execution with collapsible details.
 *
 * @module components/chat/components/display/ToolCallDisplay
 */

import React, { useState } from 'react';
import { Text, Spinner } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ToolsIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
} from '@primer/octicons-react';
import type { ToolCallStatus } from '../base/ChatPanel';

export interface ToolCallDisplayProps {
  /** Tool call ID */
  toolCallId: string;
  /** Tool name */
  toolName: string;
  /** Tool arguments */
  args: Record<string, unknown>;
  /** Tool result (when complete) */
  result?: unknown;
  /** Current status */
  status: ToolCallStatus;
  /** Error message if failed */
  error?: string;
}

/**
 * Get status icon and color based on tool call status
 */
function getStatusDisplay(status: ToolCallStatus): {
  icon: React.ReactNode;
  color: string;
  label: string;
  bgColor: string;
} {
  switch (status) {
    case 'inProgress':
      return {
        icon: <Spinner size="small" />,
        color: 'attention.fg',
        label: 'Preparing...',
        bgColor: 'attention.subtle',
      };
    case 'executing':
      return {
        icon: <ClockIcon size={14} />,
        color: 'attention.fg',
        label: 'Executing...',
        bgColor: 'attention.subtle',
      };
    case 'complete':
      return {
        icon: <CheckCircleIcon size={14} />,
        color: 'success.fg',
        label: 'Complete',
        bgColor: 'success.subtle',
      };
    case 'error':
      return {
        icon: <XCircleIcon size={14} />,
        color: 'danger.fg',
        label: 'Failed',
        bgColor: 'danger.subtle',
      };
    default:
      return {
        icon: <ToolsIcon size={14} />,
        color: 'fg.muted',
        label: status,
        bgColor: 'neutral.subtle',
      };
  }
}

/**
 * Format tool name for display (convert snake_case to Title Case)
 */
function formatToolName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Get a brief summary of the tool arguments
 */
function getArgsSummary(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return 'No parameters';

  const summary = entries
    .slice(0, 2)
    .map(([key, value]) => {
      const strValue =
        typeof value === 'string'
          ? value.slice(0, 30) + (value.length > 30 ? '...' : '')
          : typeof value === 'object'
            ? JSON.stringify(value).slice(0, 30) + '...'
            : String(value);
      return `${key}: ${strValue}`;
    })
    .join(', ');

  if (entries.length > 2) {
    return `${summary} (+${entries.length - 2} more)`;
  }
  return summary;
}

/**
 * ToolCallDisplay component - Default display for tool calls in chat
 *
 * Features:
 * - Collapsible design (starts collapsed)
 * - Shows tool name, status icon, and brief summary when collapsed
 * - Expands to show full parameters and results
 * - Color-coded status indicators
 */
export function ToolCallDisplay({
  toolCallId,
  toolName,
  args,
  result,
  status,
  error,
}: ToolCallDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const statusDisplay = getStatusDisplay(status);
  const displayName = formatToolName(toolName);
  const argsSummary = getArgsSummary(args);

  return (
    <Box
      sx={{
        width: '100%',
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: 'canvas.default',
      }}
    >
      {/* Header - Always visible, clickable to expand */}
      <Box
        as="button"
        onClick={() => setIsExpanded(!isExpanded)}
        sx={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: 2,
          backgroundColor: 'canvas.subtle',
          border: 'none',
          borderBottom: isExpanded ? '1px solid' : 'none',
          borderColor: 'border.default',
          cursor: 'pointer',
          textAlign: 'left',
          '&:hover': {
            backgroundColor: 'neutral.muted',
          },
        }}
      >
        {/* Expand/Collapse icon */}
        <Box sx={{ color: 'fg.muted', flexShrink: 0 }}>
          {isExpanded ? (
            <ChevronDownIcon size={16} />
          ) : (
            <ChevronRightIcon size={16} />
          )}
        </Box>

        {/* Tool icon */}
        <Box sx={{ color: 'fg.muted', flexShrink: 0 }}>
          <ToolsIcon size={16} />
        </Box>

        {/* Tool name */}
        <Text
          sx={{
            fontWeight: 'semibold',
            fontSize: 1,
            color: 'fg.default',
            flexShrink: 0,
          }}
        >
          {displayName}
        </Text>

        {/* Status badge */}
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: '2px',
            borderRadius: 2,
            backgroundColor: statusDisplay.bgColor,
            flexShrink: 0,
          }}
        >
          <Box sx={{ color: statusDisplay.color, display: 'flex' }}>
            {statusDisplay.icon}
          </Box>
          <Text
            sx={{
              fontSize: 0,
              fontWeight: 'medium',
              color: statusDisplay.color,
            }}
          >
            {statusDisplay.label}
          </Text>
        </Box>

        {/* Summary (when collapsed) */}
        {!isExpanded && (
          <Text
            sx={{
              fontSize: 0,
              color: 'fg.muted',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
          >
            {argsSummary}
          </Text>
        )}
      </Box>

      {/* Expanded content */}
      {isExpanded && (
        <Box sx={{ p: 3 }}>
          {/* Parameters section */}
          <Box sx={{ mb: result !== undefined || error ? 3 : 0 }}>
            <Text
              sx={{
                display: 'block',
                fontSize: 0,
                fontWeight: 'semibold',
                color: 'fg.muted',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                mb: 2,
              }}
            >
              Parameters
            </Text>
            <Box
              sx={{
                backgroundColor: 'canvas.inset',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'border.default',
                overflow: 'auto',
                maxHeight: '200px',
              }}
            >
              <pre
                style={{
                  margin: 0,
                  padding: '12px',
                  fontSize: '12px',
                  fontFamily:
                    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {Object.keys(args).length > 0
                  ? JSON.stringify(args, null, 2)
                  : '(no parameters)'}
              </pre>
            </Box>
          </Box>

          {/* Result section (when complete) */}
          {status === 'complete' && result !== undefined && (
            <Box>
              <Text
                sx={{
                  display: 'block',
                  fontSize: 0,
                  fontWeight: 'semibold',
                  color: 'success.fg',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  mb: 2,
                }}
              >
                Result
              </Text>
              <Box
                sx={{
                  backgroundColor: 'success.subtle',
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'success.muted',
                  overflow: 'auto',
                  maxHeight: '300px',
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    padding: '12px',
                    fontSize: '12px',
                    fontFamily:
                      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {typeof result === 'string'
                    ? result
                    : JSON.stringify(result, null, 2)}
                </pre>
              </Box>
            </Box>
          )}

          {/* Error section */}
          {status === 'error' && error && (
            <Box>
              <Text
                sx={{
                  display: 'block',
                  fontSize: 0,
                  fontWeight: 'semibold',
                  color: 'danger.fg',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  mb: 2,
                }}
              >
                Error
              </Text>
              <Box
                sx={{
                  backgroundColor: 'danger.subtle',
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'danger.muted',
                  p: 2,
                }}
              >
                <Text sx={{ fontSize: 1, color: 'danger.fg' }}>{error}</Text>
              </Box>
            </Box>
          )}

          {/* Tool call ID (for debugging) */}
          <Box
            sx={{
              mt: 3,
              pt: 2,
              borderTop: '1px solid',
              borderColor: 'border.muted',
            }}
          >
            <Text
              sx={{ fontSize: 0, color: 'fg.subtle', fontFamily: 'monospace' }}
            >
              ID: {toolCallId}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default ToolCallDisplay;
