/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * InputPromptText — Plain-text input variant for InputPrompt.
 *
 * Auto-resizing textarea with Enter-to-send and Shift+Enter for newline.
 *
 * @module chat/prompt/InputPromptText
 */

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
  useCallback,
  useEffect,
} from 'react';
import { Textarea } from '@primer/react';
import { Box } from '@datalayer/primer-addons';

export interface InputPromptTextProps {
  /** Current input value */
  value: string;
  /** Callback when the value changes */
  onChange: (value: string) => void;
  /** Placeholder for the textarea */
  placeholder?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether the input is read-only */
  readOnly?: boolean;
  /** Callback when the user presses Enter (without Shift) */
  onSubmit?: () => void;
  /** Ref forwarded to the underlying textarea */
  inputRef?: Ref<HTMLTextAreaElement>;
}

export function InputPromptText({
  value,
  onChange,
  placeholder = 'Ask anything…',
  disabled = false,
  readOnly = false,
  onSubmit,
  inputRef,
}: InputPromptTextProps) {
  // Auto-resize
  const adjustHeight = useCallback(() => {
    const el =
      inputRef && 'current' in inputRef
        ? (inputRef as React.RefObject<HTMLTextAreaElement>).current
        : null;
    if (el) {
      el.style.height = 'auto';
      const max = 120;
      const min = 40;
      const h = Math.min(Math.max(el.scrollHeight, min), max);
      el.style.height = `${h}px`;
      el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
    }
  }, [inputRef]);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  useEffect(() => {
    const t = setTimeout(adjustHeight, 0);
    return () => clearTimeout(t);
  }, [adjustHeight]);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit?.();
      }
    },
    [onSubmit],
  );

  return (
    <Box sx={{ px: 2, py: 1 }}>
      <Textarea
        ref={inputRef as React.Ref<HTMLTextAreaElement>}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        sx={{
          width: '100%',
          resize: 'none',
          minHeight: '40px',
          maxHeight: '120px',
          overflow: 'hidden',
          transition: 'height 0.1s ease-out',
          py: '2px',
          border: 'none !important',
          boxShadow: 'none !important',
          outline: 'none !important',
          bg: 'transparent',
          '&:focus-within': {
            border: 'none !important',
            boxShadow: 'none !important',
            outline: 'none !important',
          },
          '& textarea': {
            outline: 'none !important',
          },
        }}
        rows={1}
      />
    </Box>
  );
}

export default InputPromptText;
