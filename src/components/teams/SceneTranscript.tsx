/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The transcript of a scene, drawn (LOOP A-06): the lines
 * {@link transcriptOfSpans} or {@link transcriptOfRecord} built, each with
 * its time, who speaks or acts and to whom, and the words or the tool —
 * and *Copy as text*, which copies them with their times
 * ({@link transcriptText}).
 *
 * @module components/teams/SceneTranscript
 */

import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { Button, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { OtelLiveTracer } from '@datalayer/core/lib/otel/live';
import { useOtelLiveSpans } from '@datalayer/core/lib/otel/live';
import {
  lineHeading,
  timeText,
  transcriptOfSpans,
  transcriptText,
  type SceneTranscriptLine,
  type SceneTranscriptMember,
} from './sceneTranscript';

/** The transcript of a tracer's spans, kept current as they change. */
export function useSceneTranscript(
  tracer: OtelLiveTracer | null | undefined,
  members: readonly SceneTranscriptMember[],
): SceneTranscriptLine[] {
  const spans = useOtelLiveSpans(tracer);
  return useMemo(() => transcriptOfSpans(spans, members), [spans, members]);
}

export type SceneTranscriptProps = {
  /** The lines, in order. */
  lines: readonly SceneTranscriptLine[];
  /** What is said while there is no line yet. */
  emptyText?: string;
  /** How tall it grows before it scrolls, in pixels. */
  maxHeight?: number;
  /** Whether *Copy as text* is offered (it is, when there is a line). */
  copy?: boolean;
  /** The clipboard: `navigator.clipboard.writeText` unless a test gives one. */
  writeText?: (text: string) => Promise<void>;
};

/** How long *Copied* stays, in milliseconds. */
const COPIED_MS = 1500;

/** The transcript as a list of lines, newest last, with *Copy as text*. */
export function SceneTranscript({
  lines,
  emptyText = 'What the scene says and does shows here, line by line.',
  maxHeight,
  copy = true,
  writeText,
}: SceneTranscriptProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    const write =
      writeText ??
      (text =>
        globalThis.navigator?.clipboard?.writeText(text) ?? Promise.resolve());
    try {
      await write(transcriptText(lines));
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      // The clipboard refused: nothing to say but the text, still on screen.
    }
  };
  return (
    <Box data-scene-transcript="" data-scene-lines={lines.length}>
      {lines.length === 0 ? (
        <Text as="p" sx={{ color: 'fg.muted', fontSize: 1, m: 0 }}>
          {emptyText}
        </Text>
      ) : (
        <Box
          as="ol"
          aria-label="Transcript"
          sx={{
            listStyle: 'none',
            m: 0,
            p: 0,
            fontSize: 1,
            ...(maxHeight ? { maxHeight, overflowY: 'auto' } : {}),
          }}
        >
          {lines.map(line => (
            <Box
              as="li"
              key={line.key}
              data-transcript-line={line.kind}
              data-transcript-from={line.from}
              data-transcript-to={line.to}
              aria-busy={line.open ? 'true' : undefined}
              sx={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: 2,
                py: 1,
                borderBottom: '1px solid',
                borderColor: 'border.muted',
                opacity: line.open ? 0.75 : 1,
              }}
            >
              <Text
                as="time"
                sx={{
                  color: 'fg.muted',
                  fontFamily: 'mono',
                  fontSize: 0,
                  pt: '2px',
                  whiteSpace: 'nowrap',
                }}
                dateTime={new Date(line.at).toISOString()}
              >
                {timeText(line.at)}
              </Text>
              <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <Text sx={{ fontWeight: 600 }}>{lineHeading(line)}: </Text>
                <Text
                  sx={{
                    fontFamily: line.kind === 'called' ? 'mono' : undefined,
                    color: line.failed ? 'danger.fg' : undefined,
                  }}
                >
                  {line.text}
                  {line.open ? '…' : ''}
                  {line.failed ? ' (failed)' : ''}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {copy && lines.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Button
            size="small"
            onClick={() => void onCopy()}
            data-transcript-copy=""
          >
            {copied ? 'Copied' : 'Copy as text'}
          </Button>
        </Box>
      )}
    </Box>
  );
}

export default SceneTranscript;
