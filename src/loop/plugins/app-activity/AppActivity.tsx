/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an application did, beside its page (LOOP R-01b, R-15, U-20): its
 * sessions, newest first, each in a sentence, opened on what it did step by
 * step — tool calls, the rules' decisions, the checks that stopped a step,
 * the approvals, the answer. Read from the record ai-agents keeps (R-07),
 * again each time a turn of the conversation ends.
 *
 * @module loop/plugins/app-activity/AppActivity
 */

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Heading, Label, RelativeTime, Spinner, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { signal } from '@datalayer/reactor';
import { useContributions, useSignalValue } from '@datalayer/reactor/react';
import { useCoreStore } from '@datalayer/core/lib/state';
import { useIAMStore } from '@datalayer/core/lib/state/substates/IAMState';
import { LoopChatTurn, type ChatTurnSnapshot } from '../../core';
import {
  RECORD_KIND_WORDS,
  listSessions,
  readSession,
  sessionSentence,
  type RecordEntry,
  type RecordsContext,
} from '../../apps/records';

/** What the feed says. */
export const APP_ACTIVITY_WORDS = {
  title: 'Activity',
  unsaved:
    'Recorded once it is saved on Datalayer: each session there — its address, or its Preview on Datalayer — is listed here.',
  signedOut: 'Its activity is its owner’s: sign in to Datalayer to read it.',
  none: 'Nothing yet: a session on Datalayer — its address, or the Preview on Datalayer — is recorded here.',
} as const;

const NO_TURN = signal<ChatTurnSnapshot>({ id: 0, status: 'idle' });

type Loaded<T> = { value?: T; error?: string; loading: boolean };

/** Read `load` while `when`, again whenever `key` changes. */
function useRead<T>(
  load: () => Promise<T>,
  key: string,
  when = true,
): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ loading: when });
  useEffect(() => {
    if (!when) {
      return undefined;
    }
    let cancelled = false;
    setState(previous => ({ ...previous, loading: true }));
    load().then(
      value => !cancelled && setState({ value, loading: false }),
      (error: unknown) =>
        !cancelled &&
        setState({
          error: error instanceof Error ? error.message : String(error),
          loading: false,
        }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, when]);
  return state;
}

function Session({
  context,
  session,
}: {
  context: RecordsContext;
  session: RecordEntry;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const entries = useRead(
    () => readSession(context, session.sessionUid),
    `${session.sessionUid}:${context.token}`,
    open,
  );
  return (
    <Box
      as="details"
      onToggle={(event: React.SyntheticEvent<HTMLDetailsElement>) =>
        setOpen(event.currentTarget.open)
      }
      sx={{ borderTop: '1px solid', borderColor: 'border.muted', py: 2 }}
    >
      <Box as="summary" sx={{ cursor: 'pointer', fontSize: 1 }}>
        {session.createdAt ? (
          <RelativeTime datetime={session.createdAt} />
        ) : (
          'A session'
        )}
        {session.version ? ` · version ${session.version}` : ''}
        {entries.value ? ` · ${sessionSentence(entries.value)}` : ''}
      </Box>
      {!open ? null : entries.loading ? (
        <Spinner size="small" />
      ) : entries.error ? (
        <Text role="alert" sx={{ fontSize: 1 }}>
          {entries.error}
        </Text>
      ) : (
        <Box as="ol" sx={{ pl: 3, mt: 2, mb: 0, fontSize: 1 }}>
          {(entries.value ?? []).map(entry => (
            <Box as="li" key={entry.uid} sx={{ mb: 1 }}>
              <Label sx={{ mr: 2 }}>
                {RECORD_KIND_WORDS[entry.kind] ?? entry.kind}
              </Label>
              {entry.summary}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export function AppActivity({ appUid }: { appUid?: string }): JSX.Element {
  const token = useIAMStore(state => state.token) ?? '';
  const aiAgentsUrl =
    useCoreStore(
      (state: { configuration?: { aiAgentsUrl?: string } }) =>
        state.configuration,
    )?.aiAgentsUrl ?? '';
  // Read again as each turn ends: what it just did is in the record then.
  const turnEntries = useContributions(LoopChatTurn);
  const turn = useSignalValue(turnEntries[0]?.value.turn ?? NO_TURN);
  const settled = turn.status !== 'thinking' && turn.status !== 'streaming';
  const [ended, setEnded] = useState(0);
  useEffect(() => {
    if (settled) {
      setEnded(turn.id);
    }
  }, [settled, turn.id]);
  const context: RecordsContext = { aiAgentsUrl, token };
  const readable = Boolean(appUid && token);
  const sessions = useRead(
    () => listSessions(context, appUid ?? ''),
    `${appUid}:${token}:${aiAgentsUrl}:${ended}`,
    readable,
  );
  return (
    <Box data-testid="app-activity">
      <Heading as="h3" sx={{ fontSize: 2, mb: 2 }}>
        {APP_ACTIVITY_WORDS.title}
      </Heading>
      {!appUid ? (
        <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', m: 0 }}>
          {APP_ACTIVITY_WORDS.unsaved}
        </Text>
      ) : !token ? (
        <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', m: 0 }}>
          {APP_ACTIVITY_WORDS.signedOut}
        </Text>
      ) : sessions.loading && !sessions.value ? (
        <Spinner size="small" />
      ) : sessions.error ? (
        <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', m: 0 }}>
          {sessions.error}
        </Text>
      ) : (sessions.value ?? []).length === 0 ? (
        <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', m: 0 }}>
          {APP_ACTIVITY_WORDS.none}
        </Text>
      ) : (
        (sessions.value ?? []).map(session => (
          <Session key={session.uid} context={context} session={session} />
        ))
      )}
    </Box>
  );
}

export default AppActivity;
