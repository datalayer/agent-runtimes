/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * When typing `@` should offer an agent.
 *
 * The rule is small and entirely about where the caret is, so it is worth
 * holding down on its own: a menu that opened on the `@` in an email address,
 * or in the middle of a word, would be in the way every time somebody wrote
 * one — and that is the kind of thing nobody reports as a bug, they just stop
 * using the feature.
 */

import { describe, expect, it } from 'vitest';

/** The pattern the plugin reads the caret's `@word` with. */
const MENTION = /(?:^|\s)@([\w-]*)$/;

/** What the menu would search for, or `null` for no menu. */
function mentionQuery(textBeforeCaret: string): string | null {
  const match = MENTION.exec(textBeforeCaret);
  return match ? match[1] : null;
}

describe('opening the agent menu', () => {
  it('opens on a bare @ at the start', () => {
    expect(mentionQuery('@')).toBe('');
  });

  it('opens on @ after a space, and narrows as you type', () => {
    expect(mentionQuery('compact this @')).toBe('');
    expect(mentionQuery('compact this @Com')).toBe('Com');
  });

  it('keeps hyphenated names typeable', () => {
    // Agent names come from specs, and those are hyphenated.
    expect(mentionQuery('ask @cell-fix')).toBe('cell-fix');
  });

  it('stays shut inside a word', () => {
    // The commonest false positive by a distance.
    expect(mentionQuery('mail me at eric@datalayer')).toBeNull();
    expect(mentionQuery('a@b')).toBeNull();
  });

  it('stays shut once the mention is finished', () => {
    // A space ends it: the name has been chosen and the sentence goes on.
    expect(mentionQuery('@Compactor ')).toBeNull();
    expect(mentionQuery('@Compactor and then')).toBeNull();
  });

  it('reads only what precedes the caret', () => {
    // The caret is mid-sentence; what comes after it is not part of the name.
    expect(mentionQuery('tell @Tut')).toBe('Tut');
  });
});

describe('matching what was typed', () => {
  const AGENTS = [
    { name: 'Compactor' },
    { name: 'CellFixer' },
    { name: 'NotebookReproducer' },
  ];

  function matches(query: string) {
    return AGENTS.filter(agent =>
      agent.name.toLowerCase().startsWith(query.toLowerCase()),
    ).map(agent => agent.name);
  }

  it('offers everyone on a bare @', () => {
    expect(matches('')).toHaveLength(3);
  });

  it('is case-insensitive, because nobody types the capital', () => {
    expect(matches('cell')).toEqual(['CellFixer']);
  });

  it('offers nothing when nothing matches, which closes the menu', () => {
    expect(matches('zzz')).toEqual([]);
  });
});
