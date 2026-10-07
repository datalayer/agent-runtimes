/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Scenes: the catalogue generated from agentspecs 0.0.61 (LOOP A-12).
 *
 * A scene stages a team. The generated catalogue carries its cast resolved,
 * its entry said, what each beat shows, and what it needs set up; the empty
 * optional lists are dropped.
 */

import { describe, expect, it } from 'vitest';
import {
  SCENE_CATALOGUE,
  getSceneSpec,
  listSceneSpecs,
  scenesStaging,
} from '../scenes';
import { getTeamSpec } from '../teams';
import * as specs from '..';

/** The four scenes of the home page (LOOP A-08): the entry, the members on a runtime. */
const HOME_SCENES: Record<string, [string, string[]]> = {
  'sales-and-accounting': ['sales', ['accounting']],
  'month-end-close': ['month-end-close', ['month-end-close']],
  'crop-monitoring': ['crop-monitoring', ['crop-monitoring']],
  'disaster-assessment': [
    'event-response',
    ['disaster-assessment', 'change-detection'],
  ],
};

describe('the scene catalogue', () => {
  it('holds the four scenes of the home page, each with a face of its own', () => {
    expect(Object.keys(SCENE_CATALOGUE).sort()).toEqual(
      Object.keys(HOME_SCENES).sort(),
    );
    const faces = listSceneSpecs().map(scene => scene.emoji);
    expect(new Set(faces).size).toBe(faces.length);
    expect(faces).not.toContain('👀');
    for (const scene of listSceneSpecs()) {
      expect(scene.schema).toBe('loop.scene/v1');
      expect(scene.name).toBeTruthy();
      expect(scene.description).toBeTruthy();
      expect(scene.icon).toBeTruthy();
      expect(scene.cast.map(member => member.persona.face)).not.toContain(
        scene.emoji,
      );
    }
    expect(specs.SCENE_CATALOGUE).toBe(SCENE_CATALOGUE);
  });

  it('finds a scene by id or reference', () => {
    expect(getSceneSpec('month-end-close:0.0.1')).toBe(
      SCENE_CATALOGUE['month-end-close'],
    );
    expect(getSceneSpec('nope')).toBeUndefined();
    expect(getSceneSpec('constructor')).toBeUndefined();
    expect(listSceneSpecs('earthdata').map(scene => scene.id)).toEqual([
      'crop-monitoring',
      'disaster-assessment',
    ]);
    expect(scenesStaging('disaster-assessment:0.0.1').map(s => s.id)).toEqual([
      'disaster-assessment',
    ]);
  });

  it('carries the cast resolved from the team, and the addresses of the runtime members', () => {
    for (const [sceneId, [entry, onRuntime]] of Object.entries(HOME_SCENES)) {
      const scene = SCENE_CATALOGUE[sceneId];
      const team = getTeamSpec(scene.team)!;
      expect(scene.entry).toBe(entry);
      expect(scene.cast.map(member => member.member)).toEqual(
        team.agents.map(agent => agent.id),
      );
      for (const member of scene.cast) {
        expect(member.app).toBeTruthy();
        expect(member.persona.name).toBeTruthy();
        expect(member.persona.face).toBeTruthy();
        expect(member.brief).toBeTruthy();
        expect(['browser', 'runtime']).toContain(member.runsIn);
      }
      expect(Object.keys(scene.deployment.addresses)).toEqual(onRuntime);
      for (const variable of Object.values(scene.deployment.addresses)) {
        expect(variable).toMatch(/^DATALAYER_DEMO_.*_A2A_URL$/);
      }
    }
  });

  it('says each beat’s cue, its moves and what it shows', () => {
    for (const scene of listSceneSpecs()) {
      expect(scene.script).toHaveLength(4);
      for (const beat of scene.script) {
        expect(beat.cue.say).toBeTruthy();
        expect(beat.moves.length).toBeGreaterThan(0);
        expect(beat.shows.length).toBeGreaterThan(0);
        expect(
          beat.moves.some(move => move.who === scene.entry && move.asks === ''),
        ).toBe(true);
      }
      expect(scene.rehearsal.beats.map(item => item.beat)).toEqual(
        scene.script.map(beat => beat.id),
      );
      expect(scene.audience.who).toBe('visitors');
      expect(scene.stage.opensFirst).toBe(scene.entry);
      expect(scene.setting.assumes).toBeTruthy();
    }
  });

  it('drops the empty optional lists', () => {
    const solo = SCENE_CATALOGUE['month-end-close'];
    expect(solo.cast[0].talksTo).toBeUndefined();
    expect(solo.setting.frames).toBeUndefined();
    expect(solo.script[2].branch).toBeUndefined();
    expect(solo.script[0].branch).toHaveLength(1);
    expect(solo.rehearsal.recording).toBeUndefined();
    const pair = SCENE_CATALOGUE['sales-and-accounting'];
    expect(pair.cast[0].talksTo).toEqual([
      { member: 'accounting', over: 'a2a' },
    ]);
    expect(pair.stage.transcript.withhold).toEqual(['ids']);
  });

  it('carries what a scene needs as setup', () => {
    expect(SCENE_CATALOGUE['crop-monitoring'].setup).toEqual([
      "The agent 'worker-crop-monitoring:0.0.1' is not enabled.",
    ]);
  });
});
