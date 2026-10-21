/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, expect, it } from 'vitest';
import {
  activityFixture,
  activityOf,
  agentRuntimesOf,
  agentSummaryOfRuntime,
  deploymentEventLine,
  deploymentEventOf,
  isCreatingAgent,
  mergeActivityPages,
  notDeletedOf,
  resetBody,
  resetCountsOf,
  resetLines,
  scheduledSays,
  sessionAgentSaid,
  sessionLineageSaid,
  sessionPageOf,
  sessionRowOf,
  sessionStateSaid,
  stateChangeBody,
  stoppedWorkLine,
  stoppedWorkOf,
} from '..';

describe('activity (M-015b)', () => {
  it('reads the shared fixture: in progress, scheduled, completed and the next page', () => {
    const activity = activityOf(activityFixture());
    expect(activity.inProgress.map(entry => entry.sessionUid)).toEqual(['s-2']);
    expect(activity.inProgress[0].appUid).toBe('app-1');
    expect(scheduledSays(activity.scheduled[0])).toBe(
      'Every weekday morning (0 8 * * 1-5) · version 3',
    );
    // A completed session is listed as the record lists sessions: its
    // state, agent, title and turns, never an entry of it.
    expect(activity.completed[0]).toMatchObject({
      uid: 's-1',
      state: 'ended',
      agent: 'inbox-triage',
      title: 'The inbox, Thursday',
      turns: 2,
      runsOn: null,
    });
    expect(sessionStateSaid(activity.completed[0])).toBe('Ended');
    expect(activity.nextOffset).toBe(20);
  });

  it('reads a session row as the record and a runtime say it, and refuses a state it does not have', () => {
    const row = sessionRowOf({
      uid: 'e67a52b2',
      app_uid: 'app-1',
      state: 'open',
      turn: 'running',
      held: true,
      agent: 'shield-mvp-codex',
      harness: 'codex',
      title: 'The refactor',
      runs_on: { kind: 'runtime', uid: '01m5d3e8' },
      lineage: {
        forked_from: { uid: 'c1a9f0e3', at_turn: 2 },
        imported_from: null,
      },
      turns: 5,
      started_at: '2026-10-21T10:00:00Z',
    });
    expect(row.runsOn).toEqual({ kind: 'runtime', uid: '01m5d3e8' });
    expect(row.lineage.forkedFrom).toEqual({ uid: 'c1a9f0e3', atTurn: 2 });
    expect(sessionStateSaid(row)).toBe('Open · answering');
    expect(sessionAgentSaid(row)).toBe('shield-mvp-codex (codex)');
    expect(sessionLineageSaid(row)).toBe('Cloned from c1a9f0e3 at turn 2');
    const imported = sessionRowOf({
      uid: '7d2c4b10',
      state: 'paused',
      lineage: {
        forked_from: null,
        imported_from: {
          digest: 'sha256:1',
          exported_at: '2026-10-21',
          exported_by: '01jq',
        },
      },
      runs_on: { kind: 'team_run', execution_id: 'x-1', seat: 'writer' },
    });
    expect(imported.runsOn).toEqual({
      kind: 'team_run',
      executionId: 'x-1',
      seat: 'writer',
    });
    expect(sessionLineageSaid(imported)).toBe(
      'Imported from a file exported 2026-10-21',
    );
    expect(sessionStateSaid(imported)).toBe('Paused');
    expect(sessionLineageSaid(sessionRowOf({ uid: 'a', state: 'ended' }))).toBe(
      '',
    );
    // Fail fast: no reader maps `stopped` to anything.
    expect(() => sessionRowOf({ uid: 'a', state: 'stopped' })).toThrow(
      'There is no session state "stopped" (session a): one of open, paused, ended.',
    );
    expect(() => sessionRowOf({ state: 'open' })).toThrow(/names its uid/);
    expect(
      sessionPageOf({
        sessions: [{ uid: 'a', state: 'open' }],
        has_more: true,
      }),
    ).toMatchObject({
      hasMore: true,
    });
  });

  it('merges pages: completed from all without repeats, the last page’s offset', () => {
    const first = activityOf(activityFixture());
    const last = { ...activityOf(activityFixture()), nextOffset: null };
    const merged = mergeActivityPages([first, last]);
    expect(merged.completed).toHaveLength(1);
    expect(merged.nextOffset).toBeNull();
    expect(mergeActivityPages([]).inProgress).toEqual([]);
  });
});

describe('lifecycle (M-041b)', () => {
  it('pauses one exact version, and refuses none', () => {
    expect(stateChangeBody(3, 'paused')).toEqual({
      version: 3,
      state: 'paused',
    });
    expect(() => stateChangeBody(0, 'live')).toThrow(/one exact version/);
  });

  it('says what pausing stopped and what it could not', () => {
    expect(
      stoppedWorkLine(stoppedWorkOf({ stopped: [], not_stopped: [] })),
    ).toBe('Paused: nothing was running.');
    const work = stoppedWorkOf({
      stopped: [{ what: 'a session', runtime: 'r1' }],
      not_stopped: [{ what: 'a run', runtime: 'r2', why: 'it did not answer' }],
    });
    expect(stoppedWorkLine(work)).toBe(
      'Paused: 1 session in progress stopped. Not stopped — a run (r2): it did not answer',
    );
  });

  it('counts a reset, sends the counts confirmed, reads what stayed', () => {
    const counts = resetCountsOf({
      conversations: 12,
      schedules: 2,
      entries: 40,
      memories_note: 'Its memories stay.',
    });
    expect(resetLines(counts)).toEqual({
      goes: '12 conversations, 2 schedules',
      stays: [
        'The deployment, its address and the version it runs stay.',
        'Its memories stay.',
      ],
    });
    expect(resetBody(counts)).toEqual({ conversations: 12, schedules: 2 });
    expect(
      notDeletedOf({ not_deleted: [{ what: 'a schedule', why: 'busy' }] }),
    ).toEqual([{ what: 'a schedule', why: 'busy' }]);
  });

  it('says an event with who did it, and refuses an unknown kind', () => {
    const event = deploymentEventOf({
      kind: 'rolled_back',
      actor_handle: 'eric',
      details: { from: 3, to: 2 },
    });
    expect(deploymentEventLine(event)).toBe(
      'Rolled back from version 3 to version 2 by eric',
    );
    expect(() => deploymentEventOf({ kind: 'moved' })).toThrow(/no known kind/);
  });
});

describe('runtimes (M-014b)', () => {
  it('lists agent runtimes only, and says one being created', () => {
    const runtimes = agentRuntimesOf({
      runtimes: [
        {
          runtime_name: 'r1',
          type: 'agent',
          given_name: 'Triage',
          state: 'starting',
        },
        {
          runtime_name: 'r2',
          type: 'notebook',
          environment: { name: 'python-cpu-env' },
        },
        { type: 'agent' },
      ],
    });
    expect(runtimes.map(runtime => runtime.runtimeName)).toEqual(['r1']);
    const summary = agentSummaryOfRuntime(runtimes[0]);
    expect(summary).toMatchObject({ agentName: 'Triage', status: 'starting' });
    expect(isCreatingAgent(summary)).toBe(true);
    expect(
      isCreatingAgent({
        agentName: 'a',
        location: 'x',
        status: 'running',
        isReady: true,
      }),
    ).toBe(false);
  });
});
