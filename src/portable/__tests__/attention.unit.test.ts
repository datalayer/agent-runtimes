/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a host says outside the chat (VSCODE VS-07, VS-10; DESKTOP DK-14,
 * DK-25): the approval notification's words per class (never the
 * arguments), which approvals are notified, the decision's rules (shown
 * first, read again, 409 said, 404 revealing nothing), the count a badge
 * and a status bar show, the tray's menu, and the transitions that notify
 * — a finished turn, a question asked, a runtime gone — for every session
 * but the one in front.
 *
 * @module portable/__tests__/attention
 */

import { describe, expect, it } from 'vitest';
import {
  actionClassOf,
  approvalNotification,
  ATTENTION_WORDS,
  badgeCount,
  cueOf,
  decisionAllowed,
  decisionOutcome,
  finishedTurns,
  newlyRaised,
  type SessionAttention,
  sessionSaid,
  statusBarItem,
  stillPending,
  trayMenuOf,
} from '../attention';

const approval = (
  toolName: string,
  args: Record<string, unknown> = {},
): { id: string; toolName: string; args: Record<string, unknown> } => ({
  id: `a-${toolName}`,
  toolName,
  args,
});

describe('the class of an approval', () => {
  it('reads _class when it names one of the seven', () => {
    expect(actionClassOf(approval('anything', { _class: 'execute' }))).toBe(
      'execute',
    );
    expect(actionClassOf(approval('anything', { _class: 'Publish' }))).toBe(
      'publish',
    );
  });

  it('maps an ACP kind as the Shield does, other failing closed to write', () => {
    expect(actionClassOf(approval('x', { _kind: 'edit' }))).toBe('write');
    expect(actionClassOf(approval('x', { _kind: 'search' }))).toBe('read');
    expect(actionClassOf(approval('x', { _kind: 'delete' }))).toBe('delete');
    expect(actionClassOf(approval('x', { _kind: 'execute' }))).toBe('execute');
    expect(actionClassOf(approval('x', { _kind: 'other' }))).toBe('write');
  });

  it("reads the verb of the tool's name, and writes when nothing says", () => {
    expect(actionClassOf(approval('run_command'))).toBe('execute');
    expect(actionClassOf(approval('Run git push'))).toBe('execute');
    expect(actionClassOf(approval('delete_file'))).toBe('delete');
    expect(actionClassOf(approval('send_email'))).toBe('send');
    expect(actionClassOf(approval('read_file'))).toBe('read');
    expect(actionClassOf(approval('odoo_accounting_aged_balance'))).toBe(
      'write',
    );
  });
});

describe('the approval notification', () => {
  it('names the application, the action and the class, never the arguments (D-8)', () => {
    const said = approvalNotification(
      'Support Desk',
      approval('run_command', { command: 'git push origin main' }),
    );
    expect(said.message).toBe('Support Desk asks to Run command (execute)');
    expect(said.message).not.toContain('git push');
    expect(said.actions).toEqual(['Approve', 'Decline', 'Show']);
  });

  it('notifies each approval once', () => {
    const seen = new Set(['a-1']);
    expect(newlyRaised(seen, [{ id: 'a-1' }, { id: 'a-2' }])).toEqual([
      { id: 'a-2' },
    ]);
    expect(newlyRaised(new Set(), [])).toEqual([]);
  });
});

describe('the decision from the notification', () => {
  it('is allowed only once the chat has shown the request', () => {
    expect(decisionAllowed(new Set(), 'a-1')).toBe(false);
    expect(decisionAllowed(new Set(['a-1']), 'a-1')).toBe(true);
  });

  it('decides only what is still pending when read again', () => {
    expect(stillPending({ status: 'pending' })).toBe(true);
    expect(stillPending({ status: 'approved' })).toBe(false);
    expect(stillPending(null)).toBe(false);
  });

  it('says what the route answered: done, elsewhere, gone, refused', () => {
    expect(decisionOutcome(200, true, 'Run command')).toBe(
      'Approved: Run command.',
    );
    expect(decisionOutcome(200, false, 'Run command')).toBe(
      'Declined: Run command.',
    );
    expect(decisionOutcome(409, true, 'Run command')).toBe(
      ATTENTION_WORDS.answeredElsewhere,
    );
    // 404 reveals nothing of the approval.
    expect(decisionOutcome(404, true, 'Run command')).toBe(
      ATTENTION_WORDS.gone,
    );
    expect(decisionOutcome(404, true, 'Run command')).not.toContain(
      'Run command',
    );
    expect(decisionOutcome(500, true, 'Run command')).toBe(
      'The decision was refused (500).',
    );
  });
});

