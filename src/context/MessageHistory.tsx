// Copyright (c) 2025-2026 Datalayer, Inc.
// Distributed under the terms of the Modified BSD License.

/**
 * MessageHistory component - Renders the agent conversation message history,
 * splitting messages into "in context" and "out of context" groups. Shared by
 * the ContextInspector (Configuration tab) and the Monitoring tab so both
 * surfaces display identical message details.
 */

import { Text, Label } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { UIMessage } from 'ai';
import {
  AiModelIcon,
  TerminalIcon,
  CommentDiscussionIcon,
  CheckCircleIcon,
  XCircleIcon,
  InfoIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@primer/octicons-react';
import React, { useMemo, useState } from 'react';
import { TextPart } from '../chat/parts/TextPart';

/**
 * Message detail from API.
 */
export interface MessageDetail {
  role: string;
  content: string;
  estimatedTokens: number;
  timestamp: string | null;
  inContext: boolean;
  toolName: string | null;
  toolCallId: string | null;
  isToolCall: boolean;
  isToolResult: boolean;
}

/**
 * Format token count for display.
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Single message detail view.
 */
export function MessageDetailView({ message }: { message: MessageDetail }) {
  const roleColors: Record<string, string> = {
    user: 'accent.fg',
    assistant: 'success.fg',
    system: 'attention.fg',
    tool: 'done.fg',
  };

  const roleIcons: Record<string, React.ElementType> = {
    user: CommentDiscussionIcon,
    assistant: AiModelIcon,
    system: InfoIcon,
    tool: TerminalIcon,
  };

  const RoleIcon = roleIcons[message.role] || CommentDiscussionIcon;
  const text = String(message.content || '');
  const chatRole = message.role === 'user' ? 'user' : 'assistant';
  const uiMessage = {
    id: `history-${message.role}-${message.timestamp || 'now'}-${message.toolCallId || 'no-tool'}`,
    role: chatRole,
    parts: [{ type: 'text', text }],
  } as unknown as UIMessage;

  return (
    <Box
      sx={{
        p: 2,
        mb: 1,
        bg: message.inContext ? 'canvas.default' : 'canvas.inset',
        border: '1px solid',
        borderColor: message.inContext ? 'border.default' : 'border.muted',
        borderRadius: 2,
        opacity: message.inContext ? 1 : 0.7,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <RoleIcon size={14} />
        <Text
          sx={{
            fontWeight: 'semibold',
            fontSize: 0,
            color: roleColors[message.role] || 'fg.default',
            textTransform: 'capitalize',
          }}
        >
          {message.role}
        </Text>
        {message.toolName && (
          <Label size="small" variant="secondary">
            {message.toolName}
          </Label>
        )}
        {message.isToolCall && (
          <Label size="small" variant="accent">
            call
          </Label>
        )}
        {message.isToolResult && (
          <Label size="small" variant="success">
            result
          </Label>
        )}
        {message.inContext ? (
          <CheckCircleIcon size={12} fill="var(--fgColor-success)" />
        ) : (
          <XCircleIcon size={12} fill="var(--fgColor-muted)" />
        )}
        <Text sx={{ fontSize: 0, color: 'fg.muted', ml: 'auto' }}>
          {formatTokens(message.estimatedTokens)} tokens
        </Text>
      </Box>

      <Box
        sx={{
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: 'border.default',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <TextPart
          text={text}
          message={uiMessage}
          isLastPart={false}
          onRegenerate={() => {
            return;
          }}
        />
      </Box>
    </Box>
  );
}

export interface MessageHistoryProps {
  /** Full ordered list of conversation messages. */
  messages: MessageDetail[];
}

/**
 * Renders the conversation message history split into out-of-context and
 * in-context groups.
 */
export function MessageHistory({ messages }: MessageHistoryProps) {
  const [expanded, setExpanded] = useState(false);

  const { inContextMessages, outOfContextMessages } = useMemo(() => {
    if (!messages) {
      return { inContextMessages: [], outOfContextMessages: [] };
    }
    return {
      inContextMessages: messages.filter(m => m.inContext),
      outOfContextMessages: messages.filter(m => !m.inContext),
    };
  }, [messages]);

  const messageHistoryTokens = useMemo(() => {
    if (!messages) {
      return 0;
    }
    return messages.reduce(
      (sum, message) => sum + (message.estimatedTokens || 0),
      0,
    );
  }, [messages]);

  return (
    <Box sx={{ mb: 2 }}>
      <Box
        as="button"
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          width: '100%',
          p: 2,
          bg: 'canvas.subtle',
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          cursor: 'pointer',
          '&:hover': {
            bg: 'canvas.inset',
          },
        }}
      >
        {expanded ? (
          <ChevronDownIcon size={16} />
        ) : (
          <ChevronRightIcon size={16} />
        )}
        <CommentDiscussionIcon size={16} />
        <Text sx={{ fontWeight: 'semibold', flex: 1, textAlign: 'left' }}>
          Message History
        </Text>
        <Label variant="secondary" size="small">
          {messages?.length || 0}
        </Label>
        {messageHistoryTokens > 0 && (
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
            {formatTokens(messageHistoryTokens)} tokens
          </Text>
        )}
      </Box>

      {expanded && (
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'border.default',
            borderTop: 'none',
            borderRadius: '0 0 6px 6px',
            p: 2,
          }}
        >
          {!messages || messages.length === 0 ? (
            <Text sx={{ color: 'fg.muted', fontSize: 1 }}>No messages yet</Text>
          ) : (
            <>
              {outOfContextMessages.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Text
                    sx={{
                      fontWeight: 'semibold',
                      fontSize: 1,
                      color: 'fg.muted',
                      mb: 2,
                      display: 'block',
                    }}
                  >
                    Out of Context ({outOfContextMessages.length})
                  </Text>
                  {outOfContextMessages.map((msg, idx) => (
                    <MessageDetailView key={`out-${idx}`} message={msg} />
                  ))}
                </Box>
              )}

              {inContextMessages.length > 0 && (
                <Box>
                  <Text
                    sx={{
                      fontWeight: 'semibold',
                      fontSize: 1,
                      color: 'success.fg',
                      mb: 2,
                      display: 'block',
                    }}
                  >
                    In Context ({inContextMessages.length})
                  </Text>
                  {inContextMessages.map((msg, idx) => (
                    <MessageDetailView key={`in-${idx}`} message={msg} />
                  ))}
                </Box>
              )}
            </>
          )}
        </Box>
      )}
    </Box>
  );
}

export default MessageHistory;
