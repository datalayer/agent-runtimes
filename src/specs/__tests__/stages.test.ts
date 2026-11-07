/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Stages: the catalogue generated from agentspecs 0.0.149 — thirteen, of
 * the three kinds, each staging something the catalogue holds, resolved so
 * that each wears what it stages.
 */

import { describe, expect, it } from 'vitest';
import { APP_CATALOGUE } from '../apps';
import { BATTLE_CATALOGUE } from '../battles';
import { SCENE_CATALOGUE } from '../scenes';
import { STAGE_CATALOGUE, getStage, listStages } from '../stages';
import { stageKindOf, stagedRefOf } from '../../types/agentspecs';

const idOf = (ref: string): string => {
  const at = ref.lastIndexOf(':');
  return at > 0 && ref.slice(at + 1).includes('.') ? ref.slice(0, at) : ref;
};

describe('the Stage catalogue', () => {
  it('holds thirteen stages: eleven scenes, one app, one battle', () => {
    expect(Object.keys(STAGE_CATALOGUE)).toHaveLength(13);
    const kinds = listStages().map(stage => stageKindOf(stage));
    expect(kinds.filter(kind => kind === 'scene')).toHaveLength(11);
    expect(kinds.filter(kind => kind === 'app')).toEqual(['app']);
    expect(kinds.filter(kind => kind === 'battle')).toEqual(['battle']);
  });

  it('stages what the catalogue holds, one thing each', () => {
    for (const stage of listStages()) {
      expect(
        [stage.scene, stage.app, stage.battle].filter(Boolean),
      ).toHaveLength(1);
      const held =
        stageKindOf(stage) === 'scene'
          ? SCENE_CATALOGUE
          : stageKindOf(stage) === 'app'
            ? APP_CATALOGUE
            : BATTLE_CATALOGUE;
      expect([stage.id, idOf(stagedRefOf(stage)) in held]).toEqual([
        stage.id,
        true,
      ]);
    }
  });

  it('wears what it stages, and says where each member plays', () => {
    const stage = getStage('sales-and-accounting:0.0.1');
    expect(stage).toBeDefined();
    expect([stage?.name, stage?.emoji, stage?.public]).toEqual([
      'Sales & Accounting',
      '🤝',
      true,
    ]);
    expect(stage?.deployments).toEqual({ accounting: 'demo-accounting' });
    expect(getStage('disaster-assessment')?.deployments).toEqual({
      'disaster-assessment': 'demo-disaster-assessment',
      'change-detection': 'demo-change-detection',
    });
    // A scripted scene and a Battle play on no deployment of their own.
    expect(getStage('pap-approve-once')?.deployments).toEqual({});
    expect(getStage('pong')?.deployments).toEqual({});
    expect(getStage('pong')?.emoji).toBe('🏓');
    expect(getStage('nobody')).toBeUndefined();
    expect(getStage('constructor')).toBeUndefined();
  });

  it('keeps the five demo stages public, with deployments', () => {
    const demo = listStages().filter(stage => stage.tags.includes('demo'));
    expect(demo.map(stage => stage.id).sort()).toEqual([
      'coding-agent-behind-the-shield',
      'crop-monitoring',
      'disaster-assessment',
      'month-end-close',
      'sales-and-accounting',
    ]);
    for (const stage of demo) {
      expect([
        stage.id,
        stage.public,
        Object.keys(stage.deployments).length > 0,
      ]).toEqual([stage.id, true, true]);
    }
  });
});
