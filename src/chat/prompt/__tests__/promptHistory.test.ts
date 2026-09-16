/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The arrow keys over the prompt history, as a shell would answer them.
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_LOCAL_PROMPTS,
  createPromptHistory,
  edited,
  historyEntries,
  remember,
  reseed,
  step,
  type PromptHistoryState,
} from '../promptHistory';

/** Walk one way, collecting what each step shows. */
function walk(
  state: PromptHistoryState,
  direction: 'up' | 'down',
  current = '',
): { state: PromptHistoryState; shown: (string | null)[] } {
  const shown: (string | null)[] = [];
  let next = state;
  for (let i = 0; i < 6; i++) {
    const result = step(next, direction, current);
    shown.push(result ? result.text : null);
    if (!result) break;
    next = result.state;
  }
  return { state: next, shown };
}

describe('the entries', () => {
  it('are the seed, then what was sent here, oldest first', () => {
    const state = remember(remember(createPromptHistory(['a', 'b']), 'c'), 'd');
    expect(historyEntries(state)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drop blanks and immediate repeats', () => {
    let state = createPromptHistory(['  ', 'a']);
    state = remember(state, 'a');
    state = remember(state, '   ');
    state = remember(state, 'b');
    state = remember(state, 'b');
    expect(historyEntries(state)).toEqual(['a', 'b']);
  });

  it('keep at most the newest local prompts', () => {
    let state = createPromptHistory();
    for (let i = 0; i < MAX_LOCAL_PROMPTS + 5; i++) {
      state = remember(state, `prompt ${i}`);
    }
    const entries = historyEntries(state);
    expect(entries).toHaveLength(MAX_LOCAL_PROMPTS);
    expect(entries[0]).toBe('prompt 5');
  });

  it('do not count a prompt twice once the runtime reports it', () => {
    // Sent here, then seen again in the runtime's own list on a refetch.
    let state = remember(createPromptHistory(['a']), 'b');
    state = reseed(state, ['a', 'b']);
    expect(historyEntries(state)).toEqual(['a', 'b']);
  });
});

describe('walking up', () => {
  it('goes from the newest to the oldest, then stops', () => {
    const { shown } = walk(createPromptHistory(['one', 'two', 'three']), 'up');
    expect(shown).toEqual(['three', 'two', 'one', null]);
  });

  it('has nowhere to go with nothing sent', () => {
    expect(step(createPromptHistory(), 'up', 'draft')).toBeNull();
  });
});

describe('walking down', () => {
  it('returns through the newer entries to the draft', () => {
    const up = walk(createPromptHistory(['one', 'two']), 'up', 'my draft');
    const { shown } = walk(up.state, 'down');
    expect(shown).toEqual(['two', 'my draft', null]);
  });

  it('has nowhere to go from the draft', () => {
    expect(step(createPromptHistory(['one']), 'down', 'draft')).toBeNull();
  });
});

describe('the draft', () => {
  it('is what was on screen when the walk began, not later', () => {
    const first = step(createPromptHistory(['one', 'two']), 'up', 'typed')!;
    // A second step up passes the text now shown, which is not the draft.
    const second = step(first.state, 'up', 'two')!;
    const back = walk(second.state, 'down');
    expect(back.shown).toEqual(['two', 'typed', null]);
  });

  it('ends the walk when something is typed', () => {
    const first = step(createPromptHistory(['one', 'two']), 'up', 'typed')!;
    const state = edited(first.state);
    // Down has nowhere to go: the shown text is the new draft.
    expect(step(state, 'down', 'two edited')).toBeNull();
    // And up starts again from the newest entry.
    expect(step(state, 'up', 'two edited')!.text).toBe('two');
  });

  it('is forgotten once a prompt is sent', () => {
    const first = step(createPromptHistory(['one']), 'up', 'typed')!;
    const state = remember(first.state, 'one again');
    expect(step(state, 'down', '')).toBeNull();
    expect(step(state, 'up', '')!.text).toBe('one again');
  });
});

describe('reseeding', () => {
  it('leaves the state alone when the seed has not changed', () => {
    const state = step(createPromptHistory(['one']), 'up', 'typed')!.state;
    expect(reseed(state, ['one'])).toBe(state);
  });

  it('starts the walk over when the seed changes', () => {
    const state = step(createPromptHistory(['one']), 'up', 'typed')!.state;
    const next = reseed(state, ['zero', 'one']);
    expect(step(next, 'up', '')!.text).toBe('one');
  });
});
