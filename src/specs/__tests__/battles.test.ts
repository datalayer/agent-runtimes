/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Battles: the catalogue generated from agentspecs 0.0.145 — three, one per
 * variant, each decided as its variant is, each contestant playing a scene
 * or an app the catalogue holds.
 */

import { describe, expect, it } from 'vitest';
import { APP_CATALOGUE } from '../apps';
import { BATTLE_CATALOGUE, getBattle, listBattles } from '../battles';
import { GUARD_CATALOGUE } from '../guards';
import { SCENE_CATALOGUE } from '../scenes';

const DECIDED = {
  race: 'first_done',
  game: 'score',
  challenge: 'measure',
} as const;

describe('the Battle catalogue', () => {
  it('holds three battles, one per variant', () => {
    expect(Object.keys(BATTLE_CATALOGUE).sort()).toEqual([
      'invoice-race',
      'pong',
      'report-challenge',
    ]);
    expect(
      listBattles()
        .map(battle => battle.variant)
        .sort(),
    ).toEqual(['challenge', 'game', 'race']);
  });

  it('decides each as its variant is, and only a game has an arena', () => {
    for (const battle of listBattles()) {
      expect(battle.referee.decidesBy).toBe(DECIDED[battle.variant]);
      expect(battle.arena !== undefined).toBe(battle.variant === 'game');
      expect(battle.clockSeconds).toBeGreaterThanOrEqual(10);
      expect(battle.contestants.length).toBeGreaterThanOrEqual(2);
      expect(battle.goal.length).toBeGreaterThan(0);
    }
  });

  it('names scenes, apps and a Guard the catalogues hold', () => {
    const id = (ref: string) => ref.split(':')[0];
    for (const battle of listBattles()) {
      for (const contestant of battle.contestants) {
        expect(Boolean(contestant.scene) !== Boolean(contestant.app)).toBe(
          true,
        );
        if (contestant.scene) {
          expect(SCENE_CATALOGUE[id(contestant.scene)]).toBeDefined();
        } else {
          expect(APP_CATALOGUE[id(contestant.app)]).toBeDefined();
        }
      }
      if (battle.referee.measure) {
        const guard = GUARD_CATALOGUE[id(battle.referee.measure)];
        expect(guard).toBeDefined();
        expect(guard.signals.some(signal => signal.type === 'number')).toBe(
          true,
        );
      }
    }
  });

  it('is read by id or versioned reference', () => {
    expect(getBattle('pong:0.0.1')).toBe(getBattle('pong'));
    expect(getBattle('chess')).toBeUndefined();
    expect(getBattle('constructor')).toBeUndefined();
  });
});
