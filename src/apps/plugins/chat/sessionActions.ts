/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The chat's entries on a thread's menu (`loop.session.action`): *Switch
 * agent…*, *Clone from here*, *Export*, *Resume* — each saying with `when`
 * whether it applies to the session as it stands, each doing its work
 * through the runtime's session API and the page's ways (a picker, a
 * download, opening a thread). A host adds its own entries by contributing
 * to the same point; nothing here is copied.
 *
 * @module apps/plugins/chat/sessionActions
 */

import type {
  SessionActionContext,
  SessionActionContribution,
  SessionFacts,
} from '../../core';

/** The file a session is exported as. */
export const sessionFileName = (session: SessionFacts): string =>
  `${session.uid}.session.jsonl`;

/** An open session whose turn is idle: the only one whose agent is swapped. */
const idle = (session: SessionFacts): boolean =>
  session.state === 'open' && session.turn === 'idle';

export const SWITCH_AGENT: SessionActionContribution = {
  id: 'switch-agent',
  label: 'Switch agent…',
  order: 10,
  when: idle,
  run: async (session, context) => {
    if (!context.choose) {
      context.say(
        'Switching the agent needs a picker this page has not: use `loop sessions swap`.',
      );
      return;
    }
    const chosen = await context.choose({
      title: `Switch ${session.agent} to`,
      options: [],
      says: async id =>
        `The conversation goes on with ${id}; what was said stays, and the new agent is told so in a sentence.`,
    });
    if (!chosen) {
      return;
    }
    const answer = await context.client.swap(session.uid, chosen);
    context.say(String(answer.said ?? `Swapped to ${chosen}.`));
  },
};

export const CLONE_FROM_HERE: SessionActionContribution = {
  id: 'clone-from-here',
  label: 'Clone from here',
  order: 20,
  when: session => session.turns > 0,
  run: async (session, context) => {
    const upToTurn = context.atTurn ?? session.turns;
    const answer = await context.client.clone(session.uid, { upToTurn });
    const uid = String(answer.uid ?? '');
    context.say(
      `Cloned from turn ${upToTurn} as ${uid}: paused until you resume it.`,
    );
    if (uid && context.openThread) {
      context.openThread(uid);
    }
  },
};

export const EXPORT: SessionActionContribution = {
  id: 'export',
  label: 'Export',
  order: 30,
  when: session => session.turns > 0,
  run: async (session, context) => {
    const text = await context.client.exportFile(session.uid);
    const head = text.split('\n')[0] ?? '';
    const redactions = ((): number => {
      try {
        return Number(JSON.parse(head).redactions ?? 0);
      } catch {
        return 0;
      }
    })();
    if (context.download) {
      context.download(sessionFileName(session), text, 'application/x-ndjson');
    }
    context.say(
      `Exported ${session.turns} turns${redactions ? `, ${redactions} redactions` : ', 0 redactions'} → ${sessionFileName(session)}.`,
    );
  },
};

export const RESUME: SessionActionContribution = {
  id: 'resume',
  label: 'Resume',
  order: 40,
  divider: true,
  when: session => session.state === 'paused',
  run: async (session, context) => {
    await context.client.resume(session.uid, session.agent, {
      onEvent: () => undefined,
    });
    context.say(`Resumed ${session.uid}.`);
  },
};

/** The chat's entries, in the order they are drawn. */
export const CHAT_SESSION_ACTIONS: readonly SessionActionContribution[] = [
  SWITCH_AGENT,
  CLONE_FROM_HERE,
  EXPORT,
  RESUME,
];

export type { SessionActionContext };
