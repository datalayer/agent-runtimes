/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Markdown without markup (STUDIO D-22): what every renderer of an agent's
 * words hands Streamdown, so that no markup a model or an application writes
 * reaches the page.
 *
 * Streamdown parses the HTML written in markdown (`rehype-raw`) and then
 * sanitizes it; sanitized markup still reaches the page — an application
 * hosted on the platform's origin would draw what its model wrote. Here the
 * HTML is never parsed: each piece of it is shown as the text it is
 * (`<script>…</script>` reads as those characters), and the rest of
 * Streamdown's plugins — maths, sanitizing, hardened links — run as before.
 *
 * @module chat/messages/markdownWithoutHtml
 */

import { defaultRehypePlugins, type StreamdownProps } from 'streamdown';

type PluggableList = NonNullable<StreamdownProps['rehypePlugins']>;

/** A node of the HTML tree, as far as this plugin reads it. */
type HastNode = {
  type: string;
  value?: string;
  children?: HastNode[];
};

function htmlAsText(node: HastNode): void {
  if (!node.children) {
    return;
  }
  node.children = node.children.map(child => {
    if (child.type === 'raw') {
      return { type: 'text', value: child.value ?? '' };
    }
    htmlAsText(child);
    return child;
  });
}

/**
 * A rehype plugin: every piece of HTML written in the markdown (`raw` nodes,
 * which `remark-rehype` keeps) becomes the text it is.
 */
export function rehypeHtmlAsText() {
  return (tree: HastNode): void => htmlAsText(tree);
}

const { raw, ...withoutRaw } = defaultRehypePlugins;
if (!raw) {
  // Streamdown no longer names its raw-HTML plugin `raw`: what it parses
  // has to be read again before these plugins are trusted.
  throw new Error(
    "Streamdown's rehype plugins have no `raw`: markdownWithoutHtml cannot say what it leaves out.",
  );
}

/**
 * Streamdown's rehype plugins without `rehype-raw`, the HTML shown as text
 * first: what every Streamdown of the chat, the page layout and the cards is
 * given.
 */
export const REHYPE_PLUGINS_WITHOUT_HTML: PluggableList = [
  rehypeHtmlAsText,
  ...Object.values(withoutRaw),
];
