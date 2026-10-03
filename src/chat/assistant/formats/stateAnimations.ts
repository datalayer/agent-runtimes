/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which of a character's animations act each state of the assistant (T-22),
 * by the names the characters of Office use — the same in clippy.js maps and
 * in Microsoft Agent files — and by the states an Agent character declares.
 *
 * @module chat/assistant/formats/stateAnimations
 */

import type { AssistantState } from '../state';
import type { AssistantCharacterData } from './types';

/** Names, in order of preference, matched without case. */
const NAMES: Record<AssistantState, string[]> = {
  idle: [],
  thinking: [
    'Thinking',
    'Think',
    'CheckingSomething',
    'Searching',
    'Search',
    'Uncertain',
  ],
  working: [
    'Processing',
    'Working',
    'Writing',
    'Write',
    'Searching',
    'Search',
    'GetTechy',
    'CheckingSomething',
    'Read',
    'Reading',
  ],
  waiting: [
    'GetAttention',
    'Alert',
    'Suggest',
    'LookDown',
    'GestureDown',
    'Acknowledge',
  ],
  greeting: ['Greeting', 'Greet', 'Show', 'Wave'],
  speaking: [
    'Explain',
    'Speak',
    'Speaking',
    'Announce',
    'GestureRight',
    'GestureLeft',
  ],
  goodbye: ['GoodBye', 'Goodbye', 'Hide', 'Wave'],
};

/** States a Microsoft Agent character declares, for each assistant state. */
const AUTHORED: Record<AssistantState, string[]> = {
  idle: ['IdlingLevel1', 'IdlingLevel2', 'IdlingLevel3'],
  thinking: [],
  working: [],
  waiting: ['Listening'],
  greeting: ['Showing'],
  speaking: ['Speaking'],
  goodbye: ['Hiding'],
};

const IDLE = /^(idle|rest ?pose)/i;

const STATES: AssistantState[] = [
  'idle',
  'thinking',
  'working',
  'waiting',
  'greeting',
  'speaking',
  'goodbye',
];

/**
 * For each state, the animation names to pick from, by what the character
 * offers: the names Office characters use, then the states an Agent file
 * declares; failing both, the idle animations; failing those, the first
 * animation. Never empty.
 */
export function stateAnimations(
  character: AssistantCharacterData,
): Record<AssistantState, string[]> {
  const names = Object.keys(character.animations);
  if (names.length === 0) {
    throw new Error(`The character ${character.name} has no animations.`);
  }
  const byLower = new Map<string, string>();
  for (const name of names) {
    if (!byLower.has(name.toLowerCase())) byLower.set(name.toLowerCase(), name);
  }
  const authored = new Map<string, string[]>();
  for (const [state, list] of Object.entries(character.authoredStates ?? {})) {
    authored.set(state.toLowerCase().replace(/\s+/g, ''), list);
  }
  const pick = (wanted: string[]): string[] => {
    const out: string[] = [];
    for (const want of wanted) {
      const name = byLower.get(want.toLowerCase());
      if (name && !out.includes(name)) out.push(name);
    }
    return out;
  };

  const idleByName = names.filter(name => IDLE.test(name));
  const idleAuthored = pick(
    AUTHORED.idle.flatMap(s => authored.get(s.toLowerCase()) ?? []),
  );
  const idle = [...new Set([...idleByName, ...idleAuthored])];
  const fallback = idle.length > 0 ? idle : [names[0]];

  const result = {} as Record<AssistantState, string[]>;
  for (const state of STATES) {
    if (state === 'idle') {
      result.idle = fallback;
      continue;
    }
    const found = [
      ...new Set([
        ...pick(NAMES[state]),
        ...pick(
          AUTHORED[state].flatMap(s => authored.get(s.toLowerCase()) ?? []),
        ),
      ]),
    ];
    result[state] = found.length > 0 ? found : fallback;
  }
  return result;
}
