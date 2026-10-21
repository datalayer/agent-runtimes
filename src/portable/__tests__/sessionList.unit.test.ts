/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The sessions list (VSCODE VS-04, VS-12; DESKTOP DK-09, DK-25): the rows
 * of two places with their applications, lineage and folders, the places
 * merged (one uid once per place, a place that did not answer one note),
 * the rule of two holders, the filters, the sentences, and the team runs
 * built from the control plane's executions.
 *
 * @module portable/__tests__/sessionList
 */

import { describe, expect, it } from 'vitest';
import {
  applicationOf,
  attentionRowsOf,
  contextValueOf,
  datalayerSessionsUrl,
  ELSEWHERE_SENTENCE,
  entryDescription,
  executionsUrl,
  filterSaid,
  filterSessions,
  groupByApplication,
  heldElsewhere,
  listedSessionsOf,
  mergePlaces,
  NO_LOCAL_SESSION_YET,
  noLocalRuntimeSentence,
  NOTHING_LISTED,
  placeKey,
  placeLabel,
  placeProblemSentence,
  placeSaid,
  resumeRefusal,
  rowDescription,
  rowLabel,
  seatOf,
  type SessionPlace,
  stateIconOf,
  teamOf,
  teamRunDescription,
  teamRunLabel,
  teamRunsOf,
  teamSeatDescription,
  teamStateOf,
  workspaceOf,
} from '../sessionList';

const DATALAYER: SessionPlace = { kind: 'datalayer' };
const LOCAL: SessionPlace = {
  kind: 'local',
  folder: '/home/ada/project',
  folderName: 'project',
  url: 'http://127.0.0.1:41231',
};

const RECORDED = {
  sessions: [
    {
      uid: 'e67a52b2',
      app_uid: 'app-1',
      title: 'The refactor',
      agent: 'shield-mvp-codex',
      harness: 'codex',
      state: 'open',
      turn: '',
      held: false,
      turns: 5,
      runs_on: { kind: 'runtime', uid: '01m5d3e8' },
      lineage: { forked_from: null, imported_from: null },
      started_at: '2026-10-21T10:00:00Z',
      archived: false,
    },
    {
      uid: 'c1a9f0e3',
      app_uid: 'app-1',
      title: 'Before the refactor',
      agent: 'shield-mvp-claude-code',
      harness: 'claude-code',
      state: 'paused',
      turn: 'idle',
      held: false,
      turns: 2,
      runs_on: null,
      lineage: {
        forked_from: { uid: 'e67a52b2', at_turn: 2 },
        imported_from: null,
      },
      started_at: '2026-10-21T10:05:00Z',
      archived: false,
    },
    {
      uid: '0ld0ne00',
      app_uid: 'app-2',
      title: 'Archived',
      agent: 'notes',
      state: 'ended',
      turns: 1,
      lineage: { forked_from: null, imported_from: null },
      archived: true,
    },
  ],
  has_more: false,
};

const HELD = {
  sessions: [
    {
      uid: '7d2c4b10',
      app: {
        id: 'shield-mvp-claude-code',
        name: 'Shield MVP (Claude Code)',
        version: 3,
      },
      instance: { app_uid: '', version: 3 },
      agent: 'shield-mvp-claude-code',
      harness: 'claude-code',
      state: 'open',
      turn: 'running',
      held: true,
      turns: 1,
      title: '',
      workspace: '/home/ada/project',
      runs_on: { kind: 'runtime', uid: 'local' },
      lineage: {
        forked_from: null,
        imported_from: {
          digest: 'sha256:abc',
          exported_at: '2026-10-20T09:00:00Z',
          exported_by: '01jq',
          redactions: 2,
        },
      },
      archived: false,
    },
    {
      // Started in VS Code or a terminal: open, held by another runtime.
      uid: 'e15ewh3r',
      app: { id: 'shield-mvp-codex', name: 'Shield MVP (Codex)' },
      agent: 'shield-mvp-codex',
      harness: 'codex',
      state: 'open',
      turn: '',
      held: false,
      turns: 3,
      title: 'In the editor',
      harness_session: { workspace: '/home/ada/other' },
      lineage: { forked_from: null, imported_from: null },
      archived: false,
    },
  ],
  has_more: false,
};

