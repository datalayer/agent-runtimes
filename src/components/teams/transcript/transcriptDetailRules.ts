/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a line's span says (SCENES S3-01): the words sent and the words
 * answered, a tool's name, arguments and result when the span recorded
 * them, when it started and ended, its status and an error's message, the
 * span and trace ids. Pure: a line and its span in, the detail out
 * ({@link TranscriptDetail} draws it).
 *
 * @module components/teams/transcript/transcriptDetailRules
 */

import type { OtelSpan } from '@datalayer/core/lib/otel/types';
import type { SceneTranscriptLine } from '../sceneTranscriptRules';
import { exchangeOf } from './transcriptRows';

/** The ids that name a span: what *Open in the Inspector* opens. */
export type TranscriptSpanIds = { traceId: string; spanId: string };

/** The detail of a line, from its span. */
export type TranscriptDetailOf = {
  line: SceneTranscriptLine;
  /** None for a line read from a recording: there is no span to open. */
  span?: OtelSpan;
  /** The words sent: what was asked, or the tool called. */
  sent?: string;
  /** The words answered. */
  answered?: string;
  tool?: { name: string; arguments?: string; result?: string };
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  /** `running`, `ok`, `failed`, or the span's own code. */
  status: string;
  error?: string;
  ids?: TranscriptSpanIds & { parentSpanId?: string };
};

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

/** JSON, pretty when it parses; the text as it is otherwise. */
export function prettyJson(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return JSON.stringify(value, null, 2);
  }
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

/** The text of a GenAI messages attribute (JSON), every message's parts. */
function messagesText(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as { parts?: { content?: unknown }[] }[];
    const words = parsed
      .flatMap(message => message.parts ?? [])
      .map(part => (typeof part.content === 'string' ? part.content : ''))
      .filter(Boolean)
      .join('\n\n')
      .trim();
    return words || undefined;
  } catch {
    return raw;
  }
}

const millis = (iso: string | undefined): number | undefined => {
  const parsed = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** The span a line was read from: the one whose id its key begins with. */
export function spanOfLine(
  line: Pick<SceneTranscriptLine, 'key'>,
  spans: readonly OtelSpan[] | undefined,
): OtelSpan | undefined {
  const id = exchangeOf(line.key);
  return spans?.find(span => span.span_id === id);
}

/** The detail of a line: from its span when there is one. */
export function transcriptDetailOf(
  line: SceneTranscriptLine,
  span?: OtelSpan,
): TranscriptDetailOf {
  if (!span) {
    return {
      line,
      status: line.open ? 'running' : line.failed ? 'failed' : 'done',
    };
  }
  const attributes = span.attributes ?? {};
  const operation = attributes['gen_ai.operation.name'];
  const startedAt = millis(span.start_time);
  const endedAt = span.in_progress ? undefined : millis(span.end_time);
  const durationMs =
    span.in_progress || startedAt === undefined || endedAt === undefined
      ? undefined
      : Math.max(0, endedAt - startedAt);
  const status = span.in_progress
    ? 'running'
    : span.status_code === 'ERROR'
      ? 'failed'
      : span.status_code === 'OK' || !span.status_code
        ? 'ok'
        : span.status_code.toLowerCase();
  const error =
    span.status_code === 'ERROR'
      ? (text(span.status_message) ??
        text(attributes['error.type']) ??
        'failed')
      : undefined;
  const ids = {
    traceId: span.trace_id,
    spanId: span.span_id,
    ...(span.parent_span_id ? { parentSpanId: span.parent_span_id } : {}),
  };
  const base = {
    line,
    span,
    startedAt,
    endedAt,
    durationMs,
    status,
    error,
    ids,
  };
  if (operation === 'execute_tool') {
    const name = text(attributes['gen_ai.tool.name']) ?? line.text;
    return {
      ...base,
      sent: name,
      tool: {
        name,
        arguments: prettyJson(attributes['gen_ai.tool.call.arguments']),
        result: prettyJson(attributes['gen_ai.tool.call.result']),
      },
    };
  }
  if (operation === 'invoke_agent') {
    return {
      ...base,
      sent: messagesText(attributes['gen_ai.input.messages']),
      answered: messagesText(attributes['gen_ai.output.messages']),
    };
  }
  // An A2A request: its words, and what came back.
  let answered = text(attributes['a2a.answer.text']);
  if (!answered) {
    for (const event of span.events ?? []) {
      if (
        event.name === 'a2a.message' ||
        event.name === 'a2a.artifact_update'
      ) {
        answered = text(event.attributes?.['a2a.message.text']) ?? answered;
      }
    }
  }
  return {
    ...base,
    sent: text(attributes['a2a.message.text']),
    answered,
  };
}

/** The sentence for a line with no span: a recording. */
export const NO_SPAN_TEXT =
  'This line comes from a recording: there is no span to open.';
