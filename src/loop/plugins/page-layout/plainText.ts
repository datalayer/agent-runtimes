/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2022-2026 Datalayer, Inc.
 *
 * Datalayer License
 */

/**
 * Markdown, read as plain words.
 *
 * The turn panel shows the reply as text on purpose — the transcript is where
 * it is rendered — but the markup an agent writes for the transcript reads as
 * noise in a pill: `**South is the outlier**` should say South is the outlier.
 * This takes the marks off and leaves the words, line by line, so what the
 * panel shows is what the transcript says, minus the typography.
 *
 * @module loop/plugins/page-layout/plainText
 */

/** Strips the inline and line-level markdown marks that only add noise. */
export function flattenMarkdown(text: string): string {
  return (
    text
      // Fenced code keeps its content; the fences go.
      .replace(/^```[^\n]*\n?/gm, '')
      // Headings become their words.
      .replace(/^#{1,6}\s+/gm, '')
      // Block quotes lose their bar.
      .replace(/^>\s?/gm, '')
      // Bold and italic, either syntax, matched without spanning lines.
      .replace(/(\*\*|__)([^\n]+?)\1/g, '$2')
      .replace(/(^|[^\w*])\*([^\s*][^\n*]*?)\*(?!\w)/g, '$1$2')
      .replace(/(^|[^\w_])_([^\s_][^\n_]*?)_(?!\w)/g, '$1$2')
      // Inline code keeps its text.
      .replace(/`([^`\n]+)`/g, '$1')
      // Links keep their words, not their targets.
      .replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, '$1')
  );
}
