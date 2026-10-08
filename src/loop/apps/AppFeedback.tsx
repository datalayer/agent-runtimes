/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The feedback strip above an application's prompt (LOOP V-18): once an
 * answer is in, a thumb up or down and a comment, kept in the application's
 * record under the conversation it was about.
 *
 * Read through what the workspace offers, not around it: the chat keeps the
 * current turn — the question, the answer, the conversation's thread — in
 * `LoopChatTurn`, and the composer hangs what is contributed to
 * `LoopPromptPanel` beside the prompt. `AppRenderer` adds the plugin for an
 * application whose record keeps feedback, in the Studio's Preview and on
 * the hosted page alike.
 *
 * @module loop/apps/AppFeedback
 */

import type { JSX } from 'react';
import { useState } from 'react';
import { Button, IconButton, Text, Textarea } from '@primer/react';
import { ThumbsdownIcon, ThumbsupIcon } from '@primer/octicons-react';
import { contribution, definePlugin, signal } from '@datalayer/reactor';
import { useContributions, useSignalValue } from '@datalayer/reactor/react';
import { useIAMStore } from '../../state';
import type { AppSpec } from '../../types/agentspecs';
import {
  LoopChatTurn,
  LoopPromptPanel,
  agentServerOf,
  type ChatTurnSnapshot,
  type ConversationEntry,
  type LoopWorkspaceContext,
} from '../core';
import { answerIdOf, FEEDBACK_WORDS, sendFeedback } from './feedback';

export const APP_FEEDBACK_PLUGIN_NAME = '@datalayer/loop-plugin-app-feedback';

/* A signal to read when no chat contributed a turn: the hook needs one. */
const NO_TURN = signal<ChatTurnSnapshot>({ id: 0, status: 'idle' });
const NO_CONVERSATION = signal<ConversationEntry[]>([]);

/** What was said of one turn: being sent, kept, or refused. */
type Said = {
  turn: number;
  state: 'sending' | 'kept' | 'refused';
  says: string;
};

export function AppFeedback({
  app,
  workspace,
}: {
  app: Pick<AppSpec, 'name'>;
  workspace: LoopWorkspaceContext;
}): JSX.Element | null {
  const turns = useContributions(LoopChatTurn);
  const turn = useSignalValue(turns[0]?.value.turn ?? NO_TURN);
  // Which answer it is about (P-24): its place among the conversation's answers.
  const conversation = useSignalValue(
    turns[0]?.value.conversation ?? NO_CONVERSATION,
  );
  const answers = conversation.filter(
    entry => entry.role === 'assistant',
  ).length;
  const token = useIAMStore(state => state.token);
  const [liked, setLiked] = useState<{ turn: number; liked: boolean } | null>(
    null,
  );
  const [comment, setComment] = useState('');
  const [said, setSaid] = useState<Said | null>(null);
  // Only under an answer that is in, in a conversation the runtime named.
  if (turn.status !== 'done' || !turn.assistant || !turn.thread) {
    return null;
  }
  const thread = turn.thread;
  const choice = liked?.turn === turn.id ? liked.liked : null;
  const done = said?.turn === turn.id ? said : null;
  // The runtime that answered: none, nothing is sent (no stand-in server).
  const agentBaseUrl = agentServerOf(workspace.sandbox, workspace.serverUrl);
  const send = async () => {
    if (choice === null) {
      return;
    }
    if (agentBaseUrl === undefined) {
      setSaid({
        turn: turn.id,
        state: 'refused',
        says: FEEDBACK_WORDS.noRuntime,
      });
      return;
    }
    setSaid({ turn: turn.id, state: 'sending', says: '' });
    try {
      await sendFeedback(
        {
          session: thread,
          liked: choice,
          comment,
          message: answerIdOf(answers),
        },
        { agentBaseUrl, token },
      );
      setSaid({
        turn: turn.id,
        state: 'kept',
        says: FEEDBACK_WORDS.kept(app.name),
      });
      setComment('');
    } catch (error) {
      setSaid({
        turn: turn.id,
        state: 'refused',
        says: error instanceof Error ? error.message : String(error),
      });
    }
  };
  if (done?.state === 'kept') {
    return (
      <div style={{ padding: '4px 8px' }}>
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{done.says}</Text>
      </div>
    );
  }
  return (
    <div
      role="group"
      aria-label={FEEDBACK_WORDS.ask}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '4px 8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
          {FEEDBACK_WORDS.ask}
        </Text>
        {/* Reactions in the theme (LOOP T-06, T-17): line icons in the
            ink, the chosen one on a quiet ground — no colour, no fill.
            Named on the button itself, and pressed when chosen (P-24): a
            tooltip-label would name it only through a hidden element. */}
        <IconButton
          size="small"
          variant={choice === true ? 'default' : 'invisible'}
          icon={ThumbsupIcon}
          aria-label={FEEDBACK_WORDS.liked}
          aria-pressed={choice === true}
          unsafeDisableTooltip
          onClick={() => setLiked({ turn: turn.id, liked: true })}
        />
        <IconButton
          size="small"
          variant={choice === false ? 'default' : 'invisible'}
          icon={ThumbsdownIcon}
          aria-label={FEEDBACK_WORDS.disliked}
          aria-pressed={choice === false}
          unsafeDisableTooltip
          onClick={() => setLiked({ turn: turn.id, liked: false })}
        />
      </div>
      {choice !== null ? (
        <>
          <Textarea
            aria-label={FEEDBACK_WORDS.comment}
            placeholder={FEEDBACK_WORDS.comment}
            value={comment}
            rows={2}
            resize="vertical"
            block
            onChange={event => setComment(event.target.value)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Quiet: the screen's one filled button is the composer's. */}
            <Button
              size="small"
              variant="default"
              disabled={done?.state === 'sending'}
              onClick={() => void send()}
            >
              {FEEDBACK_WORDS.send}
            </Button>
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
              {FEEDBACK_WORDS.where(app.name)}
            </Text>
          </div>
        </>
      ) : null}
      {done?.state === 'refused' ? (
        // Said in the ink, as an alert: not a verdict, so not its colour.
        <Text role="alert" sx={{ fontSize: 0, color: 'fg.default' }}>
          {done.says}
        </Text>
      ) : null}
    </div>
  );
}

/**
 * The plugin, for one application: the strip above its prompt. Made once per
 * application — a new plugin rebuilds the workspace.
 */
export function defineAppFeedbackPlugin(app: AppSpec) {
  function Panel({
    workspace,
  }: {
    workspace: LoopWorkspaceContext;
  }): JSX.Element | null {
    return <AppFeedback app={app} workspace={workspace} />;
  }
  return definePlugin({
    name: `${APP_FEEDBACK_PLUGIN_NAME}-${app.id}`,
    displayName: `${app.name}: feedback`,
    description: `A thumb and a comment on each answer of ${app.name}, kept in its record.`,
    octicon: 'thumbsup',
    emoji: '\u{1F44D}',
    contributes: [
      contribution(
        LoopPromptPanel,
        { id: 'app-feedback', placement: 'above', order: 20, Component: Panel },
        { id: 'app-feedback' },
      ),
    ],
  });
}
