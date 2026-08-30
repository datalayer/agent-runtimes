/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Registering the mention node.
 *
 * Lexical inspects a node class before it will register the type, and a class
 * it rejects does not fail quietly — the editor throws on creation and the
 * whole view that owns it fails to load, which is how this was found. Both of
 * its requirements are checked here because both were missed at once: the
 * constructor's arity, and the serialization that arity demands.
 *
 * Through a real headless editor rather than by constructing nodes directly:
 * a Lexical node cannot be built outside an editor's update, and a test that
 * mocked its way past that would have proved nothing about registration.
 */

import { createEditor } from 'lexical';
import { describe, expect, it } from 'vitest';

import { $createMentionNode, MentionNode } from '../MentionNode';

/** An editor that has been asked to register the node, as the prompt does. */
function headlessEditor() {
  return createEditor({
    namespace: 'MentionNodeTest',
    nodes: [MentionNode],
    onError(error: Error) {
      throw error;
    },
  });
}

describe('the node Lexical is asked to register', () => {
  it('is accepted by an editor', () => {
    // The failure this guards against was thrown here, at registration, and
    // took the view down with it rather than the mention.
    expect(() => headlessEditor()).not.toThrow();
  });

  it('can be constructed with no arguments', () => {
    // Two required arguments and Lexical refuses the type outright.
    expect(MentionNode.length).toBe(0);
  });

  it('round-trips through JSON', () => {
    const editor = headlessEditor();
    editor.update(
      () => {
        const json = $createMentionNode({ name: 'Notebook Compactor' }).exportJSON();
        expect(json.name).toBe('Notebook Compactor');
        expect(json.type).toBe('agent-mention');
        expect(MentionNode.importJSON(json).getTextContent()).toBe(
          '@Notebook Compactor',
        );
        // A React component does not survive `JSON.stringify`, and the name is
        // the part that addresses the agent.
        expect(Object.keys(json)).not.toContain('icon');
      },
      { discrete: true },
    );
  });
});
