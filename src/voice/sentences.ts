/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An answer as it is heard (VOICE.md VO-20): read as plain words, the way
 * the balloon reads it (T-23), and cut into sentences as it is written, so
 * that the first one is said before the answer is finished.
 *
 * @module voice/sentences
 */

/**
 * The words of an answer: no Markdown signs; a code block said as *a code
 * block*, a table as *a table*, a link by its text, an image by its words.
 */
export function plainWords(markdown: string): string {
  return (
    markdown
      .replace(/```[\s\S]*?(```|$)/g, ' A code block. ')
      // A table: its rows, said once as what they are.
      .replace(/(^|\n)(\|[^\n]*\|[ \t]*(\n|$))+/g, '$1 A table. \n')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+(.*)$/gm, '$1.')
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/[*_~]+/g, '')
      .replace(/\.\s*\./g, '.')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Where a sentence ends: its stop, then a space or the end of what is written. */
const END = /[.!?…:;](?=["'»)\]]*(\s|$))/g;

/** Below this, a sentence waits for the next one to be said with it. */
const SHORTEST = 12;

/**
 * Cuts an answer into the sentences to say, as it grows.
 *
 * `feed` takes the answer as written so far (its whole text, each time) and
 * gives back the sentences now complete and not given before; `end` gives
 * what is left once the answer is finished. A sentence is complete at its
 * stop followed by a space — never at the very end of what has arrived,
 * which may be cut in the middle of a number (`3.5`).
 */
export class SentenceCutter {
  private said = 0;

  feed(written: string): string[] {
    const words = plainWords(written);
    const out: string[] = [];
    END.lastIndex = this.said;
    let match: RegExpExecArray | null;
    while ((match = END.exec(words)) !== null) {
      const stop = match.index + match[0].length;
      // At the very end, more may still come: wait.
      if (stop >= words.length) {
        break;
      }
      const sentence = words.slice(this.said, stop).trim();
      if (sentence.length >= SHORTEST) {
        out.push(sentence);
        this.said = stop;
      }
    }
    return out;
  }

  end(written: string): string[] {
    const rest = plainWords(written).slice(this.said).trim();
    this.said = plainWords(written).length;
    return rest ? [rest] : [];
  }
}
