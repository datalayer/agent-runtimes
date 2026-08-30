/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * InputPromptBase — the editor, its header and its footer component.
 *
 * Layout (top → bottom):
 *   1. Header   – slot for dropdowns / indicators
 *   2. Input    – "text" (textarea) or "lexical" (plain-text Lexical editor)
 *   3. Footer   – left slot for controls, submit / stop buttons on the right
 *
 * The component is wrapped in a rounded container with a subtle border,
 * giving it a more integrated visual appearance.
 *
 * @module chat/prompt/InputPromptBase
 */

import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { useTypingPlaceholder } from './useTypingPlaceholder';
import { InputPromptHeader } from './InputPromptHeader';
import { InputPromptFooter } from './InputPromptFooter';
import { InputPromptText } from './InputPromptText';
import { InputPromptLexical } from './InputPromptLexical';
import type { MentionableAgent } from './plugins/AgentMentionPlugin';

/** Input variant type. */
export type InputPromptVariant = 'text' | 'lexical';

/**
 * Props for the InputPrompt component.
 */
export interface InputPromptBaseProps {
  /**
   * Which editor the prompt uses — `'lexical'` (default) or `'text'`.
   *
   * Lexical is the one with the `@` menu and the mention chips, and a host had
   * to opt into it by name to get either — so every prompt that had not been
   * told about the feature silently did without it. `'text'` remains for a
   * host that wants a plain textarea and nothing else.
   */
  variant?: InputPromptVariant;
  /** Placeholder text */
  placeholder?: string;
  /**
   * Suggestions to type out in the placeholder, one after another, on a loop.
   *
   * The chat's own openers, usually. An empty composer asks "what can I ask
   * this thing?" and the empty state answers it only until the first message
   * is sent; typing the answers into the box keeps answering it afterwards.
   *
   * The placeholder only — never the value. It stops while the prompt has
   * focus and for a reader who has asked for reduced motion. Absent or empty
   * leaves `placeholder` standing still.
   */
  typingSuggestions?: string[];
  /** Whether the agent is loading / streaming */
  isLoading?: boolean;
  /** Whether the connected kernel is currently busy */
  isKernelBusy?: boolean;
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
  /** Whether the prompt is read-only */
  readOnly?: boolean;
  /**
   * Agents this prompt may address by typing `@`.
   *
   * Lexical only: the plain textarea has nowhere to draw a menu, and a
   * suggestion a person cannot see is worse than none.
   */
  mentionableAgents?: MentionableAgent[];
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
  /** Content rendered on the right side of the footer, next to send/stop */
  footerRightContent?: ReactNode;
}

/**
 * InputPromptBase — the editor, its header and its footer with header, input area, and footer.
 */
export function InputPromptBase({
  variant = 'lexical',
  placeholder = 'Ask anything…',
  typingSuggestions,
  isLoading = false,
  isKernelBusy = false,
  onSend,
  onStop,
  autoFocus = false,
  focusTrigger,
  showBorderTop = true,
  showBackground = true,
  padding = 3,
  disabled = false,
  readOnly = false,
  mentionableAgents,
  sx,
  value: controlledValue,
  onChange: controlledOnChange,
  headerContent,
  footerContent,
  footerRightContent,
}: InputPromptBaseProps) {
  // ---- Controlled / uncontrolled state -----------------------------------
  const [internalInput, setInternalInput] = useState('');
  const input = controlledValue !== undefined ? controlledValue : internalInput;
  const setInput =
    controlledOnChange !== undefined ? controlledOnChange : setInternalInput;

  // ---- Refs (text variant only) ------------------------------------------
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ---- Typed placeholder --------------------------------------------------
  /*
   * Focus for the whole prompt, not for the editor alone.
   *
   * React's focus events bubble, so one pair of handlers on the container
   * covers both variants and the controls in the footer — and somebody
   * choosing a model from a menu is interacting with this prompt just as
   * surely as somebody typing in it. `relatedTarget` is what distinguishes
   * leaving the prompt from moving around inside it; without that check,
   * every step between the editor and a button would restart the animation.
   */
  const [focused, setFocused] = useState(false);
  /*
   * The focus this prompt gave itself does not count as somebody arriving.
   *
   * `autoFocus` puts the caret in the box on mount — which is right, it is why
   * the workspace exists — and it would otherwise stop the animation before
   * its first character, on exactly the pages that most need the invitation. A
   * click, a tab-in, or any later focus is a person; the first one is us.
   */
  const selfFocused = useRef(autoFocus);
  const animatedPlaceholder = useTypingPlaceholder({
    phrases: typingSuggestions ?? [],
    // Nothing to stand in for once there is something typed, and nothing to
    // invite while the agent is answering or the box is inert.
    enabled: !focused && !input && !isLoading && !disabled && !readOnly,
    idle: placeholder,
  });

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
    if (!input.trim() || isLoading || disabled || readOnly) return;
    const message = input.trim();
    if (controlledValue === undefined) {
      setInput('');
    }
    onSend(message);
  }, [input, isLoading, disabled, readOnly, onSend, setInput, controlledValue]);

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
          onFocusCapture={() => {
            if (selfFocused.current) {
              selfFocused.current = false;
              return;
            }
            setFocused(true);
          }}
          // Typing is arriving too, whoever moved the caret. Without this an
          // auto-focused prompt would keep animating under a person's first
          // keystroke, until the character they typed made it stop.
          onKeyDownCapture={() => {
            selfFocused.current = false;
            setFocused(true);
          }}
          onBlurCapture={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setFocused(false);
            }
          }}
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
                `0 0 0 1px ${(t as any)?.colors?.accent?.fg ?? '#16A085'}`,
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
              placeholder={animatedPlaceholder}
              disabled={isLoading || disabled}
              readOnly={readOnly}
              onSubmit={handleSend}
              autoFocus={autoFocus}
              mentionableAgents={mentionableAgents}
            />
          ) : (
            <InputPromptText
              value={input}
              onChange={setInput}
              placeholder={animatedPlaceholder}
              disabled={isLoading || disabled}
              readOnly={readOnly}
              onSubmit={handleSend}
              inputRef={inputRef}
            />
          )}

          {/* Footer */}
          <InputPromptFooter
            isLoading={isLoading}
            isKernelBusy={isKernelBusy}
            sendDisabled={!input.trim() || disabled || readOnly}
            onSend={handleSend}
            onStop={handleStop}
            rightContent={footerRightContent}
          >
            {footerContent}
          </InputPromptFooter>
        </Box>
      </Box>
    </Box>
  );
}

export default InputPromptBase;
