/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import type { ToolUIPart } from 'ai';
import { Text, Button } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { ChevronDownIcon } from '@primer/octicons-react';

interface IToolPartProps {
  part: ToolUIPart;
}

export function ToolPart({ part }: IToolPartProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);

  const getStatusInfo = (state: string) => {
    const statusMap: Record<
      string,
      { label: string; color: string; icon: string }
    > = {
      call: { label: 'Pending', color: 'accent.fg', icon: '○' },
      'input-streaming': { label: 'Pending', color: 'accent.fg', icon: '○' },
      'input-available': {
        label: 'Running',
        color: 'attention.fg',
        icon: '⏱',
      },
      executing: { label: 'Running', color: 'attention.fg', icon: '⏱' },
      'output-available': {
        label: 'Completed',
        color: 'success.fg',
        icon: '✓',
      },
      'output-error': { label: 'Error', color: 'danger.fg', icon: '✕' },
      error: { label: 'Error', color: 'danger.fg', icon: '✕' },
    };
    return (
      statusMap[state] || {
        label: state,
        color: 'fg.muted',
        icon: '•',
      }
    );
  };

  const statusInfo = getStatusInfo(part.state);
  const toolName = part.type.split('-').slice(1).join('-') || part.type;

  return (
    <Box
      sx={{
        marginBottom: 2,
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      {/* Tool Header - Collapsible Trigger */}
      <Button
        variant="invisible"
        onClick={() => setIsExpanded(!isExpanded)}
        sx={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 3,
          backgroundColor: 'canvas.subtle',
          border: 'none',
          borderBottom: isExpanded ? '1px solid' : 'none',
          borderColor: 'border.default',
          textAlign: 'left',
          cursor: 'pointer',
          '&:hover': {
            backgroundColor: 'neutral.muted',
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Text sx={{ fontSize: 1, color: 'fg.muted' }}>🔧</Text>
          <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>{toolName}</Text>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              paddingX: 2,
              paddingY: 1,
              borderRadius: 2,
              backgroundColor: 'neutral.subtle',
              fontSize: 0,
            }}
          >
            <Text sx={{ color: statusInfo.color }}>{statusInfo.icon}</Text>
            <Text sx={{ color: statusInfo.color, fontWeight: 'semibold' }}>
              {statusInfo.label}
            </Text>
          </Box>
        </Box>
        <Box
          as="span"
          sx={{
            display: 'inline-flex',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <ChevronDownIcon />
        </Box>
      </Button>

      {/* Tool Content - Collapsible */}
      {isExpanded && (
        <Box>
          {/* Tool Input */}
          <Box
            sx={{
              padding: 3,
              borderBottom:
                part.state === 'output-available' ||
                part.state === 'output-error'
                  ? '1px solid'
                  : 'none',
              borderColor: 'border.default',
            }}
          >
            <Text
              sx={{
                display: 'block',
                fontSize: 0,
                fontWeight: 'semibold',
                color: 'fg.muted',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 2,
              }}
            >
              Parameters
            </Text>
            <Box
              sx={{
                backgroundColor: 'canvas.inset',
                borderRadius: 2,
                overflow: 'auto',
                border: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <pre
                style={{
                  margin: 0,
                  padding: '12px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  lineHeight: 1.5,
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(part.input, null, 2)}
              </pre>
            </Box>
          </Box>

          {/* Tool Output */}
          {part.state === 'output-available' && (
            <Box sx={{ padding: 3 }}>
              <Text
                sx={{
                  display: 'block',
                  fontSize: 0,
                  fontWeight: 'semibold',
                  color: 'fg.muted',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 2,
                }}
              >
                Result
              </Text>
              <Box
                sx={{
                  backgroundColor: 'canvas.default',
                  borderRadius: 2,
                  overflow: 'auto',
                  border: '1px solid',
                  borderColor: 'border.default',
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    padding: '12px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    lineHeight: 1.5,
                    overflow: 'auto',
                  }}
                >
                  {part.output
                    ? typeof part.output === 'string'
                      ? part.output
                      : JSON.stringify(part.output, null, 2)
                    : 'No output'}
                </pre>
              </Box>
            </Box>
          )}

          {/* Tool Error */}
          {part.state === 'output-error' &&
            'errorText' in part &&
            part.errorText && (
              <Box sx={{ padding: 3 }}>
                <Text
                  sx={{
                    display: 'block',
                    fontSize: 0,
                    fontWeight: 'semibold',
                    color: 'danger.fg',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: 2,
                  }}
                >
                  Error
                </Text>
                <Box
                  sx={{
                    backgroundColor: 'danger.subtle',
                    borderRadius: 2,
                    overflow: 'auto',
                    border: '1px solid',
                    borderColor: 'danger.muted',
                    padding: 2,
                  }}
                >
                  <Text sx={{ fontSize: 0, color: 'danger.fg' }}>
                    {part.errorText}
                  </Text>
                </Box>
              </Box>
            )}
        </Box>
      )}
    </Box>
  );
}
