/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Chat input component.
 * Provides the message input area with send button and optional tool suggestions.
 *
 * @module components/chat/components/elements/ChatInputPrompt
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
} from 'react';
import { Button, Textarea, IconButton, ActionList } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  PaperAirplaneIcon,
  SquareCircleIcon,
  UploadIcon,
  MentionIcon,
} from '@primer/octicons-react';
import { useChat } from '../../../../hooks/useChat';
import { useChatStreaming, useChatTools } from '../../store/chatStore';

/**
 * ChatInputPrompt props
 */
export interface ChatInputPromptProps {
  /** Placeholder text */
  placeholder?: string;

  /** Disable input */
  disabled?: boolean;

  /** Show tool suggestions */
  showToolSuggestions?: boolean;

  /** Show file upload button */
  showFileUpload?: boolean;

  /** Maximum rows for textarea */
  maxRows?: number;

  /** Custom class name */
  className?: string;

  /** Leading icon to display on the left of the input */
  leadingIcon?: React.ReactNode;

  /** Custom send button text */
  sendButtonText?: string;

  /** Callback before sending */
  onBeforeSend?: (content: string) => boolean | void;

  /** Callback after sending */
  onAfterSend?: (content: string) => void;
}

/**
 * Chat Input Prompt component
 */
export function ChatInputPrompt({
  placeholder = 'Type a message...',
  disabled = false,
  showToolSuggestions = true,
  showFileUpload = false,
  maxRows = 6,
  className,
  leadingIcon,
  sendButtonText = 'Send',
  onBeforeSend,
  onAfterSend,
}: ChatInputPromptProps) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { sendMessage, stopGeneration } = useChat();
  const { isStreaming } = useChatStreaming();
  const tools = useChatTools();

  // Auto-resize textarea based on content
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get proper scrollHeight
      textarea.style.height = 'auto';
      // Set height to scrollHeight, capped at maxHeight
      const maxHeight = maxRows * 24; // Approximate line height
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
      // Add overflow if content exceeds maxHeight
      textarea.style.overflowY =
        textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, [maxRows]);

  // Adjust textarea height when input changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  // Auto-focus on mount
  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  // Handle send
  const handleSend = useCallback(async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || disabled || isStreaming) return;

    // Call onBeforeSend hook
    if (onBeforeSend) {
      const result = onBeforeSend(trimmedInput);
      if (result === false) return;
    }

    try {
      await sendMessage(trimmedInput);
      setInput('');
      onAfterSend?.(trimmedInput);
    } catch (error) {
      console.error('[ChatInputPrompt] Send error:', error);
    }
  }, [input, disabled, isStreaming, sendMessage, onBeforeSend, onAfterSend]);

  // Handle stop
  const handleStop = useCallback(() => {
    stopGeneration();
  }, [stopGeneration]);

  // Handle key press
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }

      // Show tool suggestions with @
      if (event.key === '@' && showToolSuggestions) {
        setShowSuggestions(true);
      }
    },
    [handleSend, showToolSuggestions],
  );

  // Handle tool mention
  const handleToolMention = useCallback(
    (toolName: string) => {
      const cursorPosition =
        textareaRef.current?.selectionStart || input.length;
      const beforeCursor = input.slice(0, cursorPosition);
      const afterCursor = input.slice(cursorPosition);

      // Replace @... with tool mention
      const lastAtIndex = beforeCursor.lastIndexOf('@');
      const newInput =
        beforeCursor.slice(0, lastAtIndex) + `@${toolName} ` + afterCursor;

      setInput(newInput);
      setShowSuggestions(false);

      // Focus back on textarea
      textareaRef.current?.focus();
    },
    [input],
  );

  // Filter tools based on input
  const filteredTools = React.useMemo(() => {
    if (!showSuggestions) return [];

    const cursorPosition = textareaRef.current?.selectionStart || input.length;
    const beforeCursor = input.slice(0, cursorPosition);
    const lastAtIndex = beforeCursor.lastIndexOf('@');

    if (lastAtIndex === -1) return [];

    const query = beforeCursor.slice(lastAtIndex + 1).toLowerCase();

    return Object.values(tools).filter(
      tool =>
        tool.name.toLowerCase().includes(query) ||
        tool.description?.toLowerCase().includes(query),
    );
  }, [tools, input, showSuggestions]);

  return (
    <Box
      className={className}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        p: 3,
        borderTop: '1px solid',
        borderColor: 'border.default',
        bg: 'canvas.default',
        position: 'relative',
      }}
    >
      {/* Tool suggestions dropdown */}
      {showSuggestions && filteredTools.length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            bottom: '100%',
            left: 3,
            right: 3,
            maxHeight: 200,
            overflow: 'auto',
            bg: 'canvas.overlay',
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            boxShadow: 'shadow.large',
            zIndex: 10,
          }}
        >
          <ActionList>
            {filteredTools.map(tool => (
              <ActionList.Item
                key={tool.name}
                onSelect={() => handleToolMention(tool.name)}
              >
                <ActionList.LeadingVisual>
                  <MentionIcon />
                </ActionList.LeadingVisual>
                <Box>
                  <Box sx={{ fontWeight: 'semibold' }}>{tool.name}</Box>
                  {tool.description && (
                    <Box sx={{ fontSize: 0, color: 'fg.muted' }}>
                      {tool.description}
                    </Box>
                  )}
                </Box>
              </ActionList.Item>
            ))}
          </ActionList>
        </Box>
      )}

      {/* Input area */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
        {/* Leading icon */}
        {leadingIcon && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              color: 'fg.muted',
              pb: 2,
            }}
          >
            {leadingIcon}
          </Box>
        )}

        {/* File upload button */}
        {showFileUpload && (
          <IconButton
            icon={UploadIcon}
            aria-label="Upload file"
            variant="invisible"
            disabled={disabled || !!isStreaming}
          />
        )}

        {/* Textarea */}
        <Box sx={{ flex: 1 }}>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder={placeholder}
            disabled={disabled || !!isStreaming}
            rows={1}
            sx={{
              width: '100%',
              maxHeight: `${maxRows * 24}px`,
              minHeight: '40px',
              resize: 'none',
              overflow: 'hidden',
              transition: 'height 0.1s ease-out',
            }}
          />
        </Box>

        {/* Send/Stop button */}
        {isStreaming ? (
          <Button
            variant="danger"
            onClick={handleStop}
            leadingVisual={SquareCircleIcon}
            aria-label="Stop generation"
          >
            Stop
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={handleSend}
            disabled={disabled || !input.trim()}
            leadingVisual={PaperAirplaneIcon}
            aria-label="Send message"
          >
            {sendButtonText}
          </Button>
        )}
      </Box>

      {/* Hint text */}
      <Box sx={{ fontSize: 0, color: 'fg.muted' }}>
        Press <kbd>Enter</kbd> to send, <kbd>Shift+Enter</kbd> for new line
        {showToolSuggestions && ', @ to mention tools'}
      </Box>
    </Box>
  );
}

export default ChatInputPrompt;
