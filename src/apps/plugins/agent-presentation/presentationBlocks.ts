/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a paragraph of a presentation is, as agentspecs says it
 * (`presentation`, one Markdown document): a paragraph holding only links is
 * its actions, the link in bold the main one; a paragraph wholly in emphasis
 * is a note; any other is a paragraph. Read off the paragraph's node as the
 * Markdown renderer hands it over. Pure.
 *
 * @module apps/plugins/agent-presentation/presentationBlocks
 */

/** A node of the rendered Markdown's tree, as far as this reads it. */
export type MarkdownNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: MarkdownNode[];
};

/** A link of an actions paragraph. */
export type PresentationAction = {
  label: string;
  href: string;
  /** Written in bold: the main one, a button. */
  primary: boolean;
};

const said = (node: MarkdownNode): string =>
  node.type === 'text'
    ? (node.value ?? '')
    : (node.children ?? []).map(said).join('');

/** A node's children that say something: no whitespace between them, no line break. */
const parts = (node: MarkdownNode | undefined): MarkdownNode[] =>
  (node?.children ?? []).filter(
    child =>
      !(child.type === 'text' && !(child.value ?? '').trim()) &&
      child.tagName !== 'br',
  );

const linkOf = (
  node: MarkdownNode,
  primary: boolean,
): PresentationAction | undefined => {
  const href = node.properties?.href;
  return node.tagName === 'a' && typeof href === 'string' && href
    ? { label: said(node).trim(), href, primary }
    : undefined;
};

/** The actions of a paragraph that holds only links; none for any other paragraph. */
export function actionsOf(
  paragraph: MarkdownNode | undefined,
): PresentationAction[] {
  const children = parts(paragraph);
  const actions: PresentationAction[] = [];
  for (const child of children) {
    const inner = child.tagName === 'strong' ? parts(child) : [];
    const action =
      child.tagName === 'strong'
        ? inner.length === 1
          ? linkOf(inner[0], true)
          : undefined
        : linkOf(child, false);
    if (!action) {
      return [];
    }
    actions.push(action);
  }
  return actions;
}

/** Whether a paragraph is wholly in emphasis: a note. */
export function isNote(paragraph: MarkdownNode | undefined): boolean {
  const children = parts(paragraph);
  return children.length === 1 && children[0].tagName === 'em';
}

/**
 * A link to an address of the site that shows the presentation (it starts
 * with `/`, as agentspecs says): navigated to in the page.
 */
export const isSiteLink = (href: string): boolean =>
  href.startsWith('/') && !href.startsWith('//');
