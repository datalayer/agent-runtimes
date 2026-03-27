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
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { Box } from '@datalayer/primer-addons';

// ---- Lexical config (plain-text only) ------------------------------------

const EDITOR_CONFIG = {
  namespace: 'InputPromptLexical',
  theme: {
    paragraph: 'input-prompt-lexical-p',
  },
  nodes: [],
  onError(error: Error) {
    console.error('[InputPromptLexical]', error);
  },
};

// ---- Enter-to-submit plugin ---------------------------------------------

function EnterSubmitPlugin({
  onSubmit,
  disabled,
}: {
  onSubmit?: () => void;
  disabled?: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        if (event?.shiftKey || disabled) return false;
        event?.preventDefault();
        onSubmit?.();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onSubmit, disabled]);

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
    if (autoFocus) {
      const t = setTimeout(() => editor.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [editor, autoFocus]);

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
  /** Callback when the user presses Enter (without Shift) */
  onSubmit?: () => void;
  /** Auto-focus the editor on mount */
  autoFocus?: boolean;
}

export function InputPromptLexical({
  value,
  onChange,
  placeholder = 'Ask anything…',
  disabled = false,
  onSubmit,
  autoFocus = false,
}: InputPromptLexicalProps) {
  return (
    <Box
      sx={{
        px: 2,
        py: 1,
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
                minHeight: 40,
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
                top: '11px',
                left: '15px',
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
        <EnterSubmitPlugin onSubmit={onSubmit} disabled={disabled} />
        <AutoFocusPlugin autoFocus={autoFocus} />
      </LexicalComposer>
    </Box>
  );
}

export default InputPromptLexical;