const session = (
  key: string,
  turn: SessionAttention['turn'],
  rest: Partial<SessionAttention> = {},
): SessionAttention => ({
  key,
  title: `Session ${key}`,
  agent: 'shield-mvp-claude-code',
  state: 'open',
  turn,
  held: true,
  inFront: false,
  ...rest,
});

describe('the count: the status bar, the badge, the tray', () => {
  it('counts the sessions waiting for the person, the first opened on click', () => {
    const sessions = [
      session('a', 'running'),
      session('b', 'waiting'),
      session('c', 'waiting', { inFront: true }),
    ];
    expect(statusBarItem(sessions)).toEqual({
      text: 'Datalayer: 2 waiting for you',
      tooltip: 'Session c: Open · waiting for you — shield-mvp-claude-code',
      first: 'b',
    });
    expect(badgeCount(sessions)).toBe(2);
    expect(trayMenuOf(sessions)).toEqual([
      { key: '', label: 'Datalayer: 2 waiting for you' },
      { key: 'b', label: 'Open Session b' },
      { key: 'c', label: 'Open Session c' },
    ]);
  });

  it('says working while a turn of any session runs', () => {
    const item = statusBarItem([
      session('a', 'idle', { inFront: true }),
      session('b', 'running'),
    ]);
    expect(item?.text).toBe('Datalayer: working…');
    expect(item?.tooltip).toBe('Session a: Open — shield-mvp-claude-code');
    expect(item?.first).toBe('b');
  });

  it('is hidden, zero and empty when nothing runs or waits, paused and ended sessions aside', () => {
    expect(statusBarItem([])).toBeNull();
    const idle = [
      session('a', 'idle'),
      session('b', '', { state: 'paused' }),
      session('c', 'waiting', { state: 'ended' }),
    ];
    expect(statusBarItem(idle)).toBeNull();
    expect(badgeCount(idle)).toBe(0);
    expect(trayMenuOf(idle)).toEqual([
      { key: '', label: 'Nothing waits for you' },
    ]);
  });

  it('says a session in words', () => {
    expect(sessionSaid(session('a', 'running'))).toBe(
      'Open · answering — shield-mvp-claude-code',
    );
    expect(sessionSaid(session('a', '', { state: 'paused', agent: '' }))).toBe(
      'Paused',
    );
  });
});

describe('the transitions that notify', () => {
  it('notifies a session not in front whose turn ended, with its first line, never the one in front', () => {
    const before = [session('a', 'running'), session('b', 'running')];
    const after = [
      session('a', 'idle', {
        lastAnswer: '\nDone: three files changed.\nMore.',
      }),
      session('b', 'idle', { inFront: true, lastAnswer: 'Never said' }),
    ];
    expect(finishedTurns(before, after)).toEqual([
      {
        key: 'a',
        title: 'Session a',
        said: 'Done: three files changed.',
        kind: 'finished',
      },
    ]);
  });

  it('says that a runtime went away, and nothing for a session first seen', () => {
    expect(
      finishedTurns(
        [session('a', 'idle')],
        [session('a', 'idle', { held: false }), session('new', 'idle')],
      ),
    ).toEqual([
      {
        key: 'a',
        title: 'Session a',
        said: 'Session a: its runtime went away.',
        kind: 'gone',
      },
    ]);
  });

  it('says a question asked (the turn came to wait), and it finished when there is no answer to quote', () => {
    expect(
      finishedTurns(
        [
          session('a', 'running'),
          session('b', 'running'),
          session('c', 'idle'),
        ],
        [
          session('a', 'waiting'),
          session('b', 'running'),
          session('c', 'idle'),
        ],
      ),
    ).toEqual([
      {
        key: 'a',
        title: 'Session a',
        said: 'Session a is waiting for you.',
        kind: 'asks',
      },
    ]);
    expect(
      finishedTurns([session('a', 'running')], [session('a', 'idle')]),
    ).toEqual([
      {
        key: 'a',
        title: 'Session a',
        said: 'Session a finished its turn.',
        kind: 'finished',
      },
    ]);
    // A session that waited and still waits is not said again.
    expect(
      finishedTurns([session('a', 'waiting')], [session('a', 'waiting')]),
    ).toEqual([]);
  });

  it('cues instead of a banner when the host is in front', () => {
    expect(cueOf(true)).toBe('cue');
    expect(cueOf(false)).toBe('banner');
  });
});
