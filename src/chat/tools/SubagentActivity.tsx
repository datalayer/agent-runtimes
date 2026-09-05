/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Live subagent activity panel.
 *
 * Renders the streamed interaction timeline for a `delegate_task` tool call:
 * text/thinking deltas, nested tool calls and results, and the final output.
 * Events are sourced from the agent runtime store, keyed by the parent
 * delegation tool call id.
 *
 * @module chat/tools/SubagentActivity
 */

import React, { useMemo, useState } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DependabotIcon,
  ToolsIcon,
  CheckCircleIcon,
  AlertIcon,
  LightBulbIcon,
} from '@primer/octicons-react';
import { useAgentRuntimeSubagentActivity } from '../../stores/agentRuntimeStore';
import type {
  AgentStreamSubagentPayload,
  AgentSubagentPhase,
} from '../../types/stream';

/** A merged, render-ready segment of subagent activity. */
interface SubagentSegment {
  kind: 'text' | 'thinking' | 'tool_call' | 'tool_result' | 'error';
  text?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  result?: string;
  error?: string;
}

/**
 * Collapse the ordered event stream into render segments, merging consecutive
 * text/thinking deltas into single blocks.
 */
function buildSegments(
  events: readonly AgentStreamSubagentPayload[],
): SubagentSegment[] {
  const segments: SubagentSegment[] = [];
  for (const event of events) {
    const phase: AgentSubagentPhase = event.phase;
    if (phase === 'text' || phase === 'thinking') {
      const kind = phase;
      const last = segments[segments.length - 1];
      if (last && last.kind === kind) {
        last.text = (last.text ?? '') + (event.text ?? '');
      } else {
        segments.push({ kind, text: event.text ?? '' });
      }
    } else if (phase === 'tool_call') {
      segments.push({
        kind: 'tool_call',
        toolName: event.toolName,
        toolArgs: event.toolArgs,
      });
    } else if (phase === 'tool_result') {
      segments.push({
        kind: 'tool_result',
        toolName: event.toolName,
        result: event.result,
      });
    } else if (phase === 'error') {
      segments.push({ kind: 'error', error: event.error });
    }
    // `start` and `end` phases are represented by header/status, not segments.
  }
  return segments;
}

export interface SubagentActivityProps {
  /** Parent `delegate_task` tool call id used to look up streamed events. */
  toolCallId: string;
}

/**
 * Displays the live activity timeline for a delegated subagent run.
 * Renders nothing until the first event for `toolCallId` arrives.
 */
export function SubagentActivity({
  toolCallId,
}: SubagentActivityProps): React.ReactElement | null {
  const events = useAgentRuntimeSubagentActivity(toolCallId);
  const [expanded, setExpanded] = useState(true);

  const subagentName = useMemo(() => {
    for (const event of events) {
      if (event.subagentName) return event.subagentName;
    }
    return 'subagent';
  }, [events]);

  const isDone = useMemo(
    () => events.some(e => e.phase === 'end' || e.phase === 'error'),
    [events],
  );
  const hasError = useMemo(
    () => events.some(e => e.phase === 'error'),
    [events],
  );

  const segments = useMemo(() => buildSegments(events), [events]);

  if (events.length === 0) {
    return null;
  }

  const StatusIcon = hasError
    ? AlertIcon
    : isDone
      ? CheckCircleIcon
      : DependabotIcon;
  const statusColor = hasError
    ? 'danger.fg'
    : isDone
      ? 'success.fg'
      : 'accent.fg';

  return (
    <Box
      sx={{
        mt: 1,
        ml: 2,
        borderLeft: '2px solid',
        borderColor: 'border.muted',
        pl: 2,
      }}
    >
      <Box
        as="button"
        onClick={() => setExpanded(prev => !prev)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          width: '100%',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          p: 0,
          color: 'fg.muted',
          textAlign: 'left',
        }}
      >
        {expanded ? (
          <ChevronDownIcon size={12} />
        ) : (
          <ChevronRightIcon size={12} />
        )}
        <Box sx={{ color: statusColor, display: 'flex' }}>
          <StatusIcon size={14} />
        </Box>
        <Text sx={{ fontSize: 0, fontWeight: 'bold', color: 'fg.default' }}>
          {subagentName}
        </Text>
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
          {hasError ? 'failed' : isDone ? 'done' : 'working…'}
        </Text>
      </Box>

      {expanded && (
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {segments.map((segment, index) => (
            <SubagentSegmentView key={index} segment={segment} />
          ))}
        </Box>
      )}
    </Box>
  );
}

function SubagentSegmentView({
  segment,
}: {
  segment: SubagentSegment;
}): React.ReactElement | null {
  switch (segment.kind) {
    case 'text':
      if (!segment.text) return null;
      return (
        <Text
          sx={{
            fontSize: 0,
            color: 'fg.default',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {segment.text}
        </Text>
      );
    case 'thinking':
      if (!segment.text) return null;
      return (
        <Box sx={{ display: 'flex', gap: 1, color: 'fg.muted' }}>
          <Box sx={{ mt: '2px', flexShrink: 0 }}>
            <LightBulbIcon size={12} />
          </Box>
          <Text
            sx={{
              fontSize: 0,
              fontStyle: 'italic',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {segment.text}
          </Text>
        </Box>
      );
    case 'tool_call':
      return (
        <Box sx={{ display: 'flex', gap: 1, color: 'fg.muted' }}>
          <Box sx={{ mt: '2px', flexShrink: 0 }}>
            <ToolsIcon size={12} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Text sx={{ fontSize: 0, fontWeight: 'bold' }}>
              {segment.toolName ?? 'tool'}
            </Text>
            {segment.toolArgs && Object.keys(segment.toolArgs).length > 0 && (
              <Text
                as="pre"
                sx={{
                  fontSize: 0,
                  fontFamily: 'mono',
                  m: 0,
                  mt: '2px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: 'fg.muted',
                }}
              >
                {JSON.stringify(segment.toolArgs)}
              </Text>
            )}
          </Box>
        </Box>
      );
    case 'tool_result':
      if (!segment.result) return null;
      return (
        <Box sx={{ display: 'flex', gap: 1, color: 'fg.muted' }}>
          <Box sx={{ mt: '2px', flexShrink: 0, color: 'success.fg' }}>
            <CheckCircleIcon size={12} />
          </Box>
          <Text
            as="pre"
            sx={{
              fontSize: 0,
              fontFamily: 'mono',
              m: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {segment.result}
          </Text>
        </Box>
      );
    case 'error':
      return (
        <Box sx={{ display: 'flex', gap: 1, color: 'danger.fg' }}>
          <Box sx={{ mt: '2px', flexShrink: 0 }}>
            <AlertIcon size={12} />
          </Box>
          <Text sx={{ fontSize: 0 }}>{segment.error ?? 'Subagent failed'}</Text>
        </Box>
      );
    default:
      return null;
  }
}
