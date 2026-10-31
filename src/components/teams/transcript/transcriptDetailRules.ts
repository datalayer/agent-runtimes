/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a line's span says (SCENES S3-01): the words sent and the words
 * answered, a tool's name, arguments and result when the span recorded
 * them, when it started and ended, its status and an error's message, the
 * span and trace ids; for a coding harness's step, the Shield's decision on
 * it and the rule it decided by. Pure: a line and its span in, the detail out
 * ({@link TranscriptDetail} draws it).
 *
 * @module components/teams/transcript/transcriptDetailRules
 */

import type { OtelSpan } from '@datalayer/core/lib/otel/types';
import {
  isShieldTurn,
  SHIELD_STEP_EVENTS,
  stepCallOf,
  type SceneTranscriptLine,
} from '../sceneTranscriptRules';
import { exchangeOf } from './transcriptRows';

/** The ids that name a span: what *Open in the Inspector* opens. */
export type TranscriptSpanIds = { traceId: string; spanId: string };

/** What the Shield decided of a coding harness's step, from its events. */
export type TranscriptShieldStep = {
  /** `allow`, `ask` or `deny`: the last decision on the step. */
  decision: string;
  /** The decision in a person's words: *do it*, *ask me first*, *leave it to me*. */
  said: string;
  /** The rule it decided by: an application's Rule names it (*Change a file*). */
  rule?: string;
  /** The policy the rule is of: `team` (the application's Rules), `session` (the platform's default)… */
  scope?: string;
  /** Who decided: the policy, a person asked, the Shield. */
  decidedBy?: string;
  /** The harness's kind of step (`read`, `edit`, `execute`) and its class (`read`, `write`…). */
  kind?: string;
  actionClass?: string;
  path?: string;
  command?: string;
  /** The harness, from the turn: `opencode`. */
  harness?: string;
};

/** A decision, as a person reads it. */
export const SHIELD_DECISION_WORDS: Record<string, string> = {
  allow: 'do it',
  ask: 'ask me first',
  deny: 'leave it to me',
};

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
  /** A coding harness's step: what the Shield decided, and by which rule. */
  shield?: TranscriptShieldStep;
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

/**
 * The span a line was read from: the one whose id its key begins with — a
 * harness's step names its turn's span and its call, `<span>/<call>`.
 */
export function spanOfLine(
  line: Pick<SceneTranscriptLine, 'key'>,
  spans: readonly OtelSpan[] | undefined,
): OtelSpan | undefined {
  const id = exchangeOf(line.key);
  return spans?.find(
    span => span.span_id === id || id.startsWith(`${span.span_id}/`),
  );
}

/** What the Shield decided of the step a line is, from its turn's span; none for any other line. */
export function shieldStepOf(
  line: Pick<SceneTranscriptLine, 'key'>,
  span: OtelSpan,
): TranscriptShieldStep | undefined {
  if (!isShieldTurn(span)) {
    return undefined;
  }
  const exchange = exchangeOf(line.key);
  const call = exchange.slice(span.span_id.length + 1);
  let found: TranscriptShieldStep | undefined;
  for (const event of span.events ?? []) {
    if (
      !SHIELD_STEP_EVENTS.includes(event.name) ||
      stepCallOf(event) !== call
    ) {
      continue;
    }
    const attributes = event.attributes ?? {};
    const decision = text(attributes.decision);
    const step: TranscriptShieldStep = found ?? {
      decision: '',
      said: '',
    };
    // A refusal stands: what the Shield did after it (a completion row) does not undo it.
    if (decision && step.decision !== 'deny') {
      step.decision = decision;
      step.said = SHIELD_DECISION_WORDS[decision] ?? decision;
      step.rule = text(attributes.rule) ?? step.rule;
      step.scope = text(attributes.scope) ?? step.scope;
      step.decidedBy =
        text(attributes.decided_by) ?? text(attributes.by) ?? step.decidedBy;
    }
    step.kind = step.kind ?? text(attributes.kind);
    step.actionClass = step.actionClass ?? text(attributes.class);
    step.path = step.path ?? text(attributes.path);
    step.command = step.command ?? text(attributes.command);
    found = step;
  }
  if (!found) {
    return undefined;
  }
  const harness = text(span.attributes?.['shield.harness']);
  return Object.fromEntries(
    Object.entries({ ...found, harness }).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  ) as TranscriptShieldStep;
}

/** The sentence for a step the Shield refused. */
export function shieldRefusalText(step: TranscriptShieldStep): string {
  return step.rule
    ? `Refused by the Shield: ${step.said}, by the rule '${step.rule}'${step.scope ? ` (${step.scope})` : ''}.`
    : `Refused by the Shield: ${step.said}.`;
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
  const shield = shieldStepOf(line, span);
  if (shield) {
    // A harness's step: its turn's span holds every step, so the times are the line's.
    const refused = shield.decision === 'deny';
    return {
      line,
      span,
      sent: line.text,
      shield,
      startedAt: line.at,
      endedAt: line.ended,
      durationMs:
        line.ended === undefined
          ? undefined
          : Math.max(0, line.ended - line.at),
      status: line.open ? 'running' : refused || line.failed ? 'failed' : 'ok',
      error: refused ? shieldRefusalText(shield) : undefined,
      ids: {
        traceId: span.trace_id,
        spanId: span.span_id,
        ...(span.parent_span_id ? { parentSpanId: span.parent_span_id } : {}),
      },
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
