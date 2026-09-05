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

import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Icon } from '@primer/octicons-react';
import { ActionList, Overlay } from '@primer/react';
import { AiAgentIcon } from '@datalayer/icons-react';
import { Box } from '@datalayer/primer-addons';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
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

/**
 * How wide the menu is, and how tall it may grow.
 *
 * Named because the position is computed from them: the menu is lifted its own
 * height to sit above the caret, and held back from the right edge by its own
 * width. A number that only lived in the style would put it off screen the
 * moment either changed.
 */
const MENU_WIDTH = 440;
const MENU_MAX_HEIGHT = 240;

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
  /* Set while the document change that inserted a mention is being applied. */
  const justInserted = useRef(false);

  /*
   * Choosable rows first, then the greyed ones.
   *
   * The highlight — where Enter lands — starts on the first row a person can
   * pick. The one already being addressed is listed too, greyed, and it used
   * to come first because the team lists its front door first: so the menu
   * opened with its second row lit, which read as the wrong row preselected.
   * A stable sort keeps the team's own order within each group.
   */
  const matches = query
    ? agents
        .filter(agent =>
          agent.name.toLowerCase().startsWith(query.text.toLowerCase()),
        )
        .sort(
          (left, right) => Number(!!left.disabled) - Number(!!right.disabled),
        )
    : [];
  const open = matches.length > 0;
  /*
   * Where the arrows and Enter may land. A disabled row is in `matches` so it
   * renders, and out of here so the keyboard never selects it — the two lists
   * exist because "shown" and "choosable" stopped being the same thing.
   */
  const choosable = matches.filter(agent => !agent.disabled);

  /*
   * Back to the first choosable row whenever the typing changes.
   *
   * Kept in range as the list narrows — a highlight past the end would submit
   * nothing on Enter, which reads as the key being broken — and reset
   * outright as the `@word` changes, so each new filter offers its best match
   * rather than whichever position the last one happened to leave behind.
   */
  useEffect(() => {
    setHighlighted(0);
  }, [query?.text]);

  useEffect(() => {
    setHighlighted(current => (current < choosable.length ? current : 0));
  }, [choosable.length]);

  useEffect(() => {
    return editor.registerUpdateListener(() => {
      const next = readMentionQuery(editor);
      if (justInserted.current) {
        /*
         * Every update belonging to the insertion, not just the first.
         *
         * One `editor.update()` raises several of them — the range emptied,
         * the node placed, the trailing space — and they all run
         * synchronously. Clearing the flag on the first let a later one
         * reopen the menu against the chip just written, a line higher, which
         * is what a reader saw. Clearing it on "the caret asks nothing" was
         * the same bet in a different disguise: it assumed one of those
         * intermediate states would read as settled, and one did not.
         *
         * The flag is lifted on the next macrotask instead, which is after
         * every synchronous update from this edit and before anything a
         * person can type.
         */
        setQuery(null);
        return;
      }
      setQuery(next);
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
         * Deleted first, then inserted into the collapsed caret.
         *
         * `insertNodes` over a *range* decides for itself how to reconcile
         * what it is replacing, and for a decorator it reconciled by splitting
         * the paragraph — so the chip landed and the caret went to a new line.
         * Emptying the range first leaves a collapsed selection inside a text
         * node, which is the one state an inline insert has no choice about.
         */
        selection.insertText('');

        /*
         * A node, not `@Name ` as text.
         *
         * As text a mention was several words to the editor: backspace took
         * the last one off and left an address to somebody who does not
         * exist. The trailing space stays plain, so the caret lands after the
         * chip ready for the rest of the sentence.
         */
        const chip = $createMentionNode({ name: agent.name, icon: agent.icon });
        selection.insertNodes([chip]);
        // Explicitly after the chip. `insertNodes` leaves the selection where
        // it sees fit, and typing must continue on this line, beside it.
        chip.selectNext();
        const after = $getSelection();
        if ($isRangeSelection(after)) {
          after.insertText(' ');
        }
      });
      justInserted.current = true;
      setQuery(null);
      window.setTimeout(() => {
        justInserted.current = false;
      }, 0);
    },
    [editor],
  );

  /*
   * The menu owns these keys only while it is open, so Enter still submits and
   * the arrows still move the caret the rest of the time.
   *
   * At `CRITICAL`, above the `HIGH` the submit handler uses. Lexical runs the
   * higher priority first and stops at the first handler that returns true —
   * so registering these `LOW` meant Enter reached submit before the menu ever
   * saw it, and choosing an agent sent the half-written message instead.
   *
   * Being above submit is safe precisely because this effect only runs while
   * the menu is open, and each handler declines when it has nothing to do.
   */
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const unregister = [
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event: KeyboardEvent) => {
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
          // The browser's default too: the arrow would otherwise move the
          // caret off the `@word`, and the menu it was steering would close.
          event.preventDefault();
          setHighlighted(current => (current + 1) % choosable.length);
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event: KeyboardEvent) => {
          if (choosable.length === 0) {
            return false;
          }
          event.preventDefault();
          setHighlighted(
            current => (current - 1 + choosable.length) % choosable.length,
          );
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event: KeyboardEvent | null) => {
          const agent = choosable[highlighted];
          if (!agent) {
            return false;
          }
          /*
           * The browser's default, as well as Lexical's.
           *
           * Returning `true` stops the command reaching the plain-text
           * plugin, but the keypress is still a keypress in a
           * `contenteditable` — so the browser inserted its own line break
           * after the chip. Choosing with the mouse never did, which is
           * exactly the shape of a missing `preventDefault`.
           */
          event?.preventDefault();
          insert(agent);
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          setQuery(null);
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
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
        returnFocusRef={anchorRef as React.RefObject<HTMLElement>}
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
        /*
         * Positioned through `style`, not `sx`.
         *
         * `Overlay` writes `left`, `right`, `top`, `bottom` and `position` as
         * *inline* styles taken from its own props, and spreads a `style` prop
         * last. An `sx` rule is a class, and a class never beats an inline
         * style — so every position written there was discarded and the menu
         * rendered wherever the default left it: pinned to the left edge of
         * the window, a long way from the `@` it belongs to.
         *
         * Anchored to the caret: `left` at the character, and its bottom edge
         * just above the line, so it sits over what came before rather than
         * over the word being typed. Clamped so a caret near the right edge
         * does not push it off screen.
         */
        style={{
          position: 'fixed',
          left: Math.max(
            8,
            Math.min(query.rect.left, window.innerWidth - MENU_WIDTH - 8),
          ),
          /*
            The bottom edge, pinned above the caret — not the top edge pulled
            up by a transform.

            `top` plus `translateY(-100%)` is a position that depends on the
            element's own height, and the height is only known once its rows
            have been laid out. So it painted once at the caret's line and
            again where it belonged, which reads as the menu falling into
            place.

            `bottom` needs no such measurement: the browser resolves it
            against the viewport, and the first paint is the final one.
          */
          ...(query.rect.top >= MENU_MAX_HEIGHT + 16
            ? { bottom: window.innerHeight - query.rect.top + 6, top: 'auto' }
            : // No room above — a caret near the top of the window — so it
              // hangs below the line instead of being pushed off screen.
              {
                top: query.rect.top + (query.rect.height || 16) + 6,
                bottom: 'auto',
              }),
          right: 'auto',
        }}
        sx={{
          maxHeight: MENU_MAX_HEIGHT,
          overflowY: 'auto',
          maxWidth: 'calc(100vw - 16px)',
        }}
      >
        {/* The width again, held from the inside. The overlay is positioned
            `fixed`, so nothing in the layout constrains it; without a bounded
            child, a long description sets the width of everything above it. */}
        <Box sx={{ width: '100%', maxWidth: MENU_WIDTH, minWidth: 0 }}>
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
                  /*
                    The highlight, drawn here rather than asked for.

                    `active` is Primer's "the keyboard is here" state and this
                    list renders it faintly; `selected` draws a tick in the
                    leading-visual slot, which these rows already fill with the
                    agent's own icon — so neither showed. The row Enter would
                    take looked exactly like the rest, which is the one thing a
                    menu driven by arrow keys must not do.

                    A background says it plainly, and says it the same way
                    whatever variant the list is in.
                  */
                  sx={{
                    ...(index >= 0 && index === highlighted
                      ? { bg: 'accent.subtle' }
                      : null),
                    ...(agent.disabled ? { opacity: 0.5 } : null),
                  }}
                >
                  <ActionList.LeadingVisual>
                    {/* The spec's own icon. An emoji was the same picture
                        for every agent that had not set one, so the column
                        said nothing at all. */}
                    {agent.icon ? <agent.icon /> : <AiAgentIcon />}
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
