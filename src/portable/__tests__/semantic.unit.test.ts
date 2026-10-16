/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 *
 * @vitest-environment node
 */

/**
 * The semantic agent events contract, version 1 (plans/DISCORD.md DC-005):
 * every case of `semantic-events.json` reduced through `semanticOf`, the
 * kinds held to the file's, and an answer's tables and citations read. The
 * runtime's side is `agent_runtimes/tests/test_semantic_events_contract.py`.
 *
 * @module portable/__tests__/semantic
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  answerParts,
  askQuestionOf,
  isTerminal,
  SEMANTIC_EVENTS_VERSION,
  SEMANTIC_KINDS,
  semanticOf,
  turnOf,
  type AgUiEvent,
  type SemanticEvent,
} from '..';

type Fixture = {
  version: number;
  kinds: string[];
  producers: Record<string, string>;
  cases: Array<{ agui: AgUiEvent[]; semantic: SemanticEvent[] }>;
  answers: Array<{ answer: string; parts: unknown[] }>;
};

const fixture = JSON.parse(
  readFileSync(join(__dirname, '..', 'semantic-events.json'), 'utf8'),
) as Fixture;

describe('the semantic agent events contract (version 1)', () => {
  it('names the version and the eleven kinds a host renders', () => {
    expect(fixture.version).toBe(SEMANTIC_EVENTS_VERSION);
    expect(fixture.kinds).toEqual([...SEMANTIC_KINDS]);
    expect(Object.keys(fixture.producers).sort()).toEqual(
      [...SEMANTIC_KINDS].sort(),
    );
  });

  it.each(fixture.cases.map((one, index) => [index, one] as const))(
    'reduces case %i of the fixture',
    (_index, { agui, semantic }) => {
      const tools = new Map<string, string>();
      expect(agui.flatMap(event => semanticOf(event, tools))).toEqual(semantic);
    },
  );

  it('covers every kind an AG-UI event or an answer produces', () => {
    const produced = new Set(
      fixture.cases.flatMap(one => one.semantic.map(event => event.kind)),
    );
    const fromAnswers = new Set(
      fixture.answers.flatMap(one =>
        (one.parts as Array<{ kind: string }>).map(part => part.kind),
      ),
    );
    // `file` has no producer yet; `stop` is said by the host that stopped.
    for (const kind of SEMANTIC_KINDS) {
      if (kind !== 'file' && kind !== 'stop') {
        expect(produced.has(kind) || fromAnswers.has(kind), kind).toBe(true);
      }
    }
    expect(produced.has('stop')).toBe(false);
  });

  it.each(fixture.answers.map(one => [one.answer.slice(0, 20), one] as const))(
    "reads an answer's tables and HTTPS citations (%s…)",
    (_name, { answer, parts }) => {
      expect(answerParts(answer)).toEqual(parts);
    },
  );
});

describe('a turn and its question', () => {
  it('reads loop.turn and nothing else', () => {
    expect(
      turnOf({
        type: 'CUSTOM',
        name: 'loop.turn',
        value: { session: 'S1', turn: 't1', replayed: true, state: 'finished' },
      }),
    ).toEqual({ replayed: true, session: 'S1', state: 'finished', turn: 't1' });
    expect(turnOf({ type: 'CUSTOM', name: 'loop.session', value: {} })).toBe(
      undefined,
    );
    // A value that is not an object names no field: never stringified.
    expect(
      turnOf({ type: 'CUSTOM', name: 'loop.turn', value: { turn: { a: 1 } } }),
    ).toEqual({ replayed: false, session: '', state: '', turn: '' });
  });

  it('asks an unknown kind as a form, and refuses what is not a question', () => {
    expect(askQuestionOf({ kind: 'signature', prompt: 'Sign' })).toEqual({
      kind: 'form',
      prompt: 'Sign',
    });
    expect(
      askQuestionOf({ kind: 'choice', prompt: 'Which?', options: ['A', 2] }),
    ).toEqual({ kind: 'choice', prompt: 'Which?', options: ['A'] });
    expect(askQuestionOf({ kind: 'text' })).toBe(undefined);
    expect(askQuestionOf('Which?')).toBe(undefined);
  });

  it('ends the presentation on completion, stop, error and a question', () => {
    expect(isTerminal({ kind: 'completion' })).toBe(true);
    expect(isTerminal({ kind: 'stop' })).toBe(true);
    expect(isTerminal({ kind: 'error', message: 'x' })).toBe(true);
    expect(
      isTerminal({ kind: 'ask', question: { kind: 'text', prompt: 'x' } }),
    ).toBe(true);
    expect(isTerminal({ kind: 'text', text: 'x' })).toBe(false);
  });
});
