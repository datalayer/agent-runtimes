/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * InputPromptText — Plain-text input variant for InputPrompt.
 *
 * Auto-resizing textarea with Enter-to-send and Shift+Enter for newline,
 * and the arrow keys through the prompt history from the text's edges.
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
import type { HistoryDirection } from './promptHistory';

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
  /**
   * Up or down through the prompt history, asked when the caret is on the
   * first or last line. Answers whether it had somewhere to go; when it did
   * not, the key moves the caret as it normally would.
   */
  onHistory?: (direction: HistoryDirection) => boolean;
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
  onHistory,
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
        return;
      }
      /*
       * The arrow keys walk the history, but only from the edge of the text:
       * up from the first line, down from the last. Anywhere else they move
       * the caret, as in any editor — somebody on the third line of a long
       * prompt pressing up wants the second line, not last week's question.
       * A modifier means something else is being asked for.
       */
      if (
        (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
        onHistory &&
        !e.shiftKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        const el = e.currentTarget;
        const direction: HistoryDirection = e.key === 'ArrowUp' ? 'up' : 'down';
        const atEdge =
          direction === 'up'
            ? !el.value.slice(0, el.selectionStart).includes('\n')
            : !el.value.slice(el.selectionEnd).includes('\n');
        if (atEdge && onHistory(direction)) {
          e.preventDefault();
        }
      }
    },
    [onSubmit, onHistory],
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
          // Greyed while it cannot be typed in, so the state is legible
          // without trying it. Primer's `disabled` textarea keeps the
          // author's colour, and `!important` is needed for the same reason
          // the border rules below need it.
          '& textarea:disabled, & textarea[readonly]': {
            color: 'fg.subtle !important',
            cursor: 'not-allowed',
          },
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
