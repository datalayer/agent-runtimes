/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An `@agent` in the prompt, as one thing.
 *
 * It used to be plain text — `@Notebook Compactor` typed straight into the
 * paragraph — which reads correctly and edits badly. A name with a space in it
 * is several words to a text editor: backspace takes off "Compactor" and
 * leaves "@Notebook", which is a mention of somebody who does not exist, and
 * arrow keys walk through the middle of it. Whatever a person does to half a
 * mention, the model still receives it as an address.
 *
 * A `DecoratorNode` makes it atomic: selected in one, moved in one, deleted in
 * one. `getTextContent` still returns `@Name`, so the string handed to the
 * agent is exactly what it was before — the change is to editing, not to the
 * message.
 *
 * @module chat/prompt/plugins/MentionNode
 */

import {
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import type { Icon } from '@primer/octicons-react';

import { MentionChip } from './MentionChip';

/** What the node needs to draw and to serialise itself. */
export type MentionPayload = {
  /** The agent's name, as typed after `@`. */
  name: string;
  /** The icon its spec asked for, resolved by whoever created the node. */
  icon?: Icon;
};

/**
 * A mention on its way through the clipboard or a saved editor state.
 *
 * The name only. `icon` is a React component, which does not survive
 * `JSON.stringify` and has no business trying to — a mention pasted into a
 * different prompt is drawn with whatever that prompt knows about the agent,
 * and the name is the part that addresses it.
 */
export type SerializedMentionNode = Spread<
  { name: string },
  SerializedLexicalNode
>;

export class MentionNode extends DecoratorNode<JSX.Element> {
  __name: string;
  __icon?: Icon;

  static getType(): string {
    return 'agent-mention';
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(
      { name: node.__name, icon: node.__icon },
      node.__key,
    );
  }

  /*
   * `payload` has a default, and that is not tidiness.
   *
   * Lexical inspects the constructor's arity when a node type is registered:
   * two required arguments and it insists on a static `importJSON`, refusing
   * to register otherwise — which surfaced as the whole view failing to load
   * rather than as a mention that did not draw. Both halves are supplied here.
   */
  constructor(payload: MentionPayload = { name: '' }, key?: NodeKey) {
    super(key);
    this.__name = payload.name;
    this.__icon = payload.icon;
  }

  static importJSON(serialized: SerializedMentionNode): MentionNode {
    return $createMentionNode({ name: serialized.name });
  }

  exportJSON(): SerializedMentionNode {
    return {
      ...super.exportJSON(),
      type: MentionNode.getType(),
      version: 1,
      name: this.__name,
    };
  }

  /**
   * What the prompt is worth as a string.
   *
   * The whole point of keeping this exact: the agent is reachable because it
   * is one of the parent's tools and the tool is named after it, so a mention
   * is a hint in the prompt rather than a control channel. A person can still
   * type `@Name` by hand and it works the same way.
   */
  getTextContent(): string {
    return `@${this.__name}`;
  }

  /** Sits in the line of text rather than on a line of its own. */
  isInline(): boolean {
    return true;
  }

  /** Selectable as a unit, which is what makes one backspace remove it. */
  isKeyboardSelectable(): boolean {
    return true;
  }

  createDOM(): HTMLElement {
    const span = document.createElement('span');
    // Baseline-aligned, so a chip does not lift the line it sits in.
    span.style.display = 'inline-flex';
    span.style.verticalAlign = 'middle';
    return span;
  }

  updateDOM(): false {
    // The chip is rendered by React; Lexical never has to patch this element.
    return false;
  }

  decorate(): JSX.Element {
    return <MentionChip name={this.__name} icon={this.__icon} />;
  }
}

export function $createMentionNode(payload: MentionPayload): MentionNode {
  return new MentionNode(payload);
}

export function $isMentionNode(
  node: LexicalNode | null | undefined,
): node is MentionNode {
  return node instanceof MentionNode;
}

export default MentionNode;
