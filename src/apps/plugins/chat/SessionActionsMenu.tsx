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
import { ActionList, ActionMenu, IconButton } from '@primer/react';
import { KebabHorizontalIcon } from '@primer/octicons-react';
import { useContributions } from '@datalayer/reactor/react';
import {
  LoopSessionAction,
  sessionActionsFor,
  type SessionActionContext,
  type SessionFacts,
} from '../../core';

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