describe('the places', () => {
  it('keys and labels each place', () => {
    expect(placeKey(DATALAYER)).toBe('datalayer');
    expect(placeKey(LOCAL)).toBe('local:/home/ada/project');
    expect(placeLabel(DATALAYER)).toBe('On Datalayer');
    expect(placeLabel(LOCAL)).toBe('On this machine — project');
  });

  it('lists on Datalayer by opener, and on the control plane by account', () => {
    expect(datalayerSessionsUrl('https://r1.datalayer.run/', '01jq')).toBe(
      'https://r1.datalayer.run/api/ai-agents/v1/apps/sessions?opened_by=01jq',
    );
    expect(executionsUrl('https://r1.datalayer.run')).toBe(
      'https://r1.datalayer.run/api/ai-agents/v1/orchestration/executions',
    );
  });

  it('says an unreachable place in one row, and the rest in a sentence each', () => {
    expect(placeProblemSentence(DATALAYER, 'ai-agents answered 503')).toBe(
      'Datalayer did not answer for your sessions: ai-agents answered 503',
    );
    expect(placeProblemSentence(LOCAL, 'fetch failed')).toBe(
      'The local runtime of project did not answer: fetch failed',
    );
    expect(noLocalRuntimeSentence('File → Work in a folder…')).toBe(
      'No local runtime is running: start a coding agent in a folder, or File → Work in a folder….',
    );
    expect(NO_LOCAL_SESSION_YET).toContain('Work in a folder');
  });
});

describe('the rows of two places', () => {
  it("reads the record's rows with their application", () => {
    const listed = listedSessionsOf(RECORDED);
    expect(listed.map(item => item.row.uid)).toEqual([
      'e67a52b2',
      'c1a9f0e3',
      '0ld0ne00',
    ]);
    expect(listed[0]?.application).toEqual({ key: 'app-1', name: 'app-1' });
    expect(listed[0]?.workspace).toBe('');
    expect(listed[1]?.row.lineage.forkedFrom).toEqual({
      uid: 'e67a52b2',
      atTurn: 2,
    });
  });

  it("reads a runtime's rows with the application's name and the folder from either answer (DK-26)", () => {
    const [held, elsewhere] = listedSessionsOf(HELD);
    expect(held?.application).toEqual({
      key: 'shield-mvp-claude-code',
      name: 'Shield MVP (Claude Code)',
    });
    expect(held?.row.held).toBe(true);
    expect(held?.row.turn).toBe('running');
    // `workspace` on the list's row (1.5.71), else `harness_session`'s
    // (`GET /sessions/{uid}` before it), else nothing.
    expect(held?.workspace).toBe('/home/ada/project');
    expect(elsewhere?.workspace).toBe('/home/ada/other');
    expect(
      workspaceOf({ workspace: '/w', harness_session: { workspace: '/h' } }),
    ).toBe('/w');
    expect(workspaceOf({ harness_session: { acp_session_id: 'x' } })).toBe('');
    expect(applicationOf({ app_uid: 'app-9' })).toEqual({
      key: 'app-9',
      name: 'app-9',
    });
  });

  it('refuses an answer with no sessions, and a state that is none of the three', () => {
    expect(() => listedSessionsOf({ has_more: false })).toThrow(
      /names no sessions/,
    );
    expect(() =>
      listedSessionsOf({ sessions: [{ uid: 'x', state: 'stopped' }] }),
    ).toThrow(/no session state "stopped"/);
  });

  it('describes each row as loop sessions list prints it', () => {
    const [open, clone] = listedSessionsOf(RECORDED);
    const [held] = listedSessionsOf(HELD);
    expect(rowLabel(open!.row)).toBe('The refactor');
    expect(rowLabel(held!.row)).toBe('7d2c4b10');
    expect(rowDescription(open!.row)).toBe(
      'Open · shield-mvp-codex (codex) · 5 turns · not held',
    );
    expect(rowDescription(clone!.row)).toBe(
      'Paused · shield-mvp-claude-code (claude-code) · 2 turns · cloned from e67a52b2 at turn 2',
    );
    expect(rowDescription(held!.row)).toBe(
      'Open · answering · shield-mvp-claude-code (claude-code) · 1 turn · imported from a file exported 2026-10-20T09:00:00Z',
    );
  });

  it('draws the state with the turn phase as its icon, and names the context per place', () => {
    expect(stateIconOf({ state: 'open', turn: 'running' })).toBe('sync~spin');
    expect(stateIconOf({ state: 'open', turn: 'waiting' })).toBe('question');
    expect(stateIconOf({ state: 'open', turn: '' })).toBe('circle-filled');
    expect(stateIconOf({ state: 'paused', turn: 'idle' })).toBe('debug-pause');
    expect(stateIconOf({ state: 'ended', turn: '' })).toBe('circle-slash');
    expect(contextValueOf({ state: 'paused' }, LOCAL)).toBe(
      'session-paused-local',
    );
    expect(contextValueOf({ state: 'open' }, DATALAYER)).toBe(
      'session-open-datalayer',
    );
  });
});

