/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an assistant's markdown needs before a renderer sees it.
 *
 * Shared by every surface that renders a reply — the transcript and the page
 * layout's turn panel — so a table that renders in one renders in the other.
 *
 * @module chat/messages/assistantMarkdown
 */

/**
 * Expand a single-line markdown table (rows joined with `||`) into one row
 * per line so a markdown renderer can produce a real HTML table. Idempotent:
 * any pre-existing `|\n|` boundaries are unaffected.
 */
export function expandCompactMarkdownTableBody(body: string): string {
  if (!body) return body;
  if (!/\|\s*[-:| ]{3,}\|/.test(body)) return body;
  if (!body.includes('||')) return body;
  return body.replace(/\|\|/g, '|\n|');
}

/**
 * Pre-process assistant text for Streamdown:
 *  - Unwrap ```markdown / ```md fenced blocks so tables render as HTML
 *    instead of as a code block.
 *  - Inside any fenced block (or top-level body), expand compact one-line
 *    markdown tables.
 */
export function normalizeAssistantMarkdown(text: string): string {
  if (!text) return text;

  // Unwrap explicit ```markdown / ```md fences and expand compact tables.
  let out = text.replace(
    /```(markdown|md)\s*\n([\s\S]*?)```/gi,
    (_match, _lang, body: string) => {
      const expanded = expandCompactMarkdownTableBody(body.trim());
      return `\n\n${expanded}\n\n`;
    },
  );

  // Also expand compact tables inside other fenced blocks that happen to
  // carry a markdown table (e.g. bare ``` fences).
  out = out.replace(
    /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g,
    (match, lang: string, body: string) => {
      const expanded = expandCompactMarkdownTableBody(body);
      if (expanded === body) return match;
      // If we expanded an unlabeled fence containing a real markdown table,
      // unwrap it so it renders as a table.
      if (!lang || /^(text|plain)$/i.test(lang)) {
        return `\n\n${expanded.trim()}\n\n`;
      }
      return `\`\`\`${lang}\n${expanded}\`\`\``;
    },
  );

  return out;
}
