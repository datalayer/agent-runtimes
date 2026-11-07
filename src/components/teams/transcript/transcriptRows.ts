/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The transcript as rows (SCENES S2-01): one row per line, with what the
 * lines do not say in so many words — over which protocol an exchange went,
 * how long a call or an ask took, in what state it is — and the filter the
 * three views share: members, kinds, *failed only*, failed first.
 *
 * Pure: lines in, rows out, so that a test reads a recorded transcript and
 * the page draws a live one the same way ({@link TranscriptTable}).
 *
 * @module components/teams/transcript/transcriptRows
 */

import {
  isToolHome,
  PERSON,
  timeText,
  type SceneTranscriptKind,
  type SceneTranscriptLine,
} from '../sceneTranscriptRules';

/** Over what a line went: a member asked over A2A, a server called over MCP, a tool of the member's own. */
export type TranscriptOver = 'a2a' | 'mcp' | 'tool';

/** What a row is in: still happening, failed, or done. */
export type TranscriptState = 'open' | 'failed' | 'done';

/** One row of the table. */
export type TranscriptRow = {
  /** The line's key. */
  id: string;
  at: number;
  from: string;
  to?: string;
  /** None for words said to all, or asked by the person. */
  over?: TranscriptOver;
  kind: SceneTranscriptKind;
  text: string;
  /** A call's, from its `called` to its answer; an ask's, from the question to the answer. None while open. */
  durationMs?: number;
  state: TranscriptState;
  /** The line is part of an exchange that failed: it failed, or its answer did. */
  exchangeFailed: boolean;
  /** Its place in the lines, from 0: what a tie in time keeps. */
  order: number;
  /** The line itself. */
  line: SceneTranscriptLine;
};

/** The span's or the entry's id a key belongs to: what an ask and its answer share. */
export function exchangeOf(key: string): string {
  const at = key.lastIndexOf(':');
  return at > 0 ? key.slice(0, at) : key;
}

/** Whether a line answers: words said back to the one who asked, or said to all at the end of a turn. */
const isAnswer = (line: SceneTranscriptLine): boolean => line.kind === 'said';

/** The answer of each exchange, by the exchange's id. */
function answersOf(
  lines: readonly SceneTranscriptLine[],
): Map<string, SceneTranscriptLine> {
  const answers = new Map<string, SceneTranscriptLine>();
  for (const line of lines) {
    if (isAnswer(line)) {
      answers.set(exchangeOf(line.key), line);
    }
  }
  return answers;
}

/** The exchanges that failed: a line failed, or its answer did. */
export function failedExchangesOf(
  lines: readonly SceneTranscriptLine[],
): Set<string> {
  const failed = new Set<string>();
  for (const line of lines) {
    if (line.failed) {
      failed.add(exchangeOf(line.key));
    }
  }
  return failed;
}

/** Over what a line went, from who it reaches. */
export function overOf(line: SceneTranscriptLine): TranscriptOver | undefined {
  if (line.kind === 'called') {
    return isToolHome(line.to) ? 'tool' : 'mcp';
  }
  if (line.kind === 'asked') {
    return line.from === PERSON ? undefined : 'a2a';
  }
  return line.to ? 'a2a' : undefined;
}

/** The rows of a transcript, in the lines' order. */
export function transcriptRows(
  lines: readonly SceneTranscriptLine[],
): TranscriptRow[] {
  const answers = answersOf(lines);
  const failed = failedExchangesOf(lines);
  return lines.map((line, order) => {
    const exchange = exchangeOf(line.key);
    const answer = line.kind === 'said' ? undefined : answers.get(exchange);
    const durationMs = line.open
      ? undefined
      : answer
        ? Math.max(0, answer.at - line.at)
        : line.ended !== undefined
          ? Math.max(0, line.ended - line.at)
          : undefined;
    return {
      id: line.key,
      at: line.at,
      from: line.from,
      ...(line.to ? { to: line.to } : {}),
      ...(overOf(line) ? { over: overOf(line) } : {}),
      kind: line.kind,
      text: line.text,
      ...(durationMs !== undefined ? { durationMs } : {}),
      state: line.open ? 'open' : line.failed ? 'failed' : 'done',
      exchangeFailed: failed.has(exchange),
      order,
      line,
    };
  });
}