describe('the two places merged (DK-09)', () => {
  const merged = mergePlaces([
    { place: DATALAYER, sessions: listedSessionsOf(RECORDED) },
    {
      place: LOCAL,
      // The same uid twice from one runtime: listed once.
      sessions: [...listedSessionsOf(HELD), ...listedSessionsOf(HELD)],
    },
  ]);

  it('groups each place by application, the archived hidden, a uid once', () => {
    expect(merged.map(group => placeLabel(group.place))).toEqual([
      'On Datalayer',
      'On this machine — project',
    ]);
    expect(merged[0]?.groups.map(group => group.application.name)).toEqual([
      'app-1',
    ]);
    expect(merged[0]?.groups[0]?.sessions).toHaveLength(2);
    expect(merged[0]?.note).toBe('');
    expect(
      merged[1]?.groups.flatMap(group => group.sessions.map(s => s.row.uid)),
    ).toEqual(['7d2c4b10', 'e15ewh3r']);
  });

  it("marks a session open and held by none of this host's runtimes as held elsewhere (D-12)", () => {
    const [held, elsewhere] = merged[1]!.groups.flatMap(g => g.sessions);
    expect(heldElsewhere(held!.row, LOCAL)).toBe(false);
    expect(held?.elsewhere).toBe(false);
    expect(elsewhere?.elsewhere).toBe(true);
    // The record's `held: false` on Datalayer is not "elsewhere": it is not held at all.
    expect(merged[0]?.groups[0]?.sessions[0]?.elsewhere).toBe(false);
    expect(resumeRefusal(elsewhere!)).toBe(ELSEWHERE_SENTENCE);
    expect(resumeRefusal(held!)).toBeNull();
    expect(
      resumeRefusal({
        row: { ...held!.row, state: 'ended', title: 'Done' },
        elsewhere: false,
      }),
    ).toBe('Done has ended: clone it from a turn to go on from there.');
    expect(entryDescription(elsewhere!)).toBe(
      'Open · shield-mvp-codex (codex) · 3 turns · not held · on this machine · /home/ada/other · open in VS Code or a terminal',
    );
  });

  it('says where a session is: on Datalayer, on this machine with its folder, or folder unknown', () => {
    const datalayer = merged[0]!.groups[0]!.sessions[0]!;
    const local = merged[1]!.groups[0]!.sessions[0]!;
    expect(placeSaid(datalayer)).toBe('on Datalayer');
    expect(placeSaid(local)).toBe('on this machine · /home/ada/project');
    expect(placeSaid({ place: LOCAL, workspace: '' })).toBe(
      'on this machine · folder unknown',
    );
  });

  it('says an unreachable place and an empty place in one note each, and narrows to a place', () => {
    const groups = mergePlaces([
      { place: DATALAYER, problem: 'ai-agents answered 503.' },
      { place: LOCAL, sessions: [] },
    ]);
    expect(groups[0]?.note).toBe(
      'Datalayer did not answer for your sessions: ai-agents answered 503.',
    );
    expect(groups[1]?.note).toBe(NOTHING_LISTED);
    const local = mergePlaces(
      [
        { place: DATALAYER, sessions: listedSessionsOf(RECORDED) },
        { place: LOCAL, sessions: listedSessionsOf(HELD) },
      ],
      { app: '', state: 'open', title: '', place: 'local' },
    );
    expect(local).toHaveLength(1);
    expect(local[0]?.place.kind).toBe('local');
  });
});

