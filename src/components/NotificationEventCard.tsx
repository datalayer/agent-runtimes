/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useState } from 'react';
import { Button, Label, Text, Truncate } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  ChevronDownIcon,
  DownloadIcon,
  EyeClosedIcon,
  EyeIcon,
  TrashIcon,
} from '@primer/octicons-react';
import {
  createMarkdownDownloadPayload,
  downloadTextPayload,
  formatRelativeTime,
} from '@datalayer/core/lib/utils';
import { Streamdown } from 'streamdown';

import { streamdownMarkdownStyles } from '../chat/styles/streamdownStyles';

export interface NotificationEventCardProps {
  event: any;
  onToggleRead: (event: any) => void;
  onDelete: (event: any) => void;
  onOpenAgent?: (agentId: string) => void;
}

const eventStartedAt = (evt: any): string | null => {
  const startedAt = evt?.started_at || evt?.payload?.started_at;
  return typeof startedAt === 'string' && startedAt ? startedAt : null;
};

const eventEndedAt = (evt: any): string | null => {
  const endedAt = evt?.ended_at || evt?.payload?.ended_at;
  return typeof endedAt === 'string' && endedAt ? endedAt : null;
};

const isRunningEvent = (evt: any): boolean => {
  const status = String(evt?.status ?? '').toLowerCase();
  return evt?.kind === 'agent-started' && status === 'running';
};

