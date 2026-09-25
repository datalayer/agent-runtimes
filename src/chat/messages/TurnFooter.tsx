/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The line under a turn: what it cost, and what to do with it.
 *
 * One quiet row at the end of each exchange, in the idiom the usage band
 * under the prompt already speaks — `324 / 128.0K ctx · turn 0▲ 0▼`. While
 * the turn streams, the numbers tick: the window as it stands, the tokens
 * spent since the turn began. Once the turn is over they freeze into that
 * turn's record, and two actions appear beside them — copy the turn,
 * remove it from the transcript.
 *
 * Deliberately barely there: faint ink that firms up under the pointer, and
 * actions that only surface on hover or keyboard focus. A transcript is for
 * reading; the accounting keeps to the margin.
 *
 * @module chat/messages/TurnFooter
 */

import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { IconButton, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { CheckIcon, CopyIcon, TrashIcon } from '@primer/octicons-react';
import { formatTokenCount } from '../../utils';
import type { ContextSnapshotData } from '../../types/context';

/** The four figures a turn is remembered by. */
type TurnRecord = {
  contextTokens: number;
  contextWindow: number;
  inputTokens: number;
  outputTokens: number;
};

export interface TurnFooterProps {
  /**
   * The live snapshot the agent reports. The footer reads it only while its
   * own turn is the one the snapshot describes — streaming, or the most
   * recent one finished — and keeps the last figures it saw once a newer
   * turn takes the snapshot over.
   */
  usage?: ContextSnapshotData;
  /** Whether this footer's turn is the one currently streaming. */
  live: boolean;
  /**
   * Whether this is the most recently finished turn — the one the
   * snapshot's `turnUsage` still describes.
   */
  latest: boolean;
  /** The transcript's horizontal padding, so the row sits on the grid. */
  padding: number;
  /** Copy the turn's messages. The footer shows the moment of success. */
  onCopy: () => void | Promise<void>;
  /** Take the turn's messages out of the transcript. */
  onRemove: () => void;
}

export function TurnFooter({
  usage,
  live,
  latest,
  padding,
  onCopy,
  onRemove,
}: TurnFooterProps): JSX.Element | null {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copiedTimer.current !== null) {
        window.clearTimeout(copiedTimer.current);
      }
    },
    [],
  );

  const current: TurnRecord | null = usage
    ? {
        contextTokens: usage.totalTokens,
        contextWindow: usage.contextWindow,
        inputTokens: usage.turnUsage?.inputTokens ?? 0,
        outputTokens: usage.turnUsage?.outputTokens ?? 0,
      }
    : null;

  /*
   * The freeze. While the snapshot is about this turn (live, or the latest
   * finished one) remember what it says; the render after a newer turn
   * takes over, what was remembered becomes this turn's permanent record.
   * No dependency array: the guard makes the effect idempotent, and the
   * figures worth remembering can change on any render.
   */
  const lastSeen = useRef<TurnRecord | null>(null);
  const [frozen, setFrozen] = useState<TurnRecord | null>(null);
  useEffect(() => {
    if ((live || latest) && current) {
      lastSeen.current = current;
    } else if (!live && !latest && !frozen && lastSeen.current) {
      setFrozen(lastSeen.current);
    }
  });

  const record = live || latest ? current : frozen;
  if (!record && live) {
    // Streaming with nothing reported yet: nothing worth a row.
    return null;
  }

  const handleCopy = async () => {
    await onCopy();
    setCopied(true);
    if (copiedTimer.current !== null) {
      window.clearTimeout(copiedTimer.current);
    }
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Box
      data-turn-footer=""
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: padding,
        // Tucked against the turn it accounts for, not opening a new band.
        mt: -1,
        pb: 1,
        minHeight: 24,
        // Barely there until wanted.
        opacity: 0.55,
        transition: 'opacity 0.15s ease',
        '&:hover, &:focus-within': { opacity: 1 },
        '& [data-turn-actions]': {
          opacity: 0,
          transition: 'opacity 0.15s ease',
        },
        '&:hover [data-turn-actions], &:focus-within [data-turn-actions]': {
          opacity: 1,
        },
      }}
    >
      {record && (
        <Text sx={{ fontSize: 0, color: 'fg.muted', flexShrink: 0 }}>
          <Text
            as="span"
            sx={{ fontWeight: 'semibold', color: 'fg.default', fontSize: 0 }}
          >
            {formatTokenCount(record.contextTokens)}
          </Text>
          {' / '}
          {formatTokenCount(record.contextWindow)}
          {' ctx · turn '}
          {formatTokenCount(record.inputTokens)}
          <Text as="span" sx={{ color: 'success.fg', fontSize: 0 }}>
            {'▲'}
          </Text>{' '}
          {formatTokenCount(record.outputTokens)}
          <Text as="span" sx={{ color: 'attention.fg', fontSize: 0 }}>
            {'▼'}
          </Text>
        </Text>
      )}
      {!live && (
        <Box
          data-turn-actions=""
          sx={{ display: 'flex', alignItems: 'center' }}
        >
          <IconButton
            data-turn-copy=""
            icon={copied ? CheckIcon : CopyIcon}
            aria-label="Copy this turn"
            size="small"
            variant="invisible"
            onClick={() => void handleCopy()}
          />
          <IconButton
            data-turn-remove=""
            icon={TrashIcon}
            aria-label="Remove this turn"
            size="small"
            variant="invisible"
            onClick={onRemove}
          />
        </Box>
      )}
    </Box>
  );
}

export default TurnFooter;
