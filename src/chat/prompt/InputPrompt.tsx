/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * InputPrompt — Integrated chat input component.
 *
 * Layout (top → bottom):
 *   1. Header   – slot for dropdowns / indicators
 *   2. Input    – "text" (textarea) or "lexical" (plain-text Lexical editor)
 *   3. Footer   – left slot for controls, submit / stop buttons on the right
 *
 * The component is wrapped in a rounded container with a subtle border,
 * giving it a more integrated visual appearance.
 *
 * @module chat/prompt/InputPrompt
 */

import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@datalayer/primer-addons';

import { InputPromptHeader } from './InputPromptHeader';
import { InputPromptFooter } from './InputPromptFooter';
import { InputPromptText } from './InputPromptText';
import { InputPromptLexical } from './InputPromptLexical';

/** Input variant type. */
export type InputPromptVariant = 'text' | 'lexical';

/**
 * Props for the InputPrompt component.
 */
export interface InputPromptProps {
  /** Input variant — "text" (default) or "lexical" */
  variant?: InputPromptVariant;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the agent is loading / streaming */
  isLoading?: boolean;
  /** Callback when a message is submitted */
  onSend: (message: string) => void;
  /** Callback when the stop button is clicked */
  onStop?: () => void;
  /** Auto-focus the input on mount */
  autoFocus?: boolean;
  /** Trigger value change to refocus input */
  focusTrigger?: number;
  /** Whether to show a border on top of the outer wrapper */
  showBorderTop?: boolean;
  /** Whether to use a subtle background */
  showBackground?: boolean;
  /** Custom outer padding (default: 3) */
  padding?: number;
  /** Whether the prompt is disabled */
  disabled?: boolean;
  /** Additional sx props for the outer container */
  sx?: Record<string, unknown>;
  /** Controlled input value (external state) */
  value?: string;
  /** Controlled input onChange (external state) */
  onChange?: (value: string) => void;
  /** Content rendered in the header slot */
  headerContent?: ReactNode;
  /** Content rendered on the left side of the footer */
  footerContent?: ReactNode;
}

/**
 * InputPrompt — Integrated chat input with header, input area, and footer.
 */
export function InputPrompt({
  variant = 'text',
  placeholder = 'Ask anything…',
  isLoading = false,
  onSend,
  onStop,
  autoFocus = false,
  focusTrigger,
  showBorderTop = true,
  showBackground = true,
  padding = 3,
  disabled = false,
  sx,
  value: controlledValue,
  onChange: controlledOnChange,
  headerContent,
  footerContent,
}: InputPromptProps) {
  // ---- Controlled / uncontrolled state -----------------------------------
  const [internalInput, setInternalInput] = useState('');
  const input = controlledValue !== undefined ? controlledValue : internalInput;
  const setInput =
    controlledOnChange !== undefined ? controlledOnChange : setInternalInput;

  // ---- Refs (text variant only) ------------------------------------------
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ---- Auto-focus --------------------------------------------------------
  useEffect(() => {
    if (autoFocus && variant === 'text' && inputRef.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [autoFocus, variant]);

  // ---- Refocus when focusTrigger changes ---------------------------------
  useEffect(() => {
    if (
      focusTrigger !== undefined &&
      focusTrigger > 0 &&
      variant === 'text' &&
      inputRef.current
    ) {
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [focusTrigger, variant]);

  // ---- Refocus after loading completes -----------------------------------
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (
      wasLoadingRef.current &&
      !isLoading &&
      variant === 'text' &&
      inputRef.current
    ) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, variant]);

  // ---- Send / Stop handlers ----------------------------------------------
  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading || disabled) return;
    const message = input.trim();
    if (controlledValue === undefined) {
      setInput('');
    }
    onSend(message);
  }, [input, isLoading, disabled, onSend, setInput, controlledValue]);

  const handleStop = useCallback(() => {
    onStop?.();
  }, [onStop]);

  // ---- Render ------------------------------------------------------------
  return (
    <Box sx={sx}>
      <Box
        sx={{
          p: padding,
          ...(showBorderTop && {
            borderTop: '1px solid',
            borderColor: 'border.default',
          }),
          ...(showBackground && {
            bg: 'canvas.subtle',
          }),
        }}
      >
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            bg: 'canvas.default',
            overflow: 'hidden',
            transition: 'border-color 0.2s ease',
            '&:focus-within': {
              borderColor: 'accent.fg',
              boxShadow: (t: Record<string, unknown>) =>
                `0 0 0 1px ${(t as any)?.colors?.accent?.fg ?? '#0969da'}`,
            },
          }}
        >
          {/* Header */}
          <InputPromptHeader>{headerContent}</InputPromptHeader>

          {/* Input area */}
          {variant === 'lexical' ? (
            <InputPromptLexical
              value={input}
              onChange={setInput}
              placeholder={placeholder}
              disabled={isLoading || disabled}
              onSubmit={handleSend}
              autoFocus={autoFocus}
            />
          ) : (
            <InputPromptText
              value={input}
              onChange={setInput}
              placeholder={placeholder}
              disabled={isLoading || disabled}
              onSubmit={handleSend}
              inputRef={inputRef}
            />
          )}

          {/* Footer */}
          <InputPromptFooter
            isLoading={isLoading}
            sendDisabled={!input.trim() || disabled}
            onSend={handleSend}
            onStop={handleStop}
          >
            {footerContent}
          </InputPromptFooter>
        </Box>
      </Box>
    </Box>
  );
}

export default InputPrompt;
