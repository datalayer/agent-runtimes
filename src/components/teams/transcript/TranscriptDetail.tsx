/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The drill-down (SCENES S3-01): the selected line's span — the words sent
 * and answered, a tool's name, arguments and result when the span recorded
 * them, when it started and ended, its status and an error's message, the
 * span and trace ids — and *Open in the Inspector*. For a line read from a
 * recording, it says there is no span to open.
 *
 * @module components/teams/transcript/TranscriptDetail
 */

import type { JSX, ReactNode } from 'react';
import { Button, Heading, Label, Link, Text } from '@primer/react';
import { XIcon } from '@primer/octicons-react';
import type { OtelSpan } from '@datalayer/core/lib/otel/types';
import { Box } from '@datalayer/primer-addons';
import { ChatMarkdown } from '../../../chat/messages/ChatMarkdown';
import {
  lineHeading,
  timeText,
  type SceneTranscriptLine,
} from '../sceneTranscriptRules';
import { durationText } from './transcriptRows';
import {
  NO_SPAN_TEXT,
  transcriptDetailOf,
  type TranscriptSpanIds,
} from './transcriptDetailRules';

export type TranscriptDetailProps = {
  line: SceneTranscriptLine;
  /** Its span; none for a line read from a recording. */
  span?: OtelSpan;
  /** The Inspector's page for a span, when the site has one: account-scoped, no trailing slash. */
  inspectorHref?: (ids: TranscriptSpanIds) => string | undefined;
  /** Opens the Inspector over the page on the span. */
  onOpenInspector?: (ids: TranscriptSpanIds) => void;
  onClose?: () => void;
};

/** One labelled part of the detail. */
function Part({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}): JSX.Element {
  return (
    <Box data-transcript-detail-part={label.toLowerCase()}>
      <Text
        as="div"
        sx={{ color: 'fg.muted', fontSize: 0, fontWeight: 600, mb: 1 }}
      >
        {label}
      </Text>
      <Box
        sx={{
          fontSize: 1,
          overflowWrap: 'anywhere',
          ...(mono
            ? { fontFamily: 'mono', fontSize: 0, whiteSpace: 'pre-wrap', m: 0 }
            : {}),
        }}
        as={mono ? 'pre' : 'div'}
      >
        {children}
      </Box>
    </Box>
  );
}

/** The detail of a line, from its span. */
export function TranscriptDetail({
  line,
  span,
  inspectorHref,
  onOpenInspector,
  onClose,
}: TranscriptDetailProps): JSX.Element {
  const detail = transcriptDetailOf(line, span);
  const href =
    detail.ids && inspectorHref ? inspectorHref(detail.ids) : undefined;
  const status = detail.status;
  return (
    <Box
      data-transcript-detail={line.key}
      data-transcript-detail-status={status}
      display="flex"
      flexDirection="column"
      gap={3}
      p={3}
      borderRadius={2}
      border="1px solid"
      borderColor="border.default"
      bg="canvas.default"
      minWidth={0}
    >
      <Box
        display="flex"
        alignItems="flex-start"
        justifyContent="space-between"
        gap={2}
      >
        <Box minWidth={0}>
          <Heading as="h3" sx={{ fontSize: 1, m: 0, overflowWrap: 'anywhere' }}>
            {lineHeading(line)}
          </Heading>
          <Box display="flex" gap={1} mt={1} flexWrap="wrap">
            <Label size="small">{line.kind}</Label>
            <Label
              size="small"
              variant={
                status === 'failed'
                  ? 'danger'
                  : status === 'running'
                    ? 'accent'
                    : 'success'
              }
            >
              {status}
            </Label>
          </Box>
        </Box>
        {onClose && (
          <Button
            size="small"
            variant="invisible"
            aria-label="Close the detail"
            onClick={onClose}
            leadingVisual={XIcon}
            data-transcript-detail-close=""
          />
        )}
      </Box>
      {!span && (
        <Text
          as="p"
          sx={{ color: 'fg.muted', fontSize: 1, m: 0 }}
          data-transcript-detail-recorded=""
        >
          {NO_SPAN_TEXT}
        </Text>
      )}
      {detail.tool ? (
        <>
          <Part label="Tool" mono>
            {detail.tool.name}
          </Part>
          {detail.tool.arguments && (
            <Part label="Arguments" mono>
              {detail.tool.arguments}
            </Part>
          )}
          {detail.tool.result && (
            <Part label="Result" mono>
              {detail.tool.result}
            </Part>
          )}
        </>
      ) : (
        <>
          {(detail.sent ?? (line.kind === 'asked' ? line.text : undefined)) && (
            <Part label="Sent">
              <ChatMarkdown text={detail.sent ?? line.text} density="compact" />
            </Part>
          )}
          {(detail.answered ??
            (line.kind === 'said' ? line.text : undefined)) && (
            <Part label="Answered">
              <ChatMarkdown
                text={detail.answered ?? line.text}
                density="compact"
              />
            </Part>
          )}
        </>
      )}
      {detail.error && (
        <Part label="Error">
          <Text sx={{ color: 'danger.fg' }} data-transcript-detail-error="">
            {detail.error}
          </Text>
        </Part>
      )}
      <Part label="When" mono>
        {`started ${timeText(detail.startedAt ?? line.at)}`}
        {detail.endedAt !== undefined
          ? `\nended   ${timeText(detail.endedAt)}`
          : status === 'running'
            ? '\nstill running'
            : ''}
        {detail.durationMs !== undefined
          ? `\ntook    ${durationText(detail.durationMs)}`
          : ''}
      </Part>
      {detail.ids && (
        <Part label="Ids" mono>
          {`span   ${detail.ids.spanId}\ntrace  ${detail.ids.traceId}`}
          {detail.ids.parentSpanId ? `\nparent ${detail.ids.parentSpanId}` : ''}
        </Part>
      )}
      {detail.ids && (onOpenInspector || href) && (
        <Box display="flex" gap={2} flexWrap="wrap">
          {onOpenInspector && (
            <Button
              size="small"
              onClick={() => onOpenInspector(detail.ids!)}
              data-transcript-detail-inspector=""
            >
              Open in the Inspector
            </Button>
          )}
          {href && (
            <Link
              href={href}
              target="_blank"
              rel="noopener"
              sx={{ fontSize: 1 }}
              data-transcript-detail-trace=""
            >
              The trace
            </Link>
          )}
        </Box>
      )}
    </Box>
  );
}

export default TranscriptDetail;
