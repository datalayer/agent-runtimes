/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The chat's entries on a thread's menu (`loop.session.action`): *Switch
 * agent…*, *Clone from here*, *Export*, *Import…*, *Resume* — each saying
 * with `when` whether it applies to the session as it stands, each doing
 * its work through the runtime's session API and the page's ways (a
 * picker, a file, a download, opening a thread). *Clone from here* is also
 * on each turn's row, where it names the turn. A host adds its own entries
 * by contributing to the same point; nothing here is copied.
 *
 * Every refusal of the runtime is said as it is — a turn still running, a
 * turn the session does not have, a file this runtime does not read, an
 * agent it lacks — and nothing falls back to a default.
 *
 * @module apps/plugins/chat/sessionActions
 */

import type {
  SessionActionContext,
  SessionActionContribution,
  SessionFacts,
} from '../../core';
import { listAgentspecs } from '../../../specs/agents';
import { listHarnesses } from '../../../specs/harnesses';

/** The file a session is exported as. */
export const sessionFileName = (session: Pick<SessionFacts, 'uid'>): string =>
  `${session.uid}.session.jsonl`;

/** What the entries say, in a person's words. */
export const SESSION_ACTION_WORDS = {
  switchAgent: 'Switch agent…',
  switchTitle: (agent: string): string => `Switch ${agent} to`,
  noPicker:
    'Switching the agent needs a picker this page has not: use `loop sessions swap`.',
  noAgents: 'No other agent of the catalogue runs on a harness.',
  cloneFromHere: 'Clone from here',
  cloned: (atTurn: number, uid: string): string =>
    `Cloned from turn ${atTurn} as ${uid}: opened here, the source untouched.`,
  export: 'Export',
  exported: (turns: number, redactions: number, name: string): string =>
    `Exported ${turns} turn${turns === 1 ? '' : 's'}, ${redactions} redaction${redactions === 1 ? '' : 's'} → ${name}.`,
  import: 'Import…',
  noFilePicker:
    'Importing a session needs a file picker this page has not: use `loop sessions import`.',
  imported: (uid: string, turns: number, redactions: number): string =>
    `Imported as ${uid} (${turns} turn${turns === 1 ? '' : 's'}, ${redactions} redaction${redactions === 1 ? '' : 's'}): opened here.`,
  resume: 'Resume',
  resumed: (uid: string): string => `Resumed ${uid}.`,
} as const;

/** One agent a session may be switched to. */
export type AgentChoice = { id: string; label: string; description?: string };

/**
 * The agents a session may be switched to: the catalogue's harness agents
 * — each harness offered by the catalogue agent that runs on it, as the
 * Studio's toolbox offers them — the session's own agent left out. A swap
 * may cross kinds (a model agent to a harness and back): what the person
 * chooses among is what the catalogue has.
 */
export function agentChoices(
  session: Pick<SessionFacts, 'agent'>,
): AgentChoice[] {
  const specs = listAgentspecs();
  return listHarnesses()
    .filter(harness => harness.id !== 'custom' && harness.enabled)
    .flatMap(harness => {
      const agent = specs.find(spec => spec.harness === harness.id);
      if (!agent || agent.id === session.agent) {
        return [];
      }
      return [
        {
          id: agent.id,
          label: `${agent.name} (${harness.name})`,
          description: harness.description,
        },
      ];
    });
}

/** A harness's name, or the agent's id when it runs on none. */
const spokenAs = (agent: string, harness: string): string => {
  const known = harness
    ? listHarnesses().find(h => h.id === harness)
    : undefined;
  return known?.name ?? (harness || agent);
};

/**
 * What the new agent is told, shown before the swap is sent: the sentence
 * the runtime says on the swap, in its first two clauses; the runtime's own
 * `said` — whose last clause follows what the old harness can load again —
 * is shown once the swap is done.
 */
export function swapSentence(
  session: Pick<SessionFacts, 'agent' | 'harness' | 'turns'>,
  to: AgentChoice,
): string {
  const from = spokenAs(session.agent, session.harness);
  const target = to.label.replace(/\s*\(.*\)$/, '');
  return `This conversation was with ${from} until turn ${session.turns}; from here it is with ${target}. What was said stays.`;
}

