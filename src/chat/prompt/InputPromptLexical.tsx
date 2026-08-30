/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * InputPromptLexical — Lexical editor input variant for InputPrompt.
 *
 * Uses a minimal Lexical setup (plain text only) as an alternative
 * to the plain textarea.  Enter-to-submit and Shift+Enter for newline
 * are handled via a custom Lexical plugin.
 *
 * IMPORTANT: This file imports from `@lexical/react` only — it does NOT
 * import from `@datalayer/jupyter-lexical` to avoid pulling in heavy
 * Lumino / Jupyter dependencies (see separated-hook-files pattern in CLAUDE.md).
 *
 * @module chat/prompt/InputPromptLexical
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  KEY_ENTER_COMMAND,
  COMMAND_PRIORITY_HIGH,
} from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

import { MentionNode } from './plugins/MentionNode';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { Box } from '@datalayer/primer-addons';
import {
  AgentMentionPlugin,
  type MentionableAgent,
} from './plugins/AgentMentionPlugin';

// ---- Lexical config (plain-text only) ------------------------------------

const EDITOR_CONFIG = {
  namespace: 'InputPromptLexical',
  theme: {
    paragraph: 'input-prompt-lexical-p',
  },
  // The `@agent` chip. A node the editor does not know about is dropped on
  // insert, silently — the mention would simply never appear.
  nodes: [MentionNode],
  onError(error: Error) {
    console.error('[InputPromptLexical]', error);
  },
};

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

function AutoFocusPlugin({ autoFocus }: { autoFocus?: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!autoFocus) {
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
  }, [editor, autoFocus]);

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
  /** Auto-focus the editor on mount */
  autoFocus?: boolean;
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
  autoFocus = false,
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
        // Tighter above than below: the box already has the footer's padding
        // under it, so an equal pad top and bottom read as a gap over the
        // first line of typing rather than as breathing room.
        pt: '2px',
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
      <LexicalComposer initialConfig={EDITOR_CONFIG}>
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
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
          }
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
                top: '4px',
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
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <SyncPlugin value={value} onChange={onChange} />
        <ReadOnlyPlugin readOnly={readOnly || disabled} />
        <EnterSubmitPlugin
          onSubmit={onSubmit}
          disabled={disabled}
          readOnly={readOnly}
        />
        <AutoFocusPlugin autoFocus={autoFocus} />
        {mentionableAgents?.length ? (
          <AgentMentionPlugin agents={mentionableAgents} />
        ) : null}
      </LexicalComposer>
    </Box>
  );
}

export default InputPromptLexical;