describe('the filters', () => {
  const listed = [...listedSessionsOf(RECORDED), ...listedSessionsOf(HELD)];

  it('hides the archived and keeps the rest', () => {
    expect(
      filterSessions(listed, { app: '', state: '', title: '' }).map(
        item => item.row.uid,
      ),
    ).toEqual(['e67a52b2', 'c1a9f0e3', '7d2c4b10', 'e15ewh3r']);
  });

  it('narrows by application, state and title', () => {
    expect(
      filterSessions(listed, { app: 'claude code', state: '', title: '' }).map(
        item => item.row.uid,
      ),
    ).toEqual(['7d2c4b10']);
    expect(
      filterSessions(listed, { app: 'app-1', state: 'paused', title: '' }).map(
        item => item.row.uid,
      ),
    ).toEqual(['c1a9f0e3']);
    expect(
      filterSessions(listed, { app: '', state: '', title: 'REFACTOR' }).map(
        item => item.row.uid,
      ),
    ).toEqual(['e67a52b2', 'c1a9f0e3']);
    expect(filterSaid({ app: 'app-1', state: 'paused', title: '' })).toBe(
      'application: app-1 · state: paused',
    );
    expect(filterSaid({ app: '', state: '', title: '', place: 'local' })).toBe(
      'place: local',
    );
    expect(filterSaid({ app: '', state: '', title: '' })).toBe('');
  });

  it('groups by application in order of first appearance', () => {
    const groups = groupByApplication(
      filterSessions(listed, { app: '', state: '', title: '' }),
    );
    expect(groups.map(group => group.application.name)).toEqual([
      'app-1',
      'Shield MVP (Claude Code)',
      'Shield MVP (Codex)',
    ]);
    expect(groups[0]?.sessions).toHaveLength(2);
  });
});

