/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * InputPromptLexical — Lexical editor input variant for InputPrompt.
 *
 * Uses a minimal Lexical setup (plain text only) as an alternative
 * to the plain textarea.  Enter-to-submit and Shift+Enter for newline
 * are handled via a custom Lexical plugin, and the arrow keys walk the
 * prompt history from the text's edges via another.
 *
 * IMPORTANT: This file imports from the light `@lexical/*` packages only — it does NOT
 * import from `@datalayer/jupyter-lexical` to avoid pulling in heavy
 * Lumino / Jupyter dependencies (see separated-hook-files pattern in CLAUDE.md).
 *
 * @module chat/prompt/InputPromptLexical
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  $getRoot,
  $getSelection,
  $createParagraphNode,
  $createTextNode,
  $isElementNode,
  $isRangeSelection,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  defineExtension,
  type LexicalNode,
} from 'lexical';
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { HistoryExtension } from '@lexical/history';
import { PlainTextExtension } from '@lexical/plain-text';

import { MentionNode } from './plugins/MentionNode';
import { Box } from '@datalayer/primer-addons';
import {
  AgentMentionPlugin,
  type MentionableAgent,
} from './plugins/AgentMentionPlugin';
import { CommandPlugin, PROMPT_COMMANDS } from './plugins/CommandPlugin';
import type { HistoryDirection } from './promptHistory';

// ---- Lexical extension (plain-text only) ---------------------------------

// Module scope on purpose: the composer rebuilds the editor whenever this
// reference changes.
const EDITOR_EXTENSION = defineExtension({
  name: '@datalayer/agent-runtimes/InputPrompt',
  namespace: 'InputPromptLexical',
  theme: {
    paragraph: 'input-prompt-lexical-p',
  },
  // The `@agent` chip. A node the editor does not know about is dropped on
  // insert, silently — the mention would simply never appear.
  nodes: () => [MentionNode],
  dependencies: [PlainTextExtension, HistoryExtension],
  onError(error: Error) {
    console.error('[InputPromptLexical]', error);
  },
});

// ---- Enter-to-submit plugin ---------------------------------------------

function EnterSubmitPlugin({
  onSubmit,
  disabled,
  readOnly,
}: {
  onSubmit?: () => void;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        if (event?.shiftKey || disabled || readOnly) return false;
        event?.preventDefault();
        onSubmit?.();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onSubmit, disabled, readOnly]);

  return null;
}

// ---- History plugin: the arrow keys over what was sent ------------------

/**
 * The text before and after the caret, over the whole editor — or `null`
 * when there is no caret to speak of: nothing focused, or a range selected.
 *
 * Lines decide whether an arrow key walks the history — up from the first
 * line, down from the last — and a plain-text editor keeps its lines as
 * line-break nodes inside paragraphs, and as paragraphs, so the text is
 * gathered by walking the tree rather than read off one node.
 */
function $textAroundCaret(): { before: string; after: string } | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }
  const { anchor } = selection;
  const anchorNode = anchor.getNode();
  let before = '';
  let after = '';
  let passed = false;
  const take = (text: string) => {
    if (passed) {
      after += text;
    } else {
      before += text;
    }
  };
  const visit = (node: LexicalNode) => {
    if (node.is(anchorNode)) {
      if ($isElementNode(node)) {
        // The caret sits between children, and the offset counts them.
        node.getChildren().forEach((child, index) => {
          if (index === anchor.offset) {
            passed = true;
          }
          take(child.getTextContent());
        });
      } else {
        const text = node.getTextContent();
        before += text.slice(0, anchor.offset);
        after += text.slice(anchor.offset);
      }
      passed = true;
      return;
    }
    if ($isElementNode(node)) {
      node.getChildren().forEach(visit);
      return;
    }
    take(node.getTextContent());
  };
  $getRoot()
    .getChildren()
    .forEach((paragraph, index) => {
      if (index > 0) {
        take('\n');
      }
      visit(paragraph);
    });
  return passed ? { before, after } : null;
}

/**
 * Up from the first line and down from the last walk the prompt history;
 * anywhere else the keys move the caret, as in any editor.
 *
 * Registered at a low priority, and mounted after the `@` and `/` menus, so
 * that a menu which is open takes the arrow keys first — it answers them
 * and this never hears them.
 */
