/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which member of a team the next prompt reaches.
 *
 * A team has one front door and several agents behind it, and the teamspec
 * already says which is which. So this holds down that the selection follows
 * the spec rather than a default invented here — a picker that started on
 * whichever member happened to be listed first would look arbitrary the moment
 * somebody reordered the YAML.
 */

import { describe, expect, it } from 'vitest';
import { buildReactorFromPlugins, configurePlugin } from '@datalayer/reactor';

import { LoopSlots } from '../core';
import { AgentsPlugin } from '../plugins/agents';
import {
  createTeamSelection,
  subagentsFor,
  teamMembers,
} from '../plugins/agents/team';
import { TEAM_SPECS } from '../../specs/teams/teams';

const TEAM_ID = 'jupyter-notebook';

describe('the jupyter-notebook team', () => {
  it('has a supervisor and the members it routes between', () => {
    const selection = createTeamSelection(TEAM_ID);
    expect(selection).toBeDefined();
    expect(selection!.members.map(member => member.specId)).toEqual([
      'jupyter-tutor',
      'jupyter-notebook-compactor',
    ]);
  });

  it('starts on the supervisor, because the spec says who that is', () => {
    // Not "the first member": the order below follows from the supervisor
    // being hoisted, and the point is that the *spec* decides.
    const selection = createTeamSelection(TEAM_ID)!;
    const active = selection.members.find(
      member => member.id === selection.selected.value,
    );
    expect(active?.isSupervisor).toBe(true);
    expect(active?.specId).toBe('jupyter-tutor');
  });

  it('reads its context model from the spec, not from a default here', () => {
    expect(selectionSharing()).toBe(TEAM_SPECS[TEAM_ID].context?.sharing);
    // And that team shares: routing is guesswork if the member receiving the
    // work cannot see what was asked before.
    expect(selectionSharing()).toBe('shared');
  });

  it('carries what the picker needs to describe each member', () => {
    for (const member of createTeamSelection(TEAM_ID)!.members) {
      expect(member.name, member.id).toBeTruthy();
      // From the agentspec rather than restated in the team, so the two
      // cannot drift.
      expect(member.description, member.id).toBeTruthy();
      expect(member.emoji, member.id).toBeTruthy();
    }
  });
});

function selectionSharing(): string {
  return createTeamSelection(TEAM_ID)!.sharing;
}

describe('changing who is addressed', () => {
  it('moves to a member of the team', () => {
    const selection = createTeamSelection(TEAM_ID)!;
    selection.select('compactor');
    expect(selection.selected.value).toBe('compactor');
    expect(selection.active.value?.specId).toBe('jupyter-notebook-compactor');
  });

  it('ignores a name that is not in the team', () => {
    // A prompt addressed to nobody is worse than a prompt addressed to the
    // supervisor, so an unknown id leaves the selection where it was.
    const selection = createTeamSelection(TEAM_ID)!;
    const before = selection.selected.value;
    selection.select('nobody');
    expect(selection.selected.value).toBe(before);
  });
});

describe('teams that are not there', () => {
  it('has no selection for an unknown team', () => {
    expect(createTeamSelection('no-such-team')).toBeUndefined();
  });

  it('has no members for a team with none', () => {
    expect(
      teamMembers({ ...TEAM_SPECS[TEAM_ID], agents: [] } as never),
    ).toEqual([]);
  });
});

describe('the picker in the header', () => {
  function headerIds(teamId?: string): string[] {
    const reactor = buildReactorFromPlugins([
      configurePlugin(AgentsPlugin, {
        serverUrl: '',
        ...(teamId ? { teamId } : {}),
      }),
    ]);
    reactor.start();
    const output = reactor.getOutput<{
      components?: { slot: string; id: string }[];
    }>(AgentsPlugin.name);
    return (output?.components ?? [])
      .filter(entry => entry.slot === LoopSlots.header)
      .map(entry => entry.id);
  }

  it('appears when there is a team', () => {
    expect(headerIds(TEAM_ID)).toContain('team-member-picker');
  });

  it('stays away when there is not', () => {
    // Most workspaces run one agent. A control that opens onto a single
    // option is furniture.
    expect(headerIds()).not.toContain('team-member-picker');
    expect(headerIds('no-such-team')).not.toContain('team-member-picker');
  });
});

describe('who a member may hand work to', () => {
  it('lets the supervisor reach the other members', () => {
    // Routing is the supervisor's job, and it can only route to somebody.
    const team = TEAM_SPECS[TEAM_ID];
    const names = subagentsFor(team, 'tutor').map(entry => entry.name);
    expect(names).toContain('Notebook Compactor');
  });

  it('does not let a member reach a peer when the team forbids it', () => {
    /*
     * `allowPeerDelegation: false`, and the team says why: the Tutor handing
     * work to the Compactor would edit a notebook the learner is working in,
     * which is the one thing the Tutor exists not to do.
     */
    const team = TEAM_SPECS[TEAM_ID];
    expect(team.delegation?.allowPeerDelegation).toBe(false);

    const names = subagentsFor(team, 'compactor').map(entry => entry.name);
    expect(names).not.toContain('Code Tutor');
  });

  it('gives a member its own specialists', () => {
    // Neither is a member of the team; both belong to the Compactor alone.
    const names = subagentsFor(TEAM_SPECS[TEAM_ID], 'compactor').map(
      entry => entry.name,
    );
    expect(names).toEqual(['CellFixer', 'NotebookReproducer']);
  });

  it('carries what the parent model chooses on', () => {
    for (const subagent of subagentsFor(TEAM_SPECS[TEAM_ID], 'compactor')) {
      // The team's own wording wins: it says when to reach for this one *in
      // this team*, which is the question being asked.
      expect(subagent.description, subagent.name).toBeTruthy();
      expect(subagent.instructions, subagent.name).toBeTruthy();
    }
  });

  it('has nothing for a member that is not in the team', () => {
    expect(subagentsFor(TEAM_SPECS[TEAM_ID], 'nobody')).toEqual([]);
  });
});
