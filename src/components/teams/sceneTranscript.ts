/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The transcript of a scene (LOOP A-06): what happens in it, as lines, in
 * the order it happened — *Sales: …*, *Sales → Accounting: …*,
 * *Accounting → Odoo: odoo_accounting_aged_balance* — each with its time.
 *
 * One source, read two ways. Live, the lines are read from the OpenTelemetry
 * spans the Agent Inspector reads (core's live tracer): a turn is an
 * `invoke_agent` span (what the person asked, what the agent answered), a
 * tool call an `execute_tool` span (the member and, for an MCP call, the
 * server it reaches: a connection of the member's), and a request to
 * another member an `a2a` span (who asked whom, in what words, and what came
 * back as its events). Once a run is over, the same lines are read from its
 * record (`RecordEntry`: a `turn`, a `tool_call`), the session's entries as
 * ai-agents kept them.
 *
 * Pure: spans or entries in, lines out, so that a test reads a scripted
 * scene and a page draws a live one the same way ({@link SceneTranscript}).
 *
 * @module components/teams/sceneTranscript
 */

import type { OtelSpan } from '@datalayer/core/lib/otel/types';
import type { RecordEntry } from '../../apps/apps/records';
import { connectionOfTool, type A2ATeamConnection } from './a2aTeamFlow';

/** A member of the scene, as the transcript names it. */
export type SceneTranscriptMember = {
  /** Its id in the team: `accounting`. */
  id: string;
  /** Its name, the service its spans are done by: `Accounting`. */
  name: string;
  /** The MCP servers it reaches: a call to one of their tools is `Member → Server: tool`. */
  connections?: readonly A2ATeamConnection[];
};

/** What a line is: words said, a question asked, a tool called. */
export type SceneTranscriptKind = 'said' | 'asked' | 'called';

/** One line of the transcript. */
export type SceneTranscriptLine = {
  /** Stable, for a list: the span's or the entry's id, and which of its lines. */
  key: string;
  /** When, in milliseconds since the epoch. */
  at: number;
  /** Who speaks or acts: a member's name, or the person ({@link PERSON}). */
  from: string;
  /** Who is asked or called: a member, or a server (`Odoo`); none when words are said to all. */
  to?: string;
  kind: SceneTranscriptKind;
  /** The words, or the tool's name. */
  text: string;
  /** Still happening: the call runs, the answer has not come. */
  open?: boolean;
  /** It failed: the span's status, the task's state. */
  failed?: boolean;
};

/** The person in the scene, as the transcript names them. */
export const PERSON = 'You';

/** What a tool that is no connection's reaches, by where it comes from. */
const TOOL_HOMES: Record<string, string> = {
  frontend: 'the page',
  skill: 'a skill',
  codemode: 'codemode',
  runtime: 'its runtime',
};

type Attributes = Record<string, unknown>;

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/** The text of the first message of a GenAI messages attribute (JSON). */
function messageText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  try {
    const parsed = JSON.parse(value) as { parts?: { content?: unknown }[] }[];
    return (parsed[0]?.parts ?? [])
      .map(part => (typeof part.content === 'string' ? part.content : ''))
      .join('')
      .trim();
  } catch {
    return '';
  }
}

/** A time as the span writes it, in milliseconds. */
function millis(iso: string | undefined, fallback = 0): number {
  const parsed = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** The member a service name is: by name, then by id; else the name itself. */
function memberNamed(
  service: string,
  members: readonly SceneTranscriptMember[],
): SceneTranscriptMember {
  return (
    members.find(member => member.name === service) ??
    members.find(member => member.id === service) ?? {
      id: service,
      name: service,
    }
  );
}

/** Where a tool call goes: the connection it is of (`Odoo`), else its home by kind. */
function calledOf(
  tool: string,
  kind: string,
  member: SceneTranscriptMember,
): string {
  const connection = connectionOfTool(tool, [...(member.connections ?? [])]);
  return connection?.label ?? TOOL_HOMES[kind] ?? TOOL_HOMES.runtime;
}

const isA2A = (span: OtelSpan, attributes: Attributes): boolean =>
  attributes['rpc.service'] === 'a2a' || span.span_name.startsWith('a2a ');

/** The lines in the order they happened: by time, a tie kept as given. */
function inOrder(lines: SceneTranscriptLine[]): SceneTranscriptLine[] {
  return lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => a.line.at - b.line.at || a.index - b.index)
    .map(({ line }) => line);
}

/**
 * The same thing said twice is said once: a member's answer comes back as
 * the A2A request's events and, on a runtime whose own spans are read, as
 * its `invoke_agent` span too. The first one stands.
 */
function onceEach(lines: SceneTranscriptLine[]): SceneTranscriptLine[] {
  const seen = new Set<string>();
  return lines.filter(line => {
    // Words said are the same words whoever they were said to.
    const said = `${line.kind}\u0000${line.from}\u0000${line.kind === 'said' ? '' : (line.to ?? '')}\u0000${line.text}`;
    if (seen.has(said)) {
      return false;
    }
    seen.add(said);
    return true;
  });
}

/**
 * The transcript of a scene from the spans recorded while it works (the
 * Agent Inspector's, one tracer for every member).
 */
export function transcriptOfSpans(
  spans: readonly OtelSpan[],
  members: readonly SceneTranscriptMember[],
): SceneTranscriptLine[] {
  const lines: SceneTranscriptLine[] = [];
  // A tool call under which an A2A request sits is the asking itself: the
  // request says it, with its words.
  const asking = new Set<string>();
  for (const span of spans) {
    if (span.parent_span_id && isA2A(span, span.attributes ?? {})) {
      asking.add(span.parent_span_id);
    }
  }
  for (const span of spans) {
    const attributes = span.attributes ?? {};
    const start = millis(span.start_time);
    const end = millis(span.end_time, start);
    const operation = attributes['gen_ai.operation.name'];
    const failed = span.status_code === 'ERROR';
    if (operation === 'invoke_agent') {
      const agent = memberNamed(
        text(attributes['gen_ai.agent.name']) || span.service_name,
        members,
      );
      const asked = messageText(attributes['gen_ai.input.messages']);
      // The person's question, at the top of a turn; a turn asked by another
      // member is told by its A2A request.
      if (asked && !span.parent_span_id) {
        lines.push({
          key: `${span.span_id}:asked`,
          at: start,
          from: PERSON,
          to: agent.name,
          kind: 'asked',
          text: asked,
        });
      }
      const said = messageText(attributes['gen_ai.output.messages']);
      if (said) {
        lines.push({
          key: `${span.span_id}:said`,
          at: end,
          from: agent.name,
          kind: 'said',
          text: said,
          ...(failed ? { failed } : {}),
        });
      } else if (failed) {
        lines.push({
          key: `${span.span_id}:said`,
          at: end,
          from: agent.name,
          kind: 'said',
          text: `could not answer${span.status_message ? `: ${span.status_message}` : ''}`,
          failed,
        });
      }
      continue;
    }
    if (operation === 'execute_tool') {
      if (asking.has(span.span_id)) {
        continue;
      }
      const agent = memberNamed(
        text(attributes['gen_ai.agent.name']) || span.service_name,
        members,
      );
      const tool = text(attributes['gen_ai.tool.name']) || span.span_name;
      lines.push({
        key: `${span.span_id}:called`,
        at: start,
        from: agent.name,
        to: calledOf(tool, text(attributes['datalayer.tool.kind']), agent),
        kind: 'called',
        text: tool,
        ...(span.in_progress ? { open: true } : {}),
        ...(failed ? { failed } : {}),
      });
      continue;
    }
    if (isA2A(span, attributes)) {
      const request = text(attributes['a2a.message.text']).trim();
      if (!request) {
        // The agent card, a task read: nothing said.
        continue;
      }
      const asker = memberNamed(span.service_name, members);
      const peer = memberNamed(text(attributes['peer.service']), members);
      lines.push({
        key: `${span.span_id}:asked`,
        at: start,
        from: asker.name,
        to: peer.name,
        kind: 'asked',
        text: request,
        ...(span.in_progress ? { open: true } : {}),
      });
      // What came back: the answer, or the last words of its events.
      let answer = text(attributes['a2a.answer.text']).trim();
      let answeredAt = end;
      if (!answer) {
        for (const event of span.events ?? []) {
          if (
            event.name === 'a2a.message' ||
            event.name === 'a2a.artifact_update'
          ) {
            const words = text(event.attributes?.['a2a.message.text']).trim();
            if (words) {
              answer = words;
              answeredAt = millis(event.timestamp, end);
            }
          }
        }
      }
      if (answer) {
        lines.push({
          key: `${span.span_id}:said`,
          at: answeredAt,
          from: peer.name,
          to: asker.name,
          kind: 'said',
          text: answer,
          ...(failed ? { failed } : {}),
        });
      } else if (failed) {
        lines.push({
          key: `${span.span_id}:said`,
          at: end,
          from: peer.name,
          to: asker.name,
          kind: 'said',
          text: `could not answer${span.status_message ? `: ${span.status_message}` : ''}`,
          failed,
        });
      }
    }
  }
  return onceEach(inOrder(lines));
}

/**
 * The transcript of one member's run once it is over, from its record: a
 * `turn` is what the person asked and what it answered, a `tool_call` what
 * it called in between. The calls of a turn are recorded before the turn
 * itself (at its close), so the question is placed where the turn began.
 */
export function transcriptOfRecord(
  entries: readonly RecordEntry[],
  member: SceneTranscriptMember,
): SceneTranscriptLine[] {
  const ordered = [...entries].sort(
    (a, b) =>
      millis(a.createdAt) - millis(b.createdAt) || a.version - b.version,
  );
  const lines: SceneTranscriptLine[] = [];
  let pending: SceneTranscriptLine[] = [];
  let answered = false;
  for (const entry of ordered) {
    const at = millis(entry.createdAt);
    if (entry.kind === 'tool_call') {
      const tool = text(entry.payload.tool) || entry.summary;
      pending.push({
        key: `${entry.uid}:called`,
        at,
        from: member.name,
        to: calledOf(tool, '', member),
        kind: 'called',
        text: tool,
        ...(entry.payload.error ? { failed: true } : {}),
      });
    } else if (entry.kind === 'turn') {
      const asked = text(entry.payload.asked) || entry.summary;
      const said = text(entry.payload.answered);
      lines.push({
        key: `${entry.uid}:asked`,
        at: pending[0]?.at ?? at,
        from: PERSON,
        to: member.name,
        kind: 'asked',
        text: asked,
      });
      lines.push(...pending);
      pending = [];
      if (said) {
        lines.push({
          key: `${entry.uid}:said`,
          at,
          from: member.name,
          kind: 'said',
          text: said,
        });
      }
      answered = true;
    } else if (entry.kind === 'output' && !answered) {
      // A record kept without its conversations: the answer's summary.
      pending.push({
        key: `${entry.uid}:said`,
        at,
        from: member.name,
        kind: 'said',
        text: entry.summary,
      });
    }
  }
  lines.push(...pending);
  return lines;
}

/** A line's time, as a clock reads it: `14:03:27`. */
export function timeText(at: number): string {
  const date = new Date(at);
  const two = (value: number) => String(value).padStart(2, '0');
  return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

/** Who a line is from and to: `Sales`, `Sales → Accounting`, `Accounting → Odoo`. */
export function lineHeading(
  line: Pick<SceneTranscriptLine, 'from' | 'to' | 'kind'>,
): string {
  return line.to && line.kind !== 'said'
    ? `${line.from} → ${line.to}`
    : line.from;
}

/** A line in words: `Sales → Accounting: Which invoices are open?`. */
export function lineText(line: SceneTranscriptLine): string {
  const tail = line.open ? '…' : line.failed ? ' (failed)' : '';
  return `${lineHeading(line)}: ${line.text}${tail}`;
}

/** The transcript as text, one line each with its time: what *Copy as text* copies. */
export function transcriptText(lines: readonly SceneTranscriptLine[]): string {
  return lines
    .map(line => `${timeText(line.at)}  ${lineText(line)}`)
    .join('\n');
}
