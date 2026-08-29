/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Addressing an agent from the prompt, by typing `@`.
 *
 * The picker in the header says who the *conversation* is with. This says who
 * a single request is for, which is a different question and wants a different
 * answer: a person mid-sentence should not have to leave the sentence.
 *
 * What it inserts is a plain `@Name`, not a node of its own. The name is read
 * by the model — the agent is reachable because it is one of the parent's
 * tools, and the tool is named after it — so a mention is a *hint in the
 * prompt*, not a control channel. That means a person can type one by hand, or
 * edit one afterwards, and it still works; a bespoke node would have made both
 * of those break in ways nobody could see.
 *
 * @module chat/prompt/AgentMentionPlugin
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionList, Overlay, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  type LexicalEditor,
} from 'lexical';

/** One agent a prompt may address. */
export type MentionableAgent = {
  /** The name typed after `@`, and the name of the tool that reaches it. */
  name: string;
  /** One line about what it is for. */
  description?: string;
  emoji?: string;
};

/** The `@word` being typed, if the caret is in one. */
type MentionQuery = { text: string; rect: DOMRect | null };

/**
 * Read the `@word` immediately before the caret.
 *
 * Anchored to a word boundary so an email address or a decorator does not open
 * a menu: `@` counts only at the start of the text or after whitespace.
 */
function readMentionQuery(editor: LexicalEditor): MentionQuery | null {
  let query: MentionQuery | null = null;
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
      return;
    }
    const node = selection.anchor.getNode();
    const before = node.getTextContent().slice(0, selection.anchor.offset);
    const match = /(?:^|\s)@([\w-]*)$/.exec(before);
    if (!match) {
      return;
    }
    const domSelection = window.getSelection();
    const rect =
      domSelection && domSelection.rangeCount > 0
        ? domSelection.getRangeAt(0).getBoundingClientRect()
        : null;
    query = { text: match[1], rect };
  });
  return query;
}

export type AgentMentionPluginProps = {
  /** Everyone this prompt may address. No menu when there is nobody. */
  agents: MentionableAgent[];
};

/**
 * Offer the agents while `@` is being typed.
 */
export function AgentMentionPlugin({
  agents,
}: AgentMentionPluginProps): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const anchorRef = useRef<HTMLDivElement>(null);

  const matches = query
    ? agents.filter(agent =>
        agent.name.toLowerCase().startsWith(query.text.toLowerCase()),
      )
    : [];
  const open = matches.length > 0;

  // Kept in range as the list narrows: a highlight past the end would submit
  // nothing on Enter, which reads as the key being broken.
  useEffect(() => {
    setHighlighted(current => (current < matches.length ? current : 0));
  }, [matches.length]);

  useEffect(() => {
    return editor.registerUpdateListener(() => {
      setQuery(readMentionQuery(editor));
    });
  }, [editor]);

  /** Replace the `@partial` with the chosen name. */
  const insert = useCallback(
    (agent: MentionableAgent) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return;
        }
        const node = selection.anchor.getNode();
        const offset = selection.anchor.offset;
        const before = node.getTextContent().slice(0, offset);
        const match = /(?:^|\s)@([\w-]*)$/.exec(before);
        if (!match) {
          return;
        }
        // Only the typed fragment is replaced, so whatever preceded it —
        // including the space that made `@` a mention — survives.
        const start = offset - match[1].length - 1;
        selection.setTextNodeRange(node as never, start, node as never, offset);
        selection.insertText(`@${agent.name} `);
      });
      setQuery(null);
    },
    [editor],
  );

  // The menu owns these keys only while it is open, so Enter still submits
  // and the arrows still move the caret the rest of the time.
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const unregister = [
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        () => {
          setHighlighted(current => (current + 1) % matches.length);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        () => {
          setHighlighted(
            current => (current - 1 + matches.length) % matches.length,
          );
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        () => {
          const agent = matches[highlighted];
          if (!agent) {
            return false;
          }
          insert(agent);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          setQuery(null);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    ];
    return () => unregister.forEach(remove => remove());
  }, [editor, open, matches, highlighted, insert]);

  if (!open || !query?.rect) {
    return null;
  }

  return (
    <>
      {/* Positioned at the caret rather than at the editor: the menu belongs
          to the word being typed. */}
      <Box
        ref={anchorRef}
        sx={{
          position: 'fixed',
          left: query.rect.left,
          top: query.rect.top,
          width: 1,
          height: query.rect.height || 16,
          pointerEvents: 'none',
        }}
      />
      <Overlay
        returnFocusRef={anchorRef}
        onEscape={() => setQuery(null)}
        onClickOutside={() => setQuery(null)}
        anchorSide="outside-top"
        // The caret already has focus and must keep it: a person is still
        // typing, and the menu is a suggestion rather than a destination.
        preventFocusOnOpen
        sx={{
          position: 'fixed',
          left: query.rect.left,
          top: Math.max(8, query.rect.top - 8),
          transform: 'translateY(-100%)',
          maxHeight: 240,
          overflowY: 'auto',
          minWidth: 260,
        }}
      >
        <ActionList selectionVariant="single">
          {matches.map((agent, index) => (
            <ActionList.Item
              key={agent.name}
              active={index === highlighted}
              onSelect={() => insert(agent)}
            >
              <ActionList.LeadingVisual>
                <Text aria-hidden>{agent.emoji ?? '🤖'}</Text>
              </ActionList.LeadingVisual>
              {agent.name}
              {agent.description ? (
                <ActionList.Description variant="block">
                  {agent.description}
                </ActionList.Description>
              ) : null}
            </ActionList.Item>
          ))}
        </ActionList>
      </Overlay>
    </>
  );
}

export default AgentMentionPlugin;
