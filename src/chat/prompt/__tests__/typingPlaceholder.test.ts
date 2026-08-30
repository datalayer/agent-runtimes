/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The rhythm of the placeholder that types itself.
 *
 * The hook around this is a `setTimeout` and a piece of state; everything that
 * could be wrong about the animation is in the step function, which is why it
 * is a step function. What is asserted here is what a person watching would
 * notice: one character at a time, a pause at the end long enough to read, a
 * rewind that is obviously faster than the typing, and a loop that comes back
 * round rather than stopping on the last phrase.
 */

import { describe, expect, it } from 'vitest';
import {
  TYPING_START,
  nextTypingStep,
  typedText,
  type TypingState,
} from '../useTypingPlaceholder';

const PHRASES = ['Explain this', 'Plot it'];

/**
 * Every frame the animation passes through, and what each one waits.
 *
 * The first is the state it mounts in — already showing a character, so a
 * phrase starts the instant it is its turn — and carries no delay of its own.
 */
function run(
  phrases: string[],
  steps: number,
): { text: string; delayMs: number; state: TypingState }[] {
  let state = TYPING_START;
  const frames = [
    { text: typedText(state, phrases), delayMs: 0, state },
  ];
  for (let index = 0; index < steps; index += 1) {
    const step = nextTypingStep(state, phrases);
    state = step.state;
    frames.push({
      text: typedText(state, phrases),
      delayMs: step.delayMs,
      state,
    });
  }
  return frames;
}

describe('typing a phrase', () => {
  it('starts on its first character rather than on an empty box', () => {
    // The placeholder a phrase replaces is shown between phrases, and only
    // there. Beginning each one at zero put it back for a beat every time.
    expect(typedText(TYPING_START, PHRASES)).toBe('E');
  });

  it('adds one character at a time', () => {
    const frames = run(PHRASES, 'Explain this'.length - 1);
    expect(frames.map(frame => frame.text)).toEqual([
      'E',
      'Ex',
      'Exp',
      'Expl',
      'Expla',
      'Explai',
      'Explain',
      'Explain ',
      'Explain t',
      'Explain th',
      'Explain thi',
      'Explain this',
    ]);
    // At an even pace. A per-character delay that varied would read as a
    // stutter rather than as typing.
    const pace = new Set(frames.slice(1).map(frame => frame.delayMs));
    expect(pace.size).toBe(1);
  });

  it('holds the finished phrase long enough to read it', () => {
    const frames = run(PHRASES, 'Explain this'.length);
    const hold = frames[frames.length - 1];
    expect(hold.text).toBe('Explain this');
    expect(hold.state.erasing).toBe(true);
    // A pause an order of magnitude longer than a keystroke: this is the one
    // moment the suggestion is actually being offered.
    expect(hold.delayMs).toBeGreaterThan(frames[1].delayMs * 20);
  });
});

describe('rewinding', () => {
  it('takes the phrase back one character at a time, faster than it typed', () => {
    const typed = 'Explain this'.length;
    // Type it, hold it, then three characters of rewind.
    const frames = run(PHRASES, typed + 3);
    expect(frames.slice(-3).map(frame => frame.text)).toEqual([
      'Explain thi',
      'Explain th',
      'Explain t',
    ]);
    const typeSpeed = frames[1].delayMs;
    const eraseSpeed = frames[frames.length - 1].delayMs;
    // "Way faster", not marginally: the typing is the message and the erasing
    // is only the way back to the start of the next one.
    expect(eraseSpeed * 2).toBeLessThan(typeSpeed);
  });

  it('moves on to the next phrase once the box is empty', () => {
    const typed = 'Explain this'.length;
    // Type, hold, erase every character, then the beat that turns the page.
    const frames = run(PHRASES, typed + typed + 1);
    const turn = frames[frames.length - 1];
    expect(turn.state.index).toBe(1);
    // On its first character, not on another empty frame: the pause is the
    // emptied state that preceded this one, and one pause is enough.
    expect(turn.text).toBe('P');
    expect(turn.state.erasing).toBe(false);
    /*
     * The one pause where the ordinary placeholder is legible, so it is sized
     * to be read rather than merely noticed: comfortably longer than the beat
     * a finished phrase is held for is too much, but many keystrokes' worth is
     * the least that works.
     */
    expect(turn.delayMs).toBeGreaterThan(frames[1].delayMs * 10);
  });
});

describe('looping', () => {
  it('comes back to the first phrase rather than stopping on the last', () => {
    const cycle = (phrase: string) => phrase.length * 2 + 1;
    const frames = run(PHRASES, PHRASES.reduce((n, p) => n + cycle(p), 0));
    // Back where it started, having shown both.
    expect(frames[frames.length - 1].state.index).toBe(0);
    expect(frames.some(frame => frame.text === 'Explain this')).toBe(true);
    expect(frames.some(frame => frame.text === 'Plot it')).toBe(true);
  });

  it('survives a single suggestion without dividing by zero', () => {
    // One phrase is the common case for an agent with one opener, and `% 1`
    // must land back on it rather than on an index nothing answers.
    const frames = run(['Hello'], 'Hello'.length * 2 + 1);
    expect(frames[frames.length - 1].state.index).toBe(0);
    expect(frames.every(frame => frame.text === typedText(frame.state, ['Hello'])))
      .toBe(true);
  });
});

describe('what is on screen', () => {
  it('is always a prefix of the phrase being typed', () => {
    // The rule that keeps this honest: the placeholder can only ever show the
    // beginning of something a person could really have asked, never a
    // fragment spliced from two suggestions.
    for (const frame of run(PHRASES, 60)) {
      const phrase = PHRASES[frame.state.index];
      expect(phrase.startsWith(frame.text)).toBe(true);
    }
  });
});
