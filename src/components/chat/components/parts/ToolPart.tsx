/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Tool call display component.
 * Renders tool execution with input, output, and status.
 *
 * @module components/chat/components/display/ToolPart
 */

import React from 'react';
import type { ToolUIPart } from 'ai';
import { Text, Button } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { ChevronDownIcon, AlertIcon } from '@primer/octicons-react';
import type { ExecutionResult } from '../../types/execution';

export interface ToolPartProps {
  /** Tool UI part data */
  part: ToolUIPart;
}

/**
 * Check if output contains execution result with errors
 */
function extractExecutionResult(output: unknown): ExecutionResult | null {
  if (!output || typeof output !== 'object') return null;
  const obj = output as Record<string, unknown>;
  // Check if it looks like an ExecutionResult
  if (
    'execution_ok' in obj ||
    'code_error' in obj ||
    'execution_error' in obj ||
    'exit_code' in obj
  ) {
    return obj as unknown as ExecutionResult;
  }
  return null;
}

/**
 * Get status info (label, color, icon) for tool state
 */
function getStatusInfo(
  state: string,
  executionResult?: ExecutionResult | null,
): {
  label: string;
  color: string;
  icon: string;
} {
  // Check for execution errors in the result
  if (executionResult) {
    if (!executionResult.execution_ok) {
      return { label: 'Execution Failed', color: 'danger.fg', icon: '⚠' };
    }
    if (executionResult.code_error) {
      return { label: 'Code Error', color: 'severe.fg', icon: '✕' };
    }
    // Check for non-zero exit code
    if (executionResult.exit_code != null && executionResult.exit_code !== 0) {
      return {
        label: `Exit ${executionResult.exit_code}`,
        color: 'attention.fg',
        icon: '⚠',
      };
    }
  }

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
}

/**
 * ToolPart component for displaying tool execution.
 *
 * Features:
 * - Collapsible display to reduce visual clutter
 * - Status indicator (pending, running, completed, error)
 * - JSON display for input parameters
 * - JSON display for output/result
 * - Rich error display with execution vs code error distinction
 */
export function ToolPart({ part }: ToolPartProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);

  // Extract execution result if present in output
  const executionResult = extractExecutionResult(part.output);
  const statusInfo = getStatusInfo(part.state, executionResult);
  const toolName = part.type.split('-').slice(1).join('-') || part.type;
  const effectiveExitOutput =
    executionResult?.output ??
    (typeof part.output === 'string'
      ? part.output
      : part.output != null && typeof part.output === 'object'
        ? (((part.output as Record<string, unknown>).output as string) ??
          ((part.output as Record<string, unknown>).stdout as string) ??
          ((part.output as Record<string, unknown>).stderr as string) ??
          undefined)
        : undefined);

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

          {/* Execution Error (infrastructure failure) */}
          {executionResult && !executionResult.execution_ok && (
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
                <AlertIcon size={12} /> Execution Error
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
                  {executionResult.execution_error ||
                    'Sandbox execution failed'}
                </Text>
                <Text
                  sx={{
                    display: 'block',
                    fontSize: 0,
                    color: 'fg.muted',
                    marginTop: 1,
                  }}
                >
                  The sandbox or execution environment failed to run the code.
                </Text>
              </Box>
            </Box>
          )}

          {/* Code Error (Python exception) */}
          {executionResult &&
            executionResult.execution_ok &&
            executionResult.code_error && (
              <Box sx={{ padding: 3 }}>
                <Text
                  sx={{
                    display: 'block',
                    fontSize: 0,
                    fontWeight: 'semibold',
                    color: 'severe.fg',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: 2,
                  }}
                >
                  Code Error: {executionResult.code_error.name}
                </Text>
                <Box
                  sx={{
                    backgroundColor: 'severe.subtle',
                    borderRadius: 2,
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: 'severe.muted',
                  }}
                >
                  <Box sx={{ padding: 2 }}>
                    <Text sx={{ fontSize: 0, color: 'severe.fg' }}>
                      {executionResult.code_error.value}
                    </Text>
                  </Box>
                  {executionResult.code_error.traceback && (
                    <Box
                      sx={{
                        borderTop: '1px solid',
                        borderColor: 'severe.muted',
                        backgroundColor: 'canvas.inset',
                      }}
                    >
                      <pre
                        style={{
                          margin: 0,
                          padding: '8px 12px',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          lineHeight: 1.4,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          maxHeight: '200px',
                          overflow: 'auto',
                        }}
                      >
                        {executionResult.code_error.traceback}
                      </pre>
                    </Box>
                  )}
                </Box>
              </Box>
            )}

          {/* Exit Code (non-zero exit from sys.exit()) */}
          {executionResult &&
            executionResult.execution_ok &&
            !executionResult.code_error &&
            executionResult.exit_code != null &&
            executionResult.exit_code !== 0 && (
              <Box sx={{ padding: 3 }}>
                <Text
                  sx={{
                    display: 'block',
                    fontSize: 0,
                    fontWeight: 'semibold',
                    color: 'attention.fg',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: 2,
                  }}
                >
                  Process Exited
                </Text>
                <Box
                  sx={{
                    backgroundColor: 'attention.subtle',
                    borderRadius: 2,
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: 'attention.muted',
                    padding: 2,
                  }}
                >
                  <Text sx={{ fontSize: 0, color: 'attention.fg' }}>
                    Process exited with code {executionResult.exit_code}
                  </Text>
                  <Text
                    sx={{
                      display: 'block',
                      fontSize: 0,
                      color: 'fg.muted',
                      marginTop: 1,
                    }}
                  >
                    The code called sys.exit() with a non-zero exit code.
                  </Text>
                  {effectiveExitOutput && (
                    <Box
                      sx={{
                        mt: 2,
                        backgroundColor: 'canvas.inset',
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'attention.muted',
                        overflow: 'auto',
                      }}
                    >
                      <pre
                        style={{
                          margin: 0,
                          padding: '10px 12px',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                          lineHeight: 1.4,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          maxHeight: '200px',
                        }}
                      >
                        {effectiveExitOutput}
                      </pre>
                    </Box>
                  )}
                </Box>
              </Box>
            )}

          {/* Tool Error (fallback for errorText from SDK) */}
          {part.state === 'output-error' &&
            'errorText' in part &&
            part.errorText &&
            !executionResult && (
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

export default ToolPart;
