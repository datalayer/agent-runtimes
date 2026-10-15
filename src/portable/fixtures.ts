/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A conversation with one row of every kind, and a question waiting: the
 * fixture every renderer of `portable/views` is tested against — the web's
 * and Datalayer Mobile's (MOBILE §4.2) — so that a change of a row's words or
 * states is caught once.
 *
 * @module portable/fixtures
 */

import { emptyConversation, type ConversationState } from './conversation';
import { RUN_END_WORDS } from './records';

/** A fresh copy of the fixture conversation. */
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
