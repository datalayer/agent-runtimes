/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Openers in blocks.
 *
 * A suggestion may name a `group`; the ungrouped ones come first, as one
 * block, and each group follows as a block of its own in the order it first
 * appears. The empty state draws the blocks as rows of chips under headings
 * and the composer's suggestions menu as sections — the same shape, so a
 * team's openers and the addressed member's own read the same in both.
 *
 * @module chat/display/groupSuggestions
 */

/** The least a suggestion needs to be grouped. */
export type Groupable = { group?: string };

export type SuggestionBlock<T extends Groupable> = {
  group?: string;
  items: T[];
};

/** The openers in blocks: the ungrouped first, then each group as it first appears. */
export function groupSuggestions<T extends Groupable>(
  suggestions: T[],
): SuggestionBlock<T>[] {
  const blocks: SuggestionBlock<T>[] = [];
  for (const suggestion of suggestions) {
    const block = blocks.find(entry => entry.group === suggestion.group);
    if (block) {
      block.items.push(suggestion);
    } else {
      blocks.push({ group: suggestion.group, items: [suggestion] });
    }
  }
  return blocks.sort((left, right) =>
    left.group === undefined ? -1 : right.group === undefined ? 1 : 0,
  );
}