function HistoryPlugin({
  onHistory,
  disabled,
  readOnly,
}: {
  onHistory?: (direction: HistoryDirection) => boolean;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!onHistory) {
      return undefined;
    }
    const handle =
      (direction: HistoryDirection) => (event: KeyboardEvent | null) => {
        if (disabled || readOnly) {
          return false;
        }
        // A modifier means something else is being asked for.
        if (
          event &&
          (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey)
        ) {
          return false;
        }
        let atEdge = false;
        editor.getEditorState().read(() => {
          const around = $textAroundCaret();
          if (!around) {
            return;
          }
          atEdge =
            direction === 'up'
              ? !around.before.includes('\n')
              : !around.after.includes('\n');
        });
        if (!atEdge || !onHistory(direction)) {
          return false;
        }
        event?.preventDefault();
        return true;
      };
    const unregisterUp = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      handle('up'),
      COMMAND_PRIORITY_LOW,
    );
    const unregisterDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      handle('down'),
      COMMAND_PRIORITY_LOW,
    );
    return () => {
      unregisterUp();
      unregisterDown();
    };
  }, [editor, onHistory, disabled, readOnly]);

  return null;
}

// ---- Sync plugin (controlled component bridge) --------------------------

function SyncPlugin({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const lastExternalValue = useRef(value);

  // Push external value → editor (only when value changes from outside)
  useEffect(() => {
    if (value === lastExternalValue.current) return;
    lastExternalValue.current = value;

    editor.update(() => {
      const root = $getRoot();
      const currentText = root.getTextContent();
      if (currentText === value) return;
      root.clear();
      const p = $createParagraphNode();
      if (value) {
        p.append($createTextNode(value));
      }
      root.append(p);
      // The caret after what was put there — a history entry, a suggestion —
      // where typing on from it is expected to continue.
      p.selectEnd();
    });
  }, [editor, value]);

  // Editor → external value
  const handleChange = useCallback(() => {
    editor.getEditorState().read(() => {
      const text = $getRoot().getTextContent();
      lastExternalValue.current = text;
      onChange(text);
    });
  }, [editor, onChange]);

  return <OnChangePlugin onChange={handleChange} />;
}

// ---- Auto-focus plugin --------------------------------------------------

function AutoFocusPlugin({
  autoFocus,
  focusSignal,
}: {
  autoFocus?: boolean;
  /*
   * Bumped to ask for the caret back — when a turn ends, say.
   *
   * A number rather than a callback, because what is worth repeating is the
   * whole routine below and not just the `editor.focus()` at the centre of
   * it: the same retries, and the same refusal to take focus from somebody
   * who is typing elsewhere, apply whether the prompt is claiming the caret
   * on mount or reclaiming it once the agent has finished.
   */
  focusSignal?: number;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!autoFocus && !focusSignal) {
      return undefined;
    }
    /*
     * Asked for repeatedly, briefly, rather than once after a guessed delay.
     *
     * One `setTimeout(100)` assumed the editor was mounted and focusable by
     * then. In a workspace that arrives through a lazy chunk it often is not:
     * the notebook mounts alongside and takes focus, or the contenteditable
     * is not in the document yet, and the single attempt lands on nothing and
     * is never retried — which is exactly the prompt that would not focus.
     *
     * So: try immediately, then keep trying for a second, and stop the moment
     * it works or the moment the person clicks somewhere themselves. Giving
     * up matters as much as retrying — stealing focus back from someone who
     * has started typing in a cell would be worse than never taking it.
     */
    let cancelled = false;
    const deadline = Date.now() + 1000;

    const focused = () => {
      const root = editor.getRootElement();
      return !!root && document.activeElement === root;
    };

    const attempt = () => {
      if (cancelled || focused()) {
        return;
      }
      const active = document.activeElement;
      const stolen =
        active &&
        active !== document.body &&
        !editor.getRootElement()?.contains(active);
      if (stolen) {
        return;
      }
      editor.focus();
      if (!focused() && Date.now() < deadline) {
        timer = window.setTimeout(attempt, 50);
      }
    };

    let timer = window.setTimeout(attempt, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [editor, autoFocus, focusSignal]);

  return null;
}

function ReadOnlyPlugin({ readOnly }: { readOnly?: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  return null;
}

// ---- Public component ---------------------------------------------------

export interface InputPromptLexicalProps {
  /** Current input value */
  value: string;
  /** Callback when the value changes */
  onChange: (value: string) => void;
  /** Placeholder for the editor */
  placeholder?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether the input is read-only */
  readOnly?: boolean;
  /** Callback when the user presses Enter (without Shift) */
  onSubmit?: () => void;
  /**
   * Up or down through the prompt history, asked when the caret is on the
   * first or last line. Answers whether it had somewhere to go; when it did
   * not, the key moves the caret as it normally would.
   */
  onHistory?: (direction: HistoryDirection) => boolean;
  /** Auto-focus the editor on mount */
  autoFocus?: boolean;
  /** Bumped by the parent to ask for the caret back — see `AutoFocusPlugin`. */
  focusSignal?: number;
  /**
   * Agents this prompt may address by typing `@`.
   *
   * Empty or absent means no menu: a workspace with one agent has nobody to
   * choose between, and a menu on every `@` would be in the way.
   */
  mentionableAgents?: MentionableAgent[];
}

export function InputPromptLexical({
  value,
  onChange,
  placeholder = 'Ask anything…',
  disabled = false,
  readOnly = false,
  onSubmit,
  onHistory,
  autoFocus = false,
  focusSignal,
  mentionableAgents,
}: InputPromptLexicalProps) {
  return (
    <Box
      sx={{
        /*
          The placeholder is positioned against this box.

          It is `position: absolute` and this was `static`, so it resolved
          against whatever ancestor happened to be positioned — which put
          "Type a message..." up in the header, nowhere near the box it
          describes. A containing block is the whole fix.
        */
        position: 'relative',
        px: 2,
        // A little more above than the 2px it had: the text sat hard against
        // the edge of the box, which reads as clipped rather than as tight.
        // Still less than below, where the footer's own padding follows.
        pt: '6px',
        pb: 1,
        /*
         * Greyed while it cannot be typed in.
         *
         * `contenteditable=false` stops the caret and nothing else — the text
         * kept the same weight and colour as a live prompt, so a person had to
         * try typing to discover the box was inert. The colour is set on the
         * container and inherited, because the editable element deliberately
         * declares no colour of its own.
         */
        color: disabled || readOnly ? 'fg.subtle' : undefined,
        cursor: disabled || readOnly ? 'not-allowed' : undefined,
        '& .input-prompt-lexical-p': {
          margin: 0,
        },
      }}
    >
      <LexicalExtensionComposer
        extension={EDITOR_EXTENSION}
        contentEditable={null}
      >
        <ContentEditable
          placeholder={
            <Box
              sx={{
                position: 'absolute',
                /*
                  Level with the first line of typing.

                  Relative to the box above, which establishes the containing
                  block. The editor's own `padding: 2px 0` sits inside this
                  box's `pt: 2px`, so the caret's first line starts 4px down —
                  matching it here is what stops the placeholder floating
                  above the text it stands in for.
                */
                top: '8px',
                left: '8px',
                color: 'fg.subtle',
                fontSize: 1,
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            >
              {placeholder}
            </Box>
          }
          aria-placeholder={placeholder}
          className="input-prompt-lexical-content"
          aria-label="Message input"
          style={{
            outline: 'none',
            minHeight: 32,
            maxHeight: 120,
            overflowY: 'auto',
            fontSize: 14,
            lineHeight: '1.5',
            padding: '2px 0',
          }}
        />
        <SyncPlugin value={value} onChange={onChange} />
        <ReadOnlyPlugin readOnly={readOnly || disabled} />
        <EnterSubmitPlugin
          onSubmit={onSubmit}
          disabled={disabled}
          readOnly={readOnly}
        />
        <AutoFocusPlugin autoFocus={autoFocus} focusSignal={focusSignal} />
        {/* `/` for commands, beside `@` for agents. Always mounted: the list
            is fixed, so unlike the mentions there is no host that might have
            nothing to offer. */}
        <CommandPlugin commands={PROMPT_COMMANDS} />
        {mentionableAgents?.length ? (
          <AgentMentionPlugin agents={mentionableAgents} />
        ) : null}
        {/* Last, so the menus above answer the arrow keys first while open. */}
        <HistoryPlugin
          onHistory={onHistory}
          disabled={disabled}
          readOnly={readOnly}
        />
      </LexicalExtensionComposer>
    </Box>
  );
}

export default InputPromptLexical;
