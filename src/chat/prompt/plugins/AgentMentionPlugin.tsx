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
 * @module chat/prompt/plugins/AgentMentionPlugin
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Icon } from '@primer/octicons-react';
import { ActionList, Overlay } from '@primer/react';
import { AiAgentIcon } from '@datalayer/icons-react';
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

import { $createMentionNode } from './MentionNode';

/** One agent a prompt may address. */
export type MentionableAgent = {
  /** The name typed after `@`, and the name of the tool that reaches it. */
  name: string;
  /** One line about what it is for. */
  description?: string;
  emoji?: string;
  /**
   * The octicon its agentspec asked for.
   *
   * Resolved by whoever builds the list — this module has no opinion about
   * where an icon name comes from — and drawn in place of the emoji, which was
   * the same picture for every agent that had not set one.
   */
  icon?: Icon;
  /**
   * Shown, but not choosable.
   *
   * The member already being addressed is the case this exists for: leaving
   * it out made the list look arbitrary — a team of two offering one name —
   * while offering it would let a person address the agent they are already
   * talking to. It stays visible, greyed, and says why.
   */
  disabled?: boolean;
  /** Why it cannot be chosen, when it cannot. */
  disabledReason?: string;
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
  /*
   * Where the arrows and Enter may land. A disabled row is in `matches` so it
   * renders, and out of here so the keyboard never selects it — the two lists
   * exist because "shown" and "choosable" stopped being the same thing.
   */
  const choosable = matches.filter(agent => !agent.disabled);

  // Kept in range as the list narrows: a highlight past the end would submit
  // nothing on Enter, which reads as the key being broken.
  useEffect(() => {
    setHighlighted(current => (current < choosable.length ? current : 0));
  }, [choosable.length]);

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
        /*
         * A node, not `@Name ` as text.
         *
         * As text a mention was several words to the editor: backspace took
         * the last one off and left an address to somebody who does not
         * exist. The trailing space stays plain, so the caret lands after the
         * chip ready for the rest of the sentence.
         */
        selection.insertNodes([
          $createMentionNode({ name: agent.name, icon: agent.icon }),
        ]);
        selection.insertText(' ');
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
          /*
            Declined when nothing can be chosen.

            The menu opens for a single agent that is already the one being
            addressed — shown greyed, because a menu that hides its only row
            looks broken — and then `% choosable.length` is `% 0`, which is
            NaN. Handing the key back leaves the caret working as it should.
          */
          if (choosable.length === 0) {
            return false;
          }
          setHighlighted(current => (current + 1) % choosable.length);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        () => {
          if (choosable.length === 0) {
            return false;
          }
          setHighlighted(
            current => (current - 1 + choosable.length) % choosable.length,
          );
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        () => {
          const agent = choosable[highlighted];
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
  }, [editor, open, choosable, highlighted, insert]);

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
        /*
         * Primer's own width prop, not an `sx` width.
         *
         * `Overlay` renders its width as a `data-width-*` attribute backed by
         * a CSS-module rule, and the default `auto` means "size to content" —
         * which an `sx` width does not reliably beat, since the two are equal
         * specificity and the module's rule wins on source order. That is why
         * the menu stayed as wide as the longest description in it. `medium`
         * is 320px.
         */
        width="large"
        sx={{
          position: 'fixed',
          left: query.rect.left,
          top: Math.max(8, query.rect.top - 8),
          transform: 'translateY(-100%)',
          maxHeight: 240,
          overflowY: 'auto',
          maxWidth: 'calc(100vw - 16px)',
        }}
      >
        {/* The width again, held from the inside. The overlay is positioned
            `fixed`, so nothing in the layout constrains it; without a bounded
            child, a long description sets the width of everything above it. */}
        <Box sx={{ width: '100%', maxWidth: 440, minWidth: 0 }}>
          <ActionList selectionVariant="single">
            {matches.map(agent => {
              const index = choosable.indexOf(agent);
              return (
                <ActionList.Item
                  key={agent.name}
                  active={index >= 0 && index === highlighted}
                  // Focusable while inert, so the reason is readable rather
                  // than merely implied by the grey.
                  aria-disabled={agent.disabled}
                  title={agent.disabledReason}
                  onSelect={() => {
                    if (!agent.disabled) {
                      insert(agent);
                    }
                  }}
                  sx={agent.disabled ? { opacity: 0.5 } : undefined}
                >
                  <ActionList.LeadingVisual>
                    {/* The spec's own icon. An emoji was the same picture
                        for every agent that had not set one, so the column
                        said nothing at all. */}
                    {agent.icon ? (
                      <agent.icon />
                    ) : (
                      <AiAgentIcon />
                    )}
                  </ActionList.LeadingVisual>
                  {agent.name}
                  {agent.description ? (
                    <ActionList.Description
                      variant="block"
                      /* Wrapped and breakable. `minWidth: 0` is the load-bearing
                       one: a grid item defaults to `min-content`, so without
                       it the description refuses to be narrower than its
                       longest unbroken run and pushes the row wide. */
                      sx={{
                        display: 'block',
                        whiteSpace: 'normal',
                        overflowWrap: 'anywhere',
                        minWidth: 0,
                      }}
                    >
                      {agent.description}
                    </ActionList.Description>
                  ) : null}
                </ActionList.Item>
              );
            })}
          </ActionList>
        </Box>
      </Overlay>
    </>
  );
}

export default AgentMentionPlugin;