/**
 * Two rows by time: an open row after a closed one at the same time (it is
 * still happening: last), a tie kept in the lines' order. What the table's
 * Time column sorts by.
 */
export function compareByTime(a: TranscriptRow, b: TranscriptRow): number {
  return (
    a.at - b.at ||
    Number(a.state === 'open') - Number(b.state === 'open') ||
    a.order - b.order
  );
}

/** The rows by time ({@link compareByTime}); descending reverses it. */
export function byTime(
  rows: readonly TranscriptRow[],
  direction: 'ASC' | 'DESC' = 'ASC',
): TranscriptRow[] {
  const ordered = [...rows].sort(compareByTime);
  return direction === 'DESC' ? ordered.reverse() : ordered;
}

/** A duration in words: `12 ms`, `1.2 s`, `1 min 3 s`. */
export function durationText(ms: number | undefined): string {
  if (ms === undefined) {
    return '';
  }
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1).replace(/\.0$/, '')} s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

/** What a row's state says. */
export const STATE_WORDS: Record<TranscriptState, string> = {
  open: 'running',
  failed: 'failed',
  done: 'done',
};

/** What a row's `over` says. */
export const OVER_WORDS: Record<TranscriptOver, string> = {
  a2a: 'A2A',
  mcp: 'MCP',
  tool: 'tool',
};

/** A cell's text in a Markdown table: no bar, no line break. */
const cell = (text: string): string =>
  text
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, ' ')
    .trim();

/** The rows as a Markdown table: what *Copy as Markdown* copies. */
export function transcriptMarkdown(rows: readonly TranscriptRow[]): string {
  const head = '| Time | From | To | Over | Kind | Text | Duration | State |';
  const rule = '| --- | --- | --- | --- | --- | --- | --- | --- |';
  const body = rows.map(row =>
    [
      timeText(row.at),
      row.from,
      row.to ?? '',
      row.over ? OVER_WORDS[row.over] : '',
      row.kind,
      row.text,
      durationText(row.durationMs),
      STATE_WORDS[row.state],
    ]
      .map(cell)
      .join(' | '),
  );
  return [head, rule, ...body.map(line => `| ${line} |`)].join('\n');
}

/** What narrows the three views: by member, by kind, to what failed; what failed first. */
export type TranscriptFilter = {
  /** The members (and servers) a line is from or to; all when unsaid or empty. */
  members?: readonly string[];
  /** The kinds kept; all when unsaid or empty. */
  kinds?: readonly SceneTranscriptKind[];
  /** Only the exchanges that failed. */
  failedOnly?: boolean;
  /** The exchanges that failed first, each in its time order. */
  failedFirst?: boolean;
};

/** The names a transcript speaks of: who is from or to, in first appearance. */
export function namesOf(lines: readonly SceneTranscriptLine[]): string[] {
  const names: string[] = [];
  for (const line of lines) {
    for (const name of [line.from, line.to]) {
      if (name && !names.includes(name)) {
        names.push(name);
      }
    }
  }
  return names;
}

/** The lines the filter keeps, in order: the same lines for every view. */
export function filterLines(
  lines: readonly SceneTranscriptLine[],
  filter: TranscriptFilter = {},
): SceneTranscriptLine[] {
  const failed = failedExchangesOf(lines);
  const members = filter.members?.length ? new Set(filter.members) : null;
  const kinds = filter.kinds?.length ? new Set(filter.kinds) : null;
  const kept = lines.filter(line => {
    if (
      members &&
      !members.has(line.from) &&
      !(line.to && members.has(line.to))
    ) {
      return false;
    }
    if (kinds && !kinds.has(line.kind)) {
      return false;
    }
    if (filter.failedOnly && !failed.has(exchangeOf(line.key))) {
      return false;
    }
    return true;
  });
  if (!filter.failedFirst) {
    return kept;
  }
  return [
    ...kept.filter(line => failed.has(exchangeOf(line.key))),
    ...kept.filter(line => !failed.has(exchangeOf(line.key))),
  ];
}
