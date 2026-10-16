/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The semantic agent events a chat host renders (Slack, Discord), version 1:
 * a session's AG-UI stream reduced to what a host shows (`semanticOfAgUi.ts`),
 * never a notebook widget or a web component. The contract and its fixture
 * cases are `semantic-events.json`, beside this file, tested here
 * (`__tests__/semantic.unit.test.ts`) and by the runtime that emits the
 * events (`agent_runtimes/tests/test_semantic_events_contract.py`).
 *
 * Moved from the Slack service (DC-005, S-004, S-205).
 *
 * @module portable/semantic
 */

export const SEMANTIC_EVENTS_VERSION = 1;

export const SEMANTIC_KINDS = [
  'text',
  'progress',
  'tool',
  'approval',
  'table',
  'file',
  'citation',
  'ask',
  'completion',
  'stop',
  'error',
] as const;
export type SemanticKind = (typeof SEMANTIC_KINDS)[number];

export type AskQuestion = Readonly<{
  /** `text` and `choice` are answered in the host; `file` and `form` hand off to Datalayer. */
  kind: 'text' | 'choice' | 'file' | 'form';
  prompt: string;
  options?: readonly string[];
}>;

export type SemanticEvent =
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'progress'; label: string }>
  | Readonly<{
      kind: 'tool';
      id: string;
      name: string;
      status: 'running' | 'complete' | 'failed';
    }>
  | Readonly<{
      kind: 'approval';
      toolCallId: string;
      toolName: string;
    }>
  | Readonly<{
      kind: 'table';
      columns: readonly string[];
      rows: readonly (readonly string[])[];
    }>
  | Readonly<{
      kind: 'file';
      name: string;
      url: string;
      mediaType?: string;
    }>
  | Readonly<{ kind: 'citation'; title: string; url: string }>
  | Readonly<{ kind: 'ask'; question: AskQuestion }>
  | Readonly<{ kind: 'completion'; text?: string }>
  | Readonly<{ kind: 'stop' }>
  | Readonly<{ kind: 'error'; message: string }>;

/** Whether an event ends the turn's presentation. */
export function isTerminal(event: SemanticEvent): boolean {
  return (
    event.kind === 'completion' ||
    event.kind === 'stop' ||
    event.kind === 'error' ||
    event.kind === 'ask'
  );
}

/** One part of a finished answer: words, a table, or a citation. */
export type AnswerPart =
  | Readonly<{ kind: 'text'; text: string }>
  | Extract<SemanticEvent, { kind: 'table' } | { kind: 'citation' }>;

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/;
const LINK = /\[([^\]\n]{1,300})\]\((https:\/\/[^\s)]{1,2000})\)/g;

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

/**
 * The parts of an answer as a host shows them: its Markdown tables as tables,
 * its HTTPS links as citations (once each, in order), the rest as words. Only
 * `https:` links are citations: any other scheme stays words.
 */
export function answerParts(answer: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  const lines = answer.split('\n');
  let words: string[] = [];
  const flush = () => {
    const text = words.join('\n').trim();
    if (text) {
      parts.push({ kind: 'text', text });
    }
    words = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const rule = lines[index + 1] ?? '';
    if (TABLE_ROW.test(line) && TABLE_RULE.test(rule)) {
      flush();
      const columns = cells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && TABLE_ROW.test(lines[index] ?? '')) {
        const row = cells(lines[index] ?? '');
        rows.push(columns.map((_, column) => row[column] ?? ''));
        index += 1;
      }
      index -= 1;
      parts.push({ kind: 'table', columns, rows });
      continue;
    }
    words.push(line);
  }
  flush();
  const seen = new Set<string>();
  for (const part of [...parts]) {
    if (part.kind !== 'text') {
      continue;
    }
    for (const match of part.text.matchAll(LINK)) {
      const [, title, url] = match;
      if (!title || !url || seen.has(url)) {
        continue;
      }
      seen.add(url);
      parts.push({ kind: 'citation', title, url });
    }
  }
  return parts;
}
