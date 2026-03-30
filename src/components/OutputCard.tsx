/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { Button, Label, Text, Truncate } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
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

export interface OutputCardProps {
  event: any;
  onToggleRead: (event: any) => void;
  onDelete: (event: any) => void;
  onOpenAgent?: (agentId: string) => void;
}

export function OutputCard({
  event,
  onToggleRead,
  onDelete,
  onOpenAgent,
}: OutputCardProps) {
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

  const startedAt = event?.started_at || event?.payload?.started_at || null;
  const endedAt = event?.ended_at || event?.payload?.ended_at || null;
  const durationMs =
    event.kind === 'agent-ended' ? event.payload?.duration_ms : null;

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
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 2,
          mb: 2,
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
          <Label variant="success">output</Label>
          <Truncate
            maxWidth="50%"
            title={String(event.title || runtimeId)}
            sx={{ fontWeight: 'semibold', fontSize: 1, minWidth: 0 }}
          >
            {event.title || runtimeId}
          </Truncate>
          {event.payload?.exit_status && (
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
          {event.agent_id && onOpenAgent && (
            <Button
              size="small"
              variant="invisible"
              onClick={() => onOpenAgent(String(event.agent_id))}
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

      {/* Timing info */}
      {(startedAt || endedAt || durationMs != null) && (
        <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 2 }}>
          {startedAt ? `Started: ${formatRelativeTime(startedAt)}` : ''}
          {startedAt && endedAt ? ' · ' : ''}
          {endedAt ? `Ended: ${formatRelativeTime(endedAt)}` : ''}
          {(startedAt || endedAt) && durationMs != null ? ' · ' : ''}
          {durationMs != null
            ? `Duration: ${(Number(durationMs) / 1000).toFixed(1)}s`
            : ''}
        </Text>
      )}

      {/* Output content */}
      {outputText && (
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'border.muted',
            bg: 'canvas.subtle',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <details>
                <summary
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
    </Box>
  );
}

export default OutputCard;
