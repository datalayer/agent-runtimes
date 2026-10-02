/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Ops, Guards, Gates and Tracks: four catalogues generated from agentspecs
 * 0.0.14. A Guard extends a guardrail; an Op arrives with everything it names.
 */

import { describe, expect, it } from 'vitest';
import { COG_CATALOGUE } from '../cogs';
import { GATE_CATALOGUE, getGate, listGates } from '../gates';
import { GUARDRAIL_CATALOG } from '../guardrails';
import { GUARD_CATALOGUE, getGuard, listGuards } from '../guards';
import { OP_CATALOGUE, getOp, listOps } from '../ops';
import { TRACK_CATALOGUE, getTrack, listTracks } from '../tracks';
import * as specs from '..';

const OP = 'op-sales-pipeline-board-report';
const CATEGORIES = [
  'algorithmic',
  'consensus',
  'expert',
  'outcome',
  'policy-safety',
  'regression-drift',
  'source-grounding',
];

describe('the Guard catalogue', () => {
  it('gives each Guard with the policy of the guardrail it extends', () => {
    expect(listGuards().length).toBeGreaterThanOrEqual(12);
    for (const guard of listGuards()) {
      const guardrail = GUARDRAIL_CATALOG[guard.guardrail];
      expect(guardrail).toBeDefined();
      expect(guard.permissions).toEqual(guardrail.permissions);
      expect(guard.token_limits).toEqual(guardrail.token_limits);
      expect(guard.id).not.toBe(guardrail.id);
      expect(guard.check).toBeTruthy();
      expect(guard.stages.length).toBeGreaterThan(0);
    }
    expect(
      [...new Set(listGuards().map(guard => guard.category))].sort(),
    ).toEqual(CATEGORIES);
  });

  it('answers a lookup with a catalogue entry or with nothing', () => {
    expect(getGuard('schema-guard:0.0.1')).toBe(
      GUARD_CATALOGUE['schema-guard'],
    );
    expect(getGate('release-approval:0.0.1')).toBe(
      GATE_CATALOGUE['release-approval'],
    );
    expect(getTrack('standard:0.0.1')).toBe(TRACK_CATALOGUE['standard']);
    expect(getOp(`${OP}:0.0.1`)).toBe(OP_CATALOGUE[OP]);
    for (const inherited of ['constructor', 'toString', '__proto__', 'nope']) {
      for (const get of [getGuard, getGate, getTrack, getOp]) {
        expect(get(inherited)).toBeUndefined();
        expect(get(`${inherited}:0.0.1`)).toBeUndefined();
      }
    }
  });
});

describe('Gates and Tracks', () => {
  it('give a Gate with the signals it reads, reported by its Guards', () => {
    for (const gate of listGates()) {
      const reported = gate.guards.flatMap(ref =>
        (getGuard(ref)?.signals ?? []).map(signal => signal.name),
      );
      for (const signal of gate.signals) {
        expect(reported).toContain(signal);
      }
    }
    const gate = GATE_CATALOGUE['tool-violation-retry'];
    expect([gate.then, gate.maxRetries]).toEqual(['retry', 2]);
  });

  it('give a Track with what is kept and for how long', () => {
    const track = TRACK_CATALOGUE['financial-reporting'];
    expect([track.retainFor, track.retentionDays]).toEqual(['7_years', 2555]);
    expect(track.feedsMemory).toBe(true);
    for (const kept of listTracks()) {
      expect(kept.include).toEqual(
        expect.arrayContaining(['guard_results', 'gate_decisions']),
      );
      expect(kept.exchangeable).toBe(false);
    }
  });
});

describe('the comprehensive Op', () => {
  it('arrives with its Cog, its Guards by stage, its Gates and its Track', () => {
    expect(listOps().map(op => op.id)).toEqual([OP]);
    const op = OP_CATALOGUE[OP];
    expect(op.owner).toBeTruthy();
    for (const cog of op.cogs) {
      expect(COG_CATALOGUE[cog.id].agent).toBe(cog.agent);
    }
    expect(op.lineage).toEqual([
      'datalayer',
      'sales-pipeline',
      'board-reporting',
    ]);
    const stages = [
      op.guards.preflight,
      op.guards.inFlight,
      op.guards.postRun,
      op.guards.continuous,
    ];
    for (const stage of stages) {
      expect(stage.length).toBeGreaterThan(0);
    }
    const guards = stages.flat();
    expect([...new Set(guards.map(guard => guard.category))].sort()).toEqual(
      CATEGORIES,
    );
    const ran = guards.map(guard => guard.id);
    expect(op.gates).toHaveLength(8);
    for (const gate of op.gates) {
      for (const ref of gate.guards) {
        expect(ran).toContain(ref.split(':')[0]);
      }
    }
    expect(op.track.id).toBe('financial-reporting');
    expect(op.frameGuards.map(guard => guard.id)).toContain('finance-review');
  });

  it('is exported with the other catalogues', () => {
    expect(specs.OP_CATALOGUE).toBe(OP_CATALOGUE);
    expect(specs.GUARD_CATALOGUE).toBe(GUARD_CATALOGUE);
    expect(specs.GATE_CATALOGUE).toBe(GATE_CATALOGUE);
    expect(specs.TRACK_CATALOGUE).toBe(TRACK_CATALOGUE);
  });
});