describe('the team runs', () => {
  const EXECUTIONS = [
    {
      executionId: 'run-1',
      rootExecutionId: 'run-1',
      depth: 0,
      status: 'running',
      statusMessage: 'Supervisor: the runner takes the benchmark next.',
      agent: {
        agentId: 'team:benchmarks',
        capability: 'benchmarks',
        protocol: 'datalayer',
      },
      objective: { goal: 'Run the suite\nand report' },
      createdAt: '2026-10-21T09:00:00Z',
      updatedAt: '2026-10-21T09:30:00Z',
    },
    {
      executionId: 'seat-1',
      parentExecutionId: 'run-1',
      rootExecutionId: 'run-1',
      depth: 1,
      status: 'completed',
      agent: {
        agentId: 'team:benchmarks/runner',
        capability: 'runner',
        protocol: 'a2a',
        sessionId: 's-runner',
      },
      objective: { goal: 'Run it' },
      createdAt: '2026-10-21T09:01:00Z',
      updatedAt: '2026-10-21T09:20:00Z',
    },
    {
      executionId: 'seat-2',
      parentExecutionId: 'run-1',
      rootExecutionId: 'run-1',
      depth: 1,
      status: 'waiting',
      agent: {
        agentId: 'team:benchmarks/reviewer',
        capability: 'reviewer',
        protocol: 'acp',
      },
      objective: { goal: 'Review it' },
      createdAt: '2026-10-21T09:02:00Z',
      updatedAt: '2026-10-21T09:25:00Z',
    },
    {
      executionId: 'run-0',
      rootExecutionId: 'run-0',
      depth: 0,
      status: 'terminated',
      agent: {
        agentId: 'team:benchmarks',
        capability: 'benchmarks',
        protocol: 'datalayer',
      },
      objective: { goal: 'An older run' },
      createdAt: '2026-10-20T09:00:00Z',
      updatedAt: '2026-10-20T09:30:00Z',
    },
    {
      executionId: 'not-a-team',
      rootExecutionId: 'not-a-team',
      depth: 0,
      status: 'running',
      agent: { agentId: 'crawler', capability: 'crawl', protocol: 'a2a' },
      objective: { goal: 'Crawl' },
      createdAt: '2026-10-21T11:00:00Z',
      updatedAt: '2026-10-21T11:00:00Z',
    },
  ];

  it("maps each execution state to a session's, and refuses any other word", () => {
    for (const word of [
      'created',
      'assigned',
      'running',
      'waiting',
      'retrying',
    ]) {
      expect(teamStateOf(word)).toBe('open');
    }
    expect(teamStateOf('paused')).toBe('paused');
    for (const word of ['completed', 'failed', 'cancelled', 'terminated']) {
      expect(teamStateOf(word)).toBe('ended');
    }
    expect(() => teamStateOf('stopped')).toThrow(
      /no execution state "stopped"/,
    );
  });

  it('builds the runs from the roots of teams, newest first, with their seats', () => {
    const runs = teamRunsOf(EXECUTIONS);
    expect(runs.map(run => run.executionId)).toEqual(['run-1', 'run-0']);
    const [run] = runs;
    expect(run?.team).toBe('benchmarks');
    expect(run?.state).toBe('open');
    expect(run?.steering).toBe(
      'Supervisor: the runner takes the benchmark next.',
    );
    expect(run?.seats.map(seat => seat.seat)).toEqual(['runner', 'reviewer']);
    expect(run?.seats[0]?.sessionUid).toBe('s-runner');
    expect(run?.seats[1]?.sessionUid).toBe('');
    expect(teamOf('team:benchmarks/runner')).toBe('benchmarks');
    expect(seatOf('team:benchmarks/runner')).toBe('runner');
    expect(seatOf('crawler')).toBe('crawler');
  });

  it('labels and describes a run and a seat', () => {
    const [run] = teamRunsOf(EXECUTIONS);
    expect(teamRunLabel(run!)).toBe('benchmarks — Run the suite');
    expect(teamRunDescription(run!)).toBe(
      'Open (running) · 2 seats · Supervisor: the runner takes the benchmark next.',
    );
    expect(teamSeatDescription(run!.seats[0]!)).toBe(
      'completed · session s-runner',
    );
    expect(teamSeatDescription(run!.seats[1]!)).toBe(
      'waiting · no session yet',
    );
  });
});

describe('the sessions as a host watches them (VS-10, DK-14)', () => {
  it('is one row per session listed, none in front', () => {
    const listed = listedSessionsOf({
      sessions: [
        {
          uid: 's-1',
          state: 'open',
          turn: 'waiting',
          held: true,
          agent: 'shield-mvp-claude-code',
          harness: 'claude-code',
          title: 'Fix the tests',
          turns: 2,
          archived: false,
          app: { id: 'coder', name: 'Coder' },
        },
        {
          uid: 's-2',
          state: 'paused',
          turn: '',
          held: null,
          agent: 'desk',
          title: '',
          turns: 0,
          archived: false,
        },
      ],
      has_more: false,
    });
    expect(attentionRowsOf(listed)).toEqual([
      {
        key: 's-1',
        title: 'Fix the tests',
        agent: 'shield-mvp-claude-code',
        state: 'open',
        turn: 'waiting',
        held: true,
        inFront: false,
      },
      {
        key: 's-2',
        title: 's-2',
        agent: 'desk',
        state: 'paused',
        turn: '',
        held: null,
        inFront: false,
      },
    ]);
  });
});
