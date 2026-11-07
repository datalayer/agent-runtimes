/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Battle Catalog.
 *
 * Scenes composed against each other: a variant, a goal, a clock, the contestants,
 * a referee decided as the variant is, an arena for a game.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { BattleSpec } from '../types/agentspecs';

export const DECK_RACE_BATTLE_0_0_1: BattleSpec = {
  id: 'deck-race',
  version: '0.0.1',
  name: 'Create a deck',
  description:
    'Two Deck Makers get the same brief at the same instant and build a deck each, drawn in the page as it grows. The first to finish wins.',
  variant: 'race',
  goal: 'Create a five-slide deck that pitches a weekly team newsletter: why it helps, what goes in it, who writes what, and a closing call to sign up.',
  clockSeconds: 180,
  contestants: [
    {
      id: 'blue',
      name: 'Blue',
      scene: '',
      app: 'deck-maker:0.0.1',
      runsIn: 'browser',
      color: 'blue',
      overrides: {},
    },
    {
      id: 'red',
      name: 'Red',
      scene: '',
      app: 'deck-maker:0.0.1',
      runsIn: 'browser',
      color: 'red',
      overrides: {
        model: 'alibaba:qwen-max',
      },
    },
  ],
  referee: {
    decidesBy: 'first_done',
    measure: '',
  },
  arena: 'deck',
  rehearsal: {
    expects: [
      'each deck has a title and at least three slides',
      'a verdict within the clock',
    ],
  },
  enabled: true,
  tags: ['example', 'race', 'decks'],
  icon: 'project',
  emoji: '🃏',
};

export const INVOICE_RACE_BATTLE_0_0_1: BattleSpec = {
  id: 'invoice-race',
  version: '0.0.1',
  name: 'The invoice race',
  description:
    'Two Sales & Accounting pairs get the same question at the same instant, on the same Odoo books. The first to list the open invoices, and what is due in total, wins.',
  variant: 'race',
  goal: 'Which customer invoices are still open, and how much is due in total?',
  clockSeconds: 120,
  contestants: [
    {
      id: 'blue',
      name: 'Blue',
      scene: 'sales-and-accounting:0.0.1',
      app: '',
      color: 'blue',
      overrides: {},
    },
    {
      id: 'red',
      name: 'Red',
      scene: 'sales-and-accounting:0.0.1',
      app: '',
      color: 'red',
      overrides: {
        model: 'alibaba:qwen-max',
      },
    },
  ],
  referee: {
    decidesBy: 'first_done',
    measure: '',
  },
  rehearsal: {
    expects: [
      'a verdict within the clock',
      "the winner's last turn lists the open invoices and a total",
    ],
  },
  enabled: true,
  tags: ['example', 'race', 'odoo', 'finance'],
  icon: 'stopwatch',
  emoji: '🏁',
};

export const PONG_BATTLE_0_0_1: BattleSpec = {
  id: 'pong',
  version: '0.0.1',
  name: 'Pong',
  description:
    "Two Players at the Pong arena, each with a paddle and the arena's tools. The arena keeps the score; the first to eleven wins.",
  variant: 'game',
  goal: 'You are playing Pong. Call `arena_watch` once: the arena then tells you where the ball is and where it arrives on your side. Each time it does, call `arena_pong_move` with that `y` at once; serve with `arena_pong_serve` when the serve is yours. First to eleven points wins.',
  clockSeconds: 180,
  contestants: [
    {
      id: 'left',
      name: 'Left',
      scene: '',
      app: 'player:0.0.1',
      runsIn: 'browser',
      color: 'blue',
      overrides: {},
    },
    {
      id: 'right',
      name: 'Right',
      scene: '',
      app: 'player:0.0.1',
      runsIn: 'browser',
      color: 'red',
      overrides: {},
    },
  ],
  referee: {
    decidesBy: 'score',
    measure: '',
  },
  arena: 'pong',
  rehearsal: {
    expects: [
      'both contestants move at least once',
      'a score when the clock ends',
    ],
  },
  enabled: true,
  tags: ['example', 'game', 'arena'],
  icon: 'play',
  emoji: '🏓',
};

