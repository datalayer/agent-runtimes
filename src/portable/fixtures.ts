/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A conversation with one row of every kind, and a question waiting: the
 * fixture every renderer of `portable/views` is tested against — the web's
 * and Datalayer Mobile's — so that a change of a row's words or
 * states is caught once.
 *
 * @module portable/fixtures
 */

import { emptyConversation, type ConversationState } from './conversation';
import { RUN_END_WORDS } from './records';

/** A fresh copy of the fixture conversation. */
/**
 * A coding agent's diff and terminal, as the runtime sends them beside a tool
 * result (`_meta["reactor.ui/display"]`, SH-16): what the phone
 * draws for M-037, read by `protocolDisplayOf`.
 */
export function shieldDisplayFixtures(): {
  diff: Record<string, unknown>;
  terminal: Record<string, unknown>;
} {
  return {
    diff: {
      type: 'application/vnd.datalayer.shield.diff+json',
      version: 1,
      id: 'c1-diff',
      text: 'Changed hello.py (+2 −1 lines)',
      data: {
        path: 'hello.py',
        old_text: 'print("hi")\n',
        new_text: 'def hello():\n    print("hi, shield")\n',
        language: 'python',
      },
      actions: [],
    },
    terminal: {
      type: 'application/vnd.datalayer.shield.terminal+json',
      version: 1,
      id: 'c3-terminal',
      text: 'Ran `pytest -q`: exit 0',
      data: {
        terminal_id: 'term_1',
        command: 'pytest -q',
        output: '3 passed in 0.12s\n',
        exit_code: 0,
        released: true,
      },
      actions: [],
    },
  };
}

export function conversationFixture(): ConversationState {
  return {
    ...emptyConversation(),
    items: [
      {
        kind: 'message',
        id: 'm-1',
        role: 'user',
        text: 'Where is order 7?',
        streaming: false,
      },
      {
        kind: 'tool',
        id: 't-1',
        name: 'lookup_order',
        args: '{"order":7}',
        input: { order: 7 },
        status: 'complete',
        awaiting: null,
        result: 'Shipped on Monday.',
        value: 'Shipped on Monday.',
        error: '',
        executionError: '',
        codeError: null,
        exitCode: null,
        display: null,
      },
      {
        kind: 'tool',
        id: 't-2',
        name: 'send_mail',
        args: '{}',
        input: {},
        status: 'error',
        awaiting: null,
        result: '',
        value: undefined,
        error: 'Refused by its rule.',
        executionError: '',
        codeError: null,
        exitCode: null,
        display: null,
      },
      {
        kind: 'step',
        id: 's-1',
        name: 'Check the carrier',
        status: 'complete',
      },
      {
        kind: 'message',
        id: 'm-2',
        role: 'assistant',
        text: 'It **shipped** on Monday.',
        streaming: false,
      },
      { kind: 'end', id: 'e-1', end: 'stopped', words: RUN_END_WORDS.stopped },
      { kind: 'error', id: 'x-1', text: 'The runtime did not answer.' },
    ],
    asking: {
      kind: 'choice',
      prompt: 'Track it by mail?',
      options: ['Yes', 'No'],
      schema: null,
      accept: [],
    },
    dropped: 3,
  };
}

/**
 * `GET /api/ai-agents/v1/apps/activity`'s answer for one application: a
 * session in progress, a scheduled run, a completed one (ended), and a
 * next page — what the Studio's Activity and the phone's read alike (M-015b).
 */
export function activityFixture(): Record<string, unknown> {
  return {
    success: true,
    in_progress: [
      {
        uid: 'e-run',
        app_uid: 'app-1',
        session_uid: 's-2',
        deployment_uid: 'd-1',
        version: 3,
        kind: 'run',
        summary: 'Triage the inbox',
        payload: {},
        created_at: '2026-10-16T08:00:00Z',
      },
    ],
    scheduled: [
      {
        deployment_uid: 'd-1',
        app_uid: 'app-1',
        version: 3,
        position: 0,
        cron: '0 8 * * 1-5',
        description: 'Every weekday morning',
        next_at: '2026-10-17T08:00:00Z',
      },
    ],
    scheduled_problem: '',
    completed: [
      {
        uid: 's-1',
        app_uid: 'app-1',
        deployment_uid: 'd-1',
        version: 3,
        purpose: '',
        launch_uid: '',
        owner_uid: 'o-1',
        opened_by: 'o-1',
        woken_by: '',
        state: 'ended',
        agent: 'inbox-triage',
        harness: '',
        title: 'The inbox, Thursday',
        archived: false,
        runs_on: null,
        lineage: { forked_from: null, imported_from: null },
        turns: 2,
        started_at: '2026-10-15T08:00:00Z',
        kept_until: '2026-11-14T08:00:00Z',
      },
    ],
    next_offset: 20,
  };
}