/** An open session whose turn is idle: the only one whose agent is swapped. */
const idle = (session: SessionFacts): boolean =>
  session.state === 'open' && session.turn === 'idle';

/** The redactions a session file's first line counts. */
export function redactionsOf(text: string): number {
  const head = text.split('\n')[0] ?? '';
  try {
    return Number(JSON.parse(head).redactions ?? 0) || 0;
  } catch {
    return 0;
  }
}

export const SWITCH_AGENT: SessionActionContribution = {
  id: 'switch-agent',
  label: SESSION_ACTION_WORDS.switchAgent,
  order: 10,
  when: idle,
  run: async (session, context) => {
    if (!context.choose) {
      context.say(SESSION_ACTION_WORDS.noPicker);
      return;
    }
    const options = agentChoices(session);
    if (options.length === 0) {
      context.say(SESSION_ACTION_WORDS.noAgents);
      return;
    }
    const chosen = await context.choose({
      title: SESSION_ACTION_WORDS.switchTitle(session.agent),
      options,
      says: async id => {
        const choice = options.find(option => option.id === id);
        return choice ? swapSentence(session, choice) : '';
      },
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
  label: SESSION_ACTION_WORDS.cloneFromHere,
  order: 20,
  placement: 'both',
  when: session => session.turns > 0,
  run: async (session, context) => {
    const upToTurn = context.atTurn ?? session.turns;
    const answer = await context.client.clone(session.uid, { upToTurn });
    const uid = String(answer.uid ?? '');
    if (!uid) {
      throw new Error(
        `The runtime cloned session ${session.uid} and named no new session.`,
      );
    }
    context.say(SESSION_ACTION_WORDS.cloned(upToTurn, uid));
    context.openThread?.(uid);
  },
};

export const EXPORT: SessionActionContribution = {
  id: 'export',
  label: SESSION_ACTION_WORDS.export,
  order: 30,
  when: session => session.turns > 0,
  run: async (session, context) => {
    const text = await context.client.exportFile(session.uid);
    const name = sessionFileName(session);
    context.download?.(name, text, 'application/x-ndjson');
    context.say(
      SESSION_ACTION_WORDS.exported(session.turns, redactionsOf(text), name),
    );
  },
};

export const IMPORT: SessionActionContribution = {
  id: 'import',
  label: SESSION_ACTION_WORDS.import,
  order: 35,
  when: () => true,
  run: async (_session, context) => {
    if (!context.pickFile) {
      context.say(SESSION_ACTION_WORDS.noFilePicker);
      return;
    }
    const text = await context.pickFile('.jsonl,application/x-ndjson');
    if (!text) {
      return;
    }
    const answer = await context.client.importFile(text);
    const uid = String(answer.uid ?? '');
    if (!uid) {
      throw new Error('The runtime imported the file and named no session.');
    }
    context.say(
      SESSION_ACTION_WORDS.imported(
        uid,
        Number(answer.turns ?? 0) || 0,
        Number(answer.redactions ?? 0) || 0,
      ),
    );
    context.openThread?.(uid);
  },
};

export const RESUME: SessionActionContribution = {
  id: 'resume',
  label: SESSION_ACTION_WORDS.resume,
  order: 40,
  divider: true,
  when: session => session.state === 'paused',
  run: async (session, context) => {
    await context.client.resume(session.uid, session.agent, {
      onEvent: () => undefined,
    });
    context.say(SESSION_ACTION_WORDS.resumed(session.uid));
    // Drawn again from the runtime, which holds it now.
    context.openThread?.(session.uid);
  },
};

/** The chat's entries, in the order they are drawn. */
export const CHAT_SESSION_ACTIONS: readonly SessionActionContribution[] = [
  SWITCH_AGENT,
  CLONE_FROM_HERE,
  EXPORT,
  IMPORT,
  RESUME,
];

export type { SessionActionContext };
