/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Fenced code blocks drawn by a plugin, in the agent's words.
 *
 * The chat draws an agent's answer as markdown (`ChatMarkdown`), and a
 * fenced block as code. A plugin that knows better what a block of some
 * language is — a ```csv block is a spreadsheet — contributes a renderer to
 * {@link ChatCodeBlock}, and the block is drawn by it, in the message itself.
 * Read from the Reactor platform the chat is mounted in, like the renderers
 * of a tool call's display: a chat with no platform, or no renderer for the
 * language, draws the block as code, as before.
 *
 * @module chat/messages/codeBlocks
 */

import {
  isValidElement,
  useSyncExternalStore,
  type ComponentType,
  type JSX,
  type ReactNode,
} from 'react';
import { defineContributionPoint, type Contribution } from '@datalayer/reactor';
import { useOptionalReactorPlatform } from '@datalayer/reactor/react';

/** One fenced block of an answer: its info string's language, and its text. */
export type ChatCodeBlockProps = {
  /** The fence's language, lower-cased: `csv` for ```csv. Empty for a bare fence. */
  language: string;
  /** The block's text, as written between the fences. */
  code: string;
};

/** A renderer of fenced blocks, contributed to {@link ChatCodeBlock}. */
export type ChatCodeBlockContribution = {
  /** Stable id, for the registry and the graph. */
  id: string;
  /** The fence languages it draws, lower-case: `['csv', 'tsv']`. */
  languages: string[];
  /** A finer test, on the block itself; the block is drawn as code when it says no. */
  match?: (block: ChatCodeBlockProps) => boolean;
  /** What draws the block, in place of the code. */
  Component: ComponentType<ChatCodeBlockProps>;
};

/** Where plugins put their fenced-block renderers. The first that takes a block draws it. */
export const ChatCodeBlock =
  defineContributionPoint<ChatCodeBlockContribution>('chat.codeBlock');

const LANGUAGE = /(?:^|\s)language-([^\s]+)/;

/** The text of a React node: strings and numbers, joined, through elements' children. */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textOf).join('');
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textOf(node.props.children);
  }
  return '';
}

/**
 * The fenced block a `<pre>` holds, as markdown renders one: a `<code>`
 * element whose class names the language. `null` for anything else.
 */
export function codeBlockOf(children: ReactNode): ChatCodeBlockProps | null {
  const only = Array.isArray(children)
    ? children.filter(child => child !== null && child !== '\n')
    : [children];
  if (only.length !== 1 || !isValidElement(only[0])) {
    return null;
  }
  const props = only[0].props as { className?: string; children?: ReactNode };
  const language = LANGUAGE.exec(props.className ?? '')?.[1]?.toLowerCase();
  if (language === undefined) {
    return null;
  }
  return { language, code: textOf(props.children) };
}

/** The renderer that takes a block, among the contributions, in their order. */
export function codeBlockRenderer(
  contributions: readonly Contribution<ChatCodeBlockContribution>[],
  block: ChatCodeBlockProps,
): ChatCodeBlockContribution | undefined {
  return contributions
    .map(entry => entry.value)
    .find(
      value =>
        value.languages.includes(block.language) &&
        (value.match ? value.match(block) : true),
    );
}

const NO_SUBSCRIPTION = () => () => {};

/**
 * The markdown `pre` the chat hands its renderer: a block a contribution
 * takes is drawn by it, every other one exactly as the default `pre` draws
 * it (its code element, unwrapped).
 */
export function ChatCodePre({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const platform = useOptionalReactorPlatform();
  useSyncExternalStore(
    platform?.subscribe ?? NO_SUBSCRIPTION,
    () => platform?.getRevision() ?? 0,
  );
  const block = platform ? codeBlockOf(children) : null;
  const renderer = block
    ? codeBlockRenderer(platform!.getContributions(ChatCodeBlock), block)
    : undefined;
  if (block && renderer) {
    const { Component } = renderer;
    return (
      <div data-chat-code-block={renderer.id}>
        <Component language={block.language} code={block.code} />
      </div>
    );
  }
  return <>{children}</>;
}