export function NotificationEventCard({
  event,
  onToggleRead,
  onDelete,
  onOpenAgent,
}: NotificationEventCardProps) {
  const [isOutputExpanded, setIsOutputExpanded] = useState(false);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const startedAt = eventStartedAt(event);
  const endedAt = eventEndedAt(event);
  const running = isRunningEvent(event);
  const outputText =
    event.kind === 'agent-ended' && event.payload?.outputs
      ? String(event.payload.outputs)
      : null;
  const runtimeId = String(
    event?.agent_id ||
      event?.runtime_id ||
      event?.payload?.runtime_id ||
      event?.payload?.agent_id ||
      'runtime',
  );
  const detailEntries: Array<{ label: string; value: string }> = [];
  const detailLineSx = { fontSize: 0, overflowWrap: 'anywhere' as const };
  const detailLabelSx = { color: 'fg.muted' };
  const detailValueSx = { color: 'fg.default' };

  Object.entries(event || {}).forEach(([key, value]) => {
    if (key === 'payload' || key === 'outputs') {
      return;
    }
    if (value === undefined || value === null || value === '') {
      return;
    }
    if (typeof value === 'object') {
      detailEntries.push({ label: key, value: JSON.stringify(value, null, 2) });
      return;
    }
    detailEntries.push({ label: key, value: String(value) });
  });

  Object.entries(event?.payload || {}).forEach(([key, value]) => {
    if (key === 'outputs') {
      return;
    }
    if (value === undefined || value === null || value === '') {
      return;
    }
    if (typeof value === 'object') {
      detailEntries.push({
        label: `payload.${key}`,
        value: JSON.stringify(value, null, 2),
      });
      return;
    }
    detailEntries.push({ label: `payload.${key}`, value: String(value) });
  });

  return (
    <Box
      sx={{
        minWidth: 0,
        maxWidth: '100%',
        overflow: 'hidden',
        p: 3,
        borderRadius: 2,
        border: '1px solid',
        borderColor: event.read ? 'border.default' : 'accent.muted',
        bg: event.read ? 'canvas.default' : 'accent.subtle',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 2,
          mb: 1,
          minWidth: 0,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            minWidth: 0,
            flex: 1,
          }}
        >
          <Label
            variant={
              event.kind === 'agent-started'
                ? 'accent'
                : event.kind === 'agent-ended'
                  ? 'success'
                  : event.kind?.includes('alert')
                    ? 'danger'
                    : 'attention'
            }
          >
            {event.kind}
          </Label>
          <Truncate
            maxWidth="50%"
            title={String(event.title || '')}
            sx={{ fontWeight: 'semibold', fontSize: 1, minWidth: 0 }}
          >
            {event.title}
          </Truncate>
          {event.kind === 'agent-ended' && event.payload?.exit_status && (
            <Label variant="success" sx={{ fontSize: 0, whiteSpace: 'nowrap' }}>
              Status: {String(event.payload.exit_status)}
            </Label>
          )}
          {event.agent_id && (
            <Truncate maxWidth={240} title={String(event.agent_id)}>
              <Label variant="secondary" sx={{ fontSize: 0, maxWidth: '100%' }}>
                {event.agent_id}
              </Label>
            </Truncate>
          )}
        </Box>
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}
        >
          {running && event.agent_id && (
            <Button
              size="small"
              variant="invisible"
              onClick={() => onOpenAgent?.(String(event.agent_id))}
            >
              Open agent
            </Button>
          )}
          {event.created_at && (
            <Text sx={{ fontSize: 0, color: 'fg.muted', whiteSpace: 'nowrap' }}>
              {new Date(event.created_at).toLocaleString()}
            </Text>
          )}
          <Button
            size="small"
            variant="invisible"
            onClick={() => onToggleRead(event)}
            sx={{ p: 1 }}
          >
            {event.read ? <EyeClosedIcon size={12} /> : <EyeIcon size={12} />}
          </Button>
          <Button
            size="small"
            variant="invisible"
            onClick={() => onDelete(event)}
            sx={{ p: 1, color: 'danger.fg' }}
          >
            <TrashIcon size={12} />
          </Button>
        </Box>
      </Box>
      {event.payload && (
        <Box
          sx={{
            fontSize: 0,
            color: 'fg.muted',
            mt: 1,
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {(startedAt ||
            endedAt ||
            (event.kind === 'agent-ended' &&
              event.payload.duration_ms != null)) && (
            <Text as="p">
              {startedAt ? `Started: ${formatRelativeTime(startedAt)}` : ''}
              {startedAt && endedAt ? ' · ' : ''}
              {endedAt ? `Ended: ${formatRelativeTime(endedAt)}` : ''}
              {(startedAt || endedAt) &&
              event.kind === 'agent-ended' &&
              event.payload.duration_ms != null
                ? ' · '
                : ''}
              {event.kind === 'agent-ended' && event.payload.duration_ms != null
                ? `Duration: ${(Number(event.payload.duration_ms) / 1000).toFixed(1)}s`
                : ''}
            </Text>
          )}
          {event.kind?.includes('guardrail') && event.payload.message && (
            <Text as="p" sx={{ mb: 1 }}>
              {String(event.payload.message)}
            </Text>
          )}
          {event.kind?.includes('guardrail') && event.payload.action_taken && (
            <Text as="p">Action: {String(event.payload.action_taken)}</Text>
          )}
          {event.kind === 'agent-started' && event.payload.trigger_type && (
            <Text as="p">Trigger: {String(event.payload.trigger_type)}</Text>
          )}
          {outputText && (
            <Box
              sx={{
                mt: 2,
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'border.muted',
                bg: 'canvas.subtle',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <details open={isOutputExpanded}>
                    <summary
                      onClick={e => {
                        e.preventDefault();
                        setIsOutputExpanded(prev => !prev);
                      }}
                      style={{
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        minWidth: 0,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          minWidth: 0,
                          width: '100%',
                          flexWrap: 'nowrap',
                        }}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            color: 'fg.muted',
                            flexShrink: 0,
                            transition: 'transform 0.15s ease',
                            transform: isOutputExpanded
                              ? 'rotate(180deg)'
                              : 'rotate(0deg)',
                          }}
                        >
                          <ChevronDownIcon size={12} />
                        </Box>
                        <Text
                          sx={{
                            fontSize: 0,
                            fontWeight: 'semibold',
                            flexShrink: 0,
                          }}
                        >
                          Output
                        </Text>
                        <Truncate
                          maxWidth="100%"
                          title={outputText}
                          sx={{
                            fontSize: 0,
                            color: 'fg.muted',
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          {outputText}
                        </Truncate>
                      </Box>
                    </summary>
                    <Box sx={{ mt: 2 }}>
                      <Box sx={streamdownMarkdownStyles}>
                        <Streamdown>{outputText}</Streamdown>
                      </Box>
                    </Box>
                  </details>
                </Box>
                <Button
                  size="small"
                  variant="invisible"
                  sx={{ p: 1, flexShrink: 0 }}
                  title="Download output markdown"
                  aria-label="Download output markdown"
                  onClick={() => {
                    const payload = createMarkdownDownloadPayload(
                      outputText,
                      `${runtimeId}-output`,
                    );
                    downloadTextPayload(payload);
                  }}
                >
                  <DownloadIcon size={12} />
                </Button>
              </Box>
            </Box>
          )}
          <Box
            sx={{
              mt: 2,
              p: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.muted',
              bg: 'canvas.subtle',
            }}
          >
            <details open={isDetailsExpanded}>
              <summary
                onClick={e => {
                  e.preventDefault();
                  setIsDetailsExpanded(prev => !prev);
                }}
                style={{ cursor: 'pointer' }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      color: 'fg.muted',
                      transition: 'transform 0.15s ease',
                      transform: isDetailsExpanded
                        ? 'rotate(180deg)'
                        : 'rotate(0deg)',
                    }}
                  >
                    <ChevronDownIcon size={12} />
                  </Box>
                  <Text sx={{ fontSize: 0, fontWeight: 'semibold' }}>
                    View details
                  </Text>
                </Box>
              </summary>
              <Box sx={{ mt: 2, display: 'grid', gap: 1 }}>
                {detailEntries.map(({ label, value }) => (
                  <Text key={label} sx={detailLineSx}>
                    <Text as="span" sx={detailLabelSx}>
                      {label}:{' '}
                    </Text>
                    <Text as="span" sx={detailValueSx}>
                      {value}
                    </Text>
                  </Text>
                ))}
              </Box>
            </details>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default NotificationEventCard;
