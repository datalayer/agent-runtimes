/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The thread's `⋯` menu, drawn from the `loop.session.action` registry
 * (MH-F08): the entries that apply to the session as it stands, read when
 * the menu opens; an entry's `when` hides what does not apply.
 *
 * @module apps/plugins/chat/SessionActionsMenu
 */

import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import {
  ActionList,
  ActionMenu,
  Button,
  IconButton,
  Label,
  Text,
} from '@primer/react';
import { KebabHorizontalIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { useContributions } from '@datalayer/reactor/react';
import {
  LoopSessionAction,
  sessionActionsFor,
  type SessionActionContext,
  type SessionFacts,
} from '../../core';
import {
  sessionLineageSaid,
  sessionStateSaid,
} from '../../../portable/activity';

/**
 * What the thread's header says of its session (MH-27, MH-10): its state
 * with the turn phase — *Open · answering*, *Paused*, *Ended* — and where it
 * comes from — *Cloned from e67a52b2 at turn 2*, *Imported from a file…* —
 * as the record says them. Nothing while the session is not read.
 */
export function SessionStateLine({
  facts,
}: {
  facts: SessionFacts | undefined;
}): JSX.Element | null {
  if (!facts) {
    return null;
  }
  const lineage = sessionLineageSaid(facts);
  return (
    <Box
      display="inline-flex"
      alignItems="center"
      gap={2}
      data-session-state={facts.state}
    >
      <Label
        size="small"
        variant={
          facts.state === 'open'
            ? 'accent'
            : facts.state === 'paused'
              ? 'attention'
              : 'secondary'
        }
      >
        {sessionStateSaid(facts)}
      </Label>
      {lineage ? (
        <Text sx={{ fontSize: 0, color: 'fg.muted' }} data-session-lineage="">
          {lineage}
        </Text>
      ) : null}
    </Box>
  );
}

/**
 * The entries offered on a turn's row (MH-10): *Clone from here*, naming
 * the turn. Drawn under the person's message of that turn; nothing while
 * the session is not read or nothing applies.
 */
export function TurnActions({
  facts,
  turn,
  context,
}: {
  facts: SessionFacts | undefined;
  /** The person's turn the row belongs to. */
  turn: number;
  context: SessionActionContext;
}): JSX.Element | null {
  const entries = useContributions(LoopSessionAction);
  const applicable = sessionActionsFor(entries, facts, 'turn');
  if (!facts || applicable.length === 0 || turn < 1) {
    return null;
  }
  return (
    <Box display="inline-flex" gap={1} data-turn-actions={turn}>
      {applicable.map(entry => (
        <Button
          key={entry.id}
          size="small"
          variant="invisible"
          data-turn-action={entry.id}
          onClick={() => {
            Promise.resolve(
              entry.run(facts, { ...context, atTurn: turn }),
            ).catch(error =>
              context.say(String((error as Error).message ?? error)),
            );
          }}
        >
          {entry.label}
        </Button>
      ))}
    </Box>
  );
}

export type SessionActionsMenuProps = {
  /** The session the thread is, when it is one. */
  uid: string | undefined;
  /** How the menu reads the session's facts when it opens. */
  describe: (uid: string) => Promise<SessionFacts>;
  /** What an entry may do. */
  context: SessionActionContext;
};

/** The entries that apply, as a menu; nothing when the thread is no session. */
export function SessionActionsMenu({
  uid,
  describe,
  context,
}: SessionActionsMenuProps): JSX.Element | null {
  const entries = useContributions(LoopSessionAction);
  const [facts, setFacts] = useState<SessionFacts | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState('');
  const saying: SessionActionContext = {
    ...context,
    say: sentence => {
      setSaid(sentence);
      context.say(sentence);
    },
  };
  const onOpenChange = useCallback(
    (opened: boolean) => {
      setOpen(opened);
      if (opened && uid) {
        describe(uid).then(setFacts, () => setFacts(undefined));
      }
    },
    [describe, uid],
  );
  if (!uid || entries.length === 0) {
    return null;
  }
  const applicable = sessionActionsFor(entries, facts);
  return (
    <ActionMenu open={open} onOpenChange={onOpenChange}>
      <ActionMenu.Anchor>
        <IconButton
          icon={KebabHorizontalIcon}
          aria-label="Session actions"
          variant="invisible"
          size="small"
          data-testid="session-actions"
        />
      </ActionMenu.Anchor>
      <ActionMenu.Overlay width="small">
        <ActionList>
          {applicable.length === 0 ? (
            <ActionList.Item disabled>
              {facts
                ? 'Nothing applies to this session now.'
                : 'Reading the session…'}
            </ActionList.Item>
          ) : (
            applicable.map(entry => (
              <ActionList.Item
                key={entry.id}
                data-session-action={entry.id}
                onSelect={() => {
                  if (!facts) {
                    return;
                  }
                  Promise.resolve(entry.run(facts, saying)).catch(error =>
                    saying.say(String((error as Error).message ?? error)),
                  );
                }}
              >
                {entry.label}
              </ActionList.Item>
            ))
          )}
          {said ? (
            <>
              <ActionList.Divider />
              <ActionList.Item disabled data-testid="session-actions-said">
                {said}
              </ActionList.Item>
            </>
          ) : null}
        </ActionList>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}

export default SessionActionsMenu;
