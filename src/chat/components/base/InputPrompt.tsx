/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * InputPrompt - Standalone input prompt component extracted from ChatBase.
 *
 * Provides a textarea with a send/stop button, auto-resize behavior,
 * and keyboard shortcuts (Enter to send, Shift+Enter for newline).
 *
 * Can be used independently of ChatBase for embedding a prompt input
 * in any context (e.g. landing pages, home screens).
 *
 * @module components/chat/components/base/InputPrompt
 */

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Textarea, IconButton } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { PaperAirplaneIcon, SquareCircleIcon } from '@primer/octicons-react';

/**
 * Props for the InputPrompt component.
 */
export interface InputPromptProps {
  /** Placeholder text for the textarea */
  placeholder?: string;
  /** Whether the input is in a loading/sending state */
  isLoading?: boolean;
  /** Callback when a message is submitted */
  onSend: (message: string) => void;
  /** Callback when the stop button is clicked */
  onStop?: () => void;
  /** Auto-focus the input on mount */
  autoFocus?: boolean;
  /** Trigger value change to refocus input */
  focusTrigger?: number;
  /** Whether to show a border on top */
  showBorderTop?: boolean;
  /** Whether to use subtle background */
  showBackground?: boolean;
  /** Custom padding (default: 3) */
  padding?: number;
  /** Whether the prompt is disabled */
  disabled?: boolean;
  /** Additional sx props for the outer container */
  sx?: Record<string, unknown>;
  /** Controlled input value (external state) */
  value?: string;
  /** Controlled input onChange (external state) */
  onChange?: (value: string) => void;
}

/**
 * InputPrompt — A standalone chat input with send button.
 *
 * Features:
 * - Auto-resizing textarea (min 40px, max 120px)
 * - Enter to send, Shift+Enter for newline
 * - Send / Stop toggle based on loading state
 * - Auto-focus support
 */
export function InputPrompt({
  placeholder = 'Type a message...',
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
}: InputPromptProps) {
  // Internal state (used when not controlled)
  const [internalInput, setInternalInput] = useState('');
  const input = controlledValue !== undefined ? controlledValue : internalInput;
  const setInput =
    controlledOnChange !== undefined ? controlledOnChange : setInternalInput;

  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      const timeoutId = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [autoFocus]);

  // Refocus when focusTrigger changes
  useEffect(() => {
    if (focusTrigger !== undefined && focusTrigger > 0 && inputRef.current) {
      const timeoutId = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timeoutId);
    }
  }, [focusTrigger]);

  // Track previous loading state to detect when loading completes
  const wasLoadingRef = useRef(false);

  // Refocus input when loading completes
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && inputRef.current) {
      const timeoutId = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timeoutId);
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading]);

  // Auto-resize textarea based on content
  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = 120;
      const minHeight = 40;
      const newHeight = Math.min(
        Math.max(textarea.scrollHeight, minHeight),
        maxHeight,
      );
      textarea.style.height = `${newHeight}px`;
      textarea.style.overflowY =
        textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, []);

  // Adjust textarea height when input changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  // Ensure textarea has a minimum height on mount
  useEffect(() => {
    const timer = setTimeout(adjustTextareaHeight, 0);
    return () => clearTimeout(timer);
  }, [adjustTextareaHeight]);

  // Send handler
  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading || disabled) return;
    const message = input.trim();
    // Only clear input if not controlled externally
    if (controlledValue === undefined) {
      setInput('');
    }
    onSend(message);
  }, [input, isLoading, disabled, onSend, setInput, controlledValue]);

  // Stop handler
  const handleStop = useCallback(() => {
    onStop?.();
  }, [onStop]);

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

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
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
          <Textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading || disabled}
            sx={{
              flex: 1,
              resize: 'none',
              minHeight: '40px',
              maxHeight: '120px',
              overflow: 'hidden',
              transition: 'height 0.1s ease-out',
              py: '2px',
            }}
            rows={1}
          />
          {isLoading ? (
            <IconButton
              icon={SquareCircleIcon}
              aria-label="Stop"
              onClick={handleStop}
              sx={{ alignSelf: 'flex-end' }}
            />
          ) : (
            <IconButton
              icon={PaperAirplaneIcon}
              aria-label="Send"
              onClick={handleSend}
              disabled={!input.trim() || disabled}
              sx={{ alignSelf: 'flex-end' }}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default InputPrompt;
