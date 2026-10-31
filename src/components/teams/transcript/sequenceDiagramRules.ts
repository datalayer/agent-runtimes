/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The transcript as a mermaid sequence diagram (SCENES S2-02): one
 * participant per member and system in the cast's order (the person first,
 * as an actor, when they speak), `->>` for an ask or a call, `-->>` for
 * the answer, `activate`/`deactivate` around an exchange that is open or
 * answered, `Note over` for words said to all, and a `rect` around an
 * exchange that failed.
 *
 * Pure: lines in, source out — a golden file holds the source of a recorded
 * transcript — and, beside it, which line each arrow and each note is, so
 * that a click on the drawing finds its line ({@link SequenceDiagram}).
 *
 * @module components/teams/transcript/sequenceDiagramRules
 */

import { PERSON, type SceneTranscriptLine } from '../sceneTranscriptRules';
import { durationText, exchangeOf } from './transcriptRows';

/** One of the cast, as the diagram stands them: a member, or a system a member reaches. */
export type SequenceCastMember = {
  name: string;
  /** A system (a server reached over MCP), drawn after the members. */
  system?: boolean;
};

/** The source, and which line each arrow and each note is, in drawing order. */
export type SequenceDiagramPlan = {
  source: string;
  /** The key of the line each arrow (a message) carries, in the order drawn. */
  arrows: string[];
  /** The key of the line each note carries, in the order drawn. */
  notes: string[];
};

/** The most characters of a message: the rest is an ellipsis. */
const MESSAGE_LENGTH = 72;

/** The tint behind an exchange that failed: Primer's danger, faint, in light and dark. */
const FAILED_RECT = 'rect rgba(248, 81, 73, 0.14)';

/** Words on a diagram: one line, no statement end, no entity, clipped. */
export function diagramText(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim();
  const clipped =
    one.length > MESSAGE_LENGTH ? `${one.slice(0, MESSAGE_LENGTH - 1)}…` : one;
  return (
    clipped.replace(/[#;]/g, mark => (mark === '#' ? '#35;' : '#59;')) || ' '
  );
}

/** Each participant's alias: `p0`, `p1`…, in the order they stand. */
function participantsOf(
  lines: readonly SceneTranscriptLine[],
  cast: readonly SequenceCastMember[],
): { names: string[]; alias: Map<string, string>; actors: Set<string> } {
  const names: string[] = [];
  const spoken = new Set<string>();
  for (const line of lines) {
    spoken.add(line.from);
    if (line.to) {
      spoken.add(line.to);
    }
  }
  if (spoken.has(PERSON)) {
    names.push(PERSON);
  }
  for (const member of [...cast].sort(
    (a, b) => Number(Boolean(a.system)) - Number(Boolean(b.system)),
  )) {
    if (member.name !== PERSON && !names.includes(member.name)) {
      names.push(member.name);
    }
  }
  for (const line of lines) {
    for (const name of [line.from, line.to]) {
      if (name && !names.includes(name)) {
        names.push(name);
      }
    }
  }
  const alias = new Map(names.map((name, index) => [name, `p${index}`]));
  return { names, alias, actors: new Set([PERSON]) };
}

/** The source and the map of its arrows and notes back to the lines. */
export function sequenceDiagramPlan(
  lines: readonly SceneTranscriptLine[],
  cast: readonly SequenceCastMember[] = [],
): SequenceDiagramPlan {
  const { names, alias, actors } = participantsOf(lines, cast);
  const id = (name: string): string => alias.get(name) ?? name;
  const out: string[] = ['sequenceDiagram'];
  for (const name of names) {
    out.push(
      `  ${actors.has(name) ? 'actor' : 'participant'} ${id(name)} as ${diagramText(name)}`,
    );
  }
  const arrows: string[] = [];
  const notes: string[] = [];
  // The answers, by exchange: what an ask or a call waits for.
  const answers = new Map<string, SceneTranscriptLine>();
  for (const line of lines) {
    if (line.kind === 'said') {
      answers.set(exchangeOf(line.key), line);
    }
  }
  // Who an exchange activated, until its answer deactivates them.
  const active = new Map<string, string>();
  // The exchanges whose rect is open, closed by their failed answer.
  const rects = new Set<string>();
  const failed = new Set<string>();
  for (const line of lines) {
    if (line.failed) {
      failed.add(exchangeOf(line.key));
    }
  }
  const indent = (): string => (rects.size ? '    ' : '  ');
  for (const line of lines) {
    const exchange = exchangeOf(line.key);
    const answer = answers.get(exchange);
    if (line.kind === 'asked' || line.kind === 'called') {
      if (failed.has(exchange) && answer && !rects.has(exchange)) {
        out.push(`  ${FAILED_RECT}`);
        rects.add(exchange);
      }
      const to = line.to ?? '';
      out.push(
        `${indent()}${id(line.from)}->>${id(to)}: ${diagramText(line.text)}${line.open ? '…' : ''}`,
      );
      arrows.push(line.key);
      if (line.open || answer || line.ended !== undefined) {
        out.push(`${indent()}activate ${id(to)}`);
        active.set(exchange, to);
      }
      if (line.kind === 'called' && !line.open && !answer) {
        // A call's answer is its end: the tool answered, in so long, or failed.
        const took =
          line.ended !== undefined && line.ended > line.at
            ? ` in ${durationText(line.ended - line.at)}`
            : '';
        const opened = !rects.has(exchange) && line.failed;
        if (opened) {
          out.push(`  ${FAILED_RECT}`);
          rects.add(exchange);
        }
        out.push(
          `${indent()}${id(to)}-->>${id(line.from)}: ${line.failed ? 'failed' : `answered${took}`}`,
        );
        arrows.push(line.key);
        if (active.get(exchange) === to) {
          out.push(`${indent()}deactivate ${id(to)}`);
          active.delete(exchange);
        }
        if (rects.has(exchange)) {
          rects.delete(exchange);
          out.push('  end');
        }
      }
      continue;
    }
    // Words said: back to who asked, or to all.
    const asker =
      line.to ??
      (lines.some(
        other =>
          other.kind === 'asked' &&
          other.from === PERSON &&
          exchangeOf(other.key) === exchange,
      )
        ? PERSON
        : undefined);
    if (line.failed && !rects.has(exchange)) {
      out.push(`  ${FAILED_RECT}`);
      rects.add(exchange);
    }
    if (asker) {
      out.push(
        `${indent()}${id(line.from)}-->>${id(asker)}: ${diagramText(line.text)}${line.failed ? ' (failed)' : ''}`,
      );
      arrows.push(line.key);
    } else {
      out.push(
        `${indent()}Note over ${id(line.from)}: ${diagramText(line.text)}${line.failed ? ' (failed)' : ''}`,
      );
      notes.push(line.key);
    }
    if (active.get(exchange) === line.from) {
      out.push(`${indent()}deactivate ${id(line.from)}`);
      active.delete(exchange);
    }
    if (rects.has(exchange)) {
      rects.delete(exchange);
      out.push('  end');
    }
  }
  return { source: `${out.join('\n')}\n`, arrows, notes };
}

/** The mermaid source of a transcript: what *Copy as mermaid* copies. */
export function sequenceDiagramOf(
  lines: readonly SceneTranscriptLine[],
  cast: readonly SequenceCastMember[] = [],
): string {
  return sequenceDiagramPlan(lines, cast).source;
}
