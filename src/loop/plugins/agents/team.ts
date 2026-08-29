/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which member of a team the person is talking to.
 *
 * A team is a group of agents with one front door. The teamspec says who that
 * is — its `supervisor` — and lists the members it routes between, so the
 * selection starts there and moves when a person picks somebody else.
 *
 * The selection is a signal rather than React state because two things read
 * it: the header control that changes it, and the chat that has to send the
 * next prompt to whoever is chosen. Those live in different plugins and must
 * not own copies that can disagree.
 *
 * What switching member does to the conversation is not decided here. It comes
 * from the teamspec's `context.sharing`, because it follows from what the team
 * is: a supervisor team routing between a tutor and a compactor needs one
 * thread both can read, and a delegation team needs the opposite.
 *
 * @module loop/plugins/agents/team
 */

import {
  computed,
  signal,
  type ReadonlySignal,
  type Signal,
} from '@datalayer/reactor';

import type {
  TeamAgentspec,
  TeamContextSharing,
  TeamSpec,
} from '../../../types/teams';
import type { BrowserSubagent } from '../../../runtimes/browser';
import { TEAM_SPECS } from '../../../specs/teams/teams';
import { AGENTSPECS } from '../../../specs/agents/agents';

/** One agent a person can address, as the picker shows it. */
export type TeamMember = {
  /** The member's id within the team. */
  id: string;
  /** What the picker calls it. */
  name: string;
  /** The agentspec it runs, without the version. */
  specId: string;
  /** One line about what it is for. */
  description?: string;
  emoji?: string;
  /** Whether this is the team's front door. */
  isSupervisor: boolean;
};

export type TeamSelection = {
  /** The team being worked with. */
  team: TeamSpec;
  /** Everyone a person may address, supervisor first. */
  members: TeamMember[];
  /** Who is being addressed now. */
  selected: ReadonlySignal<string>;
  /** Address somebody else. */
  select: (memberId: string) => void;
  /** What each member is told about the conversation so far. */
  sharing: TeamContextSharing;
  /** The member currently addressed, resolved. */
  active: ReadonlySignal<TeamMember | undefined>;
};

/** A `ref` such as `jupyter-tutor:0.0.1`, without its version. */
function specIdOf(ref: string | undefined): string {
  return (ref ?? '').split(':')[0] ?? '';
}

/**
 * The members of a team, supervisor first.
 *
 * The supervisor is listed among them rather than above them: in this team it
 * is the tutor, which does work as well as routing, and a front door that
 * cannot be addressed directly would be a strange front door. It is marked
 * so the picker can say which it is.
 */
export function teamMembers(team: TeamSpec): TeamMember[] {
  const supervisorSpecId = specIdOf(team.supervisor?.ref);

  const describe = (
    specId: string,
  ): { description?: string; emoji?: string } => {
    const spec = AGENTSPECS[specId];
    return { description: spec?.description, emoji: spec?.emoji };
  };

  const members: TeamMember[] = (team.agents ?? []).map(agent => {
    const specId = specIdOf(agent.ref);
    return {
      id: agent.id,
      name: agent.name || specId || agent.id,
      specId,
      isSupervisor: specId !== '' && specId === supervisorSpecId,
      ...describe(specId),
    };
  });

  // The supervisor answers first because it is what a prompt reaches by
  // default; a list that buried it would make the default look arbitrary.
  return [
    ...members.filter(member => member.isSupervisor),
    ...members.filter(member => !member.isSupervisor),
  ];
}

/**
 * Track which member is being addressed.
 *
 * Starts on the supervisor, which is the team's own answer to "who reads this
 * first". Falls back to the first member for a team with no supervisor ref.
 */
export function createTeamSelection(teamId: string): TeamSelection | undefined {
  const team = TEAM_SPECS[teamId];
  if (!team) {
    return undefined;
  }

  const members = teamMembers(team);
  if (members.length === 0) {
    return undefined;
  }

  const selected: Signal<string> = signal(members[0].id);

  return {
    team,
    members,
    selected,
    select: (memberId: string) => {
      if (members.some(member => member.id === memberId)) {
        selected.value = memberId;
      }
    },
    sharing: team.context?.sharing ?? 'shared',
    active: computed(() =>
      members.find(member => member.id === selected.value),
    ),
  };
}

/**
 * The agents a given member may hand work to.
 *
 * Read from the teamspec rather than assumed, because a team says two separate
 * things about delegation and they mean different things:
 *
 * - `delegation.allowPeerDelegation` — whether a member may reach *another
 *   member*. The jupyter-notebook team says no: the Tutor handing work to the
 *   Compactor would edit a notebook the learner is working in, which is the one
 *   thing the Tutor exists not to do. Routing between them is the supervisor's
 *   job, where a person can see it happen.
 * - a member's own `subagents` — specialists that belong to it alone. The
 *   Compactor has a CellFixer and a NotebookReproducer, and neither is a member
 *   of the team.
 *
 * So the supervisor gets the other members, everyone gets their own subagents,
 * and a peer only appears where the team allows it.
 */
export function subagentsFor(
  team: TeamSpec,
  memberId: string,
): BrowserSubagent[] {
  const members = teamMembers(team);
  const member = members.find(entry => entry.id === memberId);
  if (!member) {
    return [];
  }

  const asSubagent = (
    name: string,
    specId: string,
    description: string | undefined,
  ): BrowserSubagent | undefined => {
    const spec = AGENTSPECS[specId];
    if (!spec) {
      return undefined;
    }
    return {
      name,
      // The description is what the parent's model chooses on, so a team's own
      // wording wins over the spec's: it says when to reach for this one *in
      // this team*, which is the question being asked.
      description: description || spec.description || name,
      instructions: spec.systemPrompt,
      model: spec.model,
    };
  };

  const peers =
    member.isSupervisor || team.delegation?.allowPeerDelegation
      ? members
          .filter(entry => entry.id !== memberId)
          .map(entry => asSubagent(entry.name, entry.specId, entry.description))
      : [];

  const declared = (team.agents ?? []).find(
    (entry: TeamAgentspec) => entry.id === memberId,
  );
  const own = (declared?.subagents ?? []).map(subagent =>
    asSubagent(
      subagent.name,
      (subagent.ref ?? '').split(':')[0] ?? '',
      subagent.description,
    ),
  );

  return [...peers, ...own].filter(Boolean) as BrowserSubagent[];
}
