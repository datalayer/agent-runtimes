/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Captions always (VO-65): the sentence being said is marked in the
 * open conversation, not by colour alone. The answer that holds it is marked
 * `aria-current` and `data-voice-saying` with a bar beside it; the sentence
 * itself is underlined in place through the CSS Custom Highlight API, which
 * draws over the text without touching the DOM React owns. A browser without
 * that API keeps the answer's mark.
 *
 * @module voice/captions
 */

import { useEffect, type RefObject } from 'react';
import { plainWords } from './sentences';
import { answerText } from './useSpokenAnswers';

/** The name the sentence's highlight is registered under. */
export const SAID_HIGHLIGHT = 'voice-said';

/** What the sentence being said looks like: underlined, thick, offset. */
const SAID_STYLE = `::highlight(${SAID_HIGHLIGHT}) {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
  background-color: var(--bgColor-accent-muted, rgba(84, 174, 255, 0.2));
}`;

/** Words compared as words: spaces collapsed, case kept. */
function squeezed(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The id of the answer a sentence is being said from: the newest answer of
 * the agent whose words hold it, or none.
 */
export function saidMessageId(
  items: readonly unknown[],
  sentence: string | undefined,
): string | undefined {
  const said = squeezed(sentence ?? '');
  if (!said) {
    return undefined;
  }
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const text = answerText(items[index]);
    if (text !== undefined && squeezed(plainWords(text)).includes(said)) {
      const id = (items[index] as { id?: unknown }).id;
      return typeof id === 'string' ? id : undefined;
    }
  }
  return undefined;
}

/**
 * Where a sentence is in what an element shows, as a `Range` over its text
 * — across the bold, the links and the line breaks it is drawn with — or
 * none when the element does not show it as said (a code block said as *a
 * code block*).
 */
export function sentenceRange(root: Node, sentence: string): Range | undefined {
  const said = squeezed(sentence);
  if (!said || !root.ownerDocument) {
    return undefined;
  }
  const document = root.ownerDocument;
  const walker = document.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  // The text, spaces collapsed, and where each of its characters came from.
  let text = '';
  const from: Array<{ node: Text; offset: number }> = [];
  let space = true;
  for (
    let node = walker.nextNode() as Text | null;
    node;
    node = walker.nextNode() as Text | null
  ) {
    const value = node.nodeValue ?? '';
    for (let offset = 0; offset < value.length; offset += 1) {
      const char = value[offset];
      if (/\s/.test(char)) {
        if (space) {
          continue;
        }
        space = true;
        text += ' ';
      } else {
        space = false;
        text += char;
      }
      from.push({ node, offset });
    }
  }
  const start = text.indexOf(said);
  if (start < 0) {
    return undefined;
  }
  const first = from[start];
  const last = from[start + said.length - 1];
  const range = document.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  return range;
}

interface HighlightRegistry {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
}

function registry(): HighlightRegistry | undefined {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  return css?.highlights;
}

function highlightOf(range: Range): unknown {
  const Highlight = (
    globalThis as { Highlight?: new (...ranges: Range[]) => unknown }
  ).Highlight;
  return Highlight ? new Highlight(range) : undefined;
}

let styled = false;

function ensureStyle(document: Document): void {
  if (styled || document.getElementById('datalayer-voice-said')) {
    styled = true;
    return;
  }
  const style = document.createElement('style');
  style.id = 'datalayer-voice-said';
  style.textContent = SAID_STYLE;
  document.head.appendChild(style);
  styled = true;
}

/**
 * Underlines `sentence` in the answer marked `data-voice-saying` under
 * `root`, for as long as it is said; the mark goes when it ends. Drawn
 * again whenever `version` changes (the answer still being written).
 */
export function useSaidSentence(
  root: RefObject<HTMLElement | null>,
  sentence: string | undefined,
  version: unknown,
): void {
  useEffect(() => {
    const highlights = registry();
    const element = root.current?.querySelector('[data-voice-saying]');
    if (!highlights || !element || !sentence) {
      return;
    }
    const underline = (): boolean => {
      const range = sentenceRange(element, sentence);
      const highlight = range ? highlightOf(range) : undefined;
      if (!highlight) {
        return false;
      }
      ensureStyle(element.ownerDocument);
      highlights.set(SAID_HIGHLIGHT, highlight);
      return true;
    };
    // The answer's Markdown may be drawn after this effect: wait for it.
    let watcher: MutationObserver | undefined;
    if (!underline() && typeof MutationObserver !== 'undefined') {
      watcher = new MutationObserver(() => {
        if (underline()) {
          watcher?.disconnect();
        }
      });
      watcher.observe(element, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    return () => {
      watcher?.disconnect();
      highlights.delete(SAID_HIGHLIGHT);
    };
  }, [root, sentence, version]);
}