export const REPORT_CHALLENGE_BATTLE_0_0_1: BattleSpec = {
  id: 'report-challenge',
  version: '0.0.1',
  name: 'The month-end report challenge',
  description:
    "Two Month-end Close agents draft last month's summary from the same Odoo books, three minutes each. A Guard scores each draft for completeness and grounding; the higher measure wins.",
  variant: 'challenge',
  goal: "Write last month's month-end summary: where the close stands, what is to book, what is still open, every figure read from the books.",
  clockSeconds: 180,
  contestants: [
    {
      id: 'blue',
      name: 'Blue',
      scene: 'month-end-close:0.0.1',
      app: '',
      color: 'blue',
      overrides: {},
    },
    {
      id: 'red',
      name: 'Red',
      scene: 'month-end-close:0.0.1',
      app: '',
      color: 'red',
      overrides: {
        model: 'alibaba:qwen-max',
      },
    },
  ],
  referee: {
    decidesBy: 'measure',
    measure: 'report-quality-guard:0.0.1',
  },
  rehearsal: {
    expects: [
      "each contestant's draft measured",
      'a verdict, or a tie on equal measures',
    ],
  },
  enabled: true,
  tags: ['example', 'challenge', 'odoo', 'finance'],
  icon: 'graph',
  emoji: '📝',
};

export const SHEET_RACE_BATTLE_0_0_1: BattleSpec = {
  id: 'sheet-race',
  version: '0.0.1',
  name: 'Create a spreadsheet',
  description:
    'Two Sheet Makers get the same brief at the same instant and fill a sheet each, drawn in the page cell by cell, totals and chart included. The first to finish wins.',
  variant: 'race',
  goal: "Create a spreadsheet of a small bakery's weekly sales: a header row, one row per day from Monday to Sunday with the number of loaves and the revenue, a totals row with formulas, and a chart of the revenue by day.",
  clockSeconds: 180,
  contestants: [
    {
      id: 'blue',
      name: 'Blue',
      scene: '',
      app: 'sheet-maker:0.0.1',
      runsIn: 'browser',
      color: 'blue',
      overrides: {},
    },
    {
      id: 'red',
      name: 'Red',
      scene: '',
      app: 'sheet-maker:0.0.1',
      runsIn: 'browser',
      color: 'red',
      overrides: {
        model: 'alibaba:qwen-max',
      },
    },
  ],
  referee: {
    decidesBy: 'first_done',
    measure: '',
  },
  arena: 'sheet',
  rehearsal: {
    expects: [
      'each sheet has a header row, seven rows and a totals row',
      'a verdict within the clock',
    ],
  },
  enabled: true,
  tags: ['example', 'race', 'cells'],
  icon: 'table',
  emoji: '🧮',
};

export const BATTLE_CATALOGUE: Record<string, BattleSpec> = {
  'deck-race': DECK_RACE_BATTLE_0_0_1,
  'invoice-race': INVOICE_RACE_BATTLE_0_0_1,
  pong: PONG_BATTLE_0_0_1,
  'report-challenge': REPORT_CHALLENGE_BATTLE_0_0_1,
  'sheet-race': SHEET_RACE_BATTLE_0_0_1,
};

/** A Battle, by `id` or `id:version`, or undefined. */
export function getBattle(ref: string): BattleSpec | undefined {
  // Own entries only: `constructor` and `toString` are not Battles.
  const own = (id: string): BattleSpec | undefined =>
    Object.prototype.hasOwnProperty.call(BATTLE_CATALOGUE, id)
      ? BATTLE_CATALOGUE[id]
      : undefined;
  const at = ref.lastIndexOf(':');
  return (
    own(ref) ??
    (at > 0 && ref.slice(at + 1).includes('.')
      ? own(ref.slice(0, at))
      : undefined)
  );
}

export function listBattles(): BattleSpec[] {
  return Object.values(BATTLE_CATALOGUE);
}
