/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Chat message list component.
 * Renders the list of chat messages with support for custom renderers.
 *
 * @module components/chat/components/elements/ChatMessages
 */

import React, { useRef, useEffect } from 'react';
import { Text, RelativeTime } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { PersonIcon, ToolsIcon } from '@primer/octicons-react';
import { AiAgentIcon } from '@datalayer/icons-react';
import type { ChatMessage, ContentPart } from '../../types/message';
import type { ExtensionRegistry } from '../../extensions/ExtensionRegistry';
import {
  useChatMessages,
  useChatExtensionRegistry,
} from '../../store/chatStore';

/**
 * ChatMessages props
 */
export interface ChatMessagesProps {
  /** Custom message renderer */
  messageRenderer?: (message: ChatMessage) => React.ReactNode;

  /** Custom activity renderer */
  activityRenderer?: (activity: {
    type: string;
    data: unknown;
  }) => React.ReactNode;

  /** Show timestamps */
  showTimestamps?: boolean;

  /** Show avatars */
  showAvatars?: boolean;

  /** Auto-scroll to bottom on new messages */
  autoScroll?: boolean;

  /** Custom class name */
  className?: string;

  /** Optional extension registry (defaults to store value) */
  extensionRegistry?: ExtensionRegistry;
}

/**
 * Chat Messages component
 */
export function ChatMessages({
  messageRenderer,
  activityRenderer,
  showTimestamps = true,
  showAvatars = true,
  autoScroll = true,
  className,
  extensionRegistry: extensionRegistryProp,
}: ChatMessagesProps) {
  const messages = useChatMessages();
  const storeExtensionRegistry = useChatExtensionRegistry();
  const extensionRegistry = extensionRegistryProp ?? storeExtensionRegistry;
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (autoScroll && lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, autoScroll]);

  // Render individual message
  const renderMessage = (message: ChatMessage, isLast: boolean) => {
    // Check for custom renderer
    if (messageRenderer) {
      return messageRenderer(message);
    }

    // Check extension registry for custom renderer
    if (extensionRegistry) {
      const messageRenderers = extensionRegistry.getMessageRenderers();
      const extensionRenderer = messageRenderers.find(r =>
        r.canRender(message),
      );
      if (extensionRenderer) {
        return extensionRenderer.render({
          message,
          isStreaming: false,
        });
      }
    }

    // Default rendering
    return (
      <Box
        ref={isLast ? lastMessageRef : undefined}
        key={message.id}
        sx={{
          display: 'flex',
          gap: 3,
          p: 3,
          borderBottom: '1px solid',
          borderColor: 'border.muted',
          bg: message.role === 'assistant' ? 'canvas.subtle' : 'canvas.default',
          '&:last-child': {
            borderBottom: 'none',
          },
        }}
      >
        {/* Avatar */}
        {showAvatars && (
          <Box sx={{ flexShrink: 0 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bg:
                  message.role === 'user'
                    ? 'neutral.muted'
                    : message.role === 'assistant'
                      ? 'accent.emphasis'
                      : 'attention.emphasis',
                color: message.role === 'user' ? 'fg.default' : 'fg.onEmphasis',
              }}
            >
              {message.role === 'user' ? (
                <PersonIcon size={16} />
              ) : message.role === 'assistant' ? (
                <AiAgentIcon colored size={16} />
              ) : (
                <ToolsIcon size={16} />
              )}
            </Box>
          </Box>
        )}

        {/* Content */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              mb: 1,
            }}
          >
            <Text sx={{ fontWeight: 'semibold', fontSize: 1 }}>
              {message.role === 'user'
                ? 'You'
                : message.role === 'assistant'
                  ? 'Assistant'
                  : 'System'}
            </Text>
            {showTimestamps && message.createdAt && (
              <RelativeTime
                datetime={message.createdAt.toISOString()}
                sx={{ fontSize: 0, color: 'fg.muted' }}
              />
            )}
          </Box>

          {/* Message content */}
          <Box sx={{ fontSize: 1, lineHeight: 1.5 }}>
            {renderMessageContent(
              message,
              activityRenderer,
              extensionRegistry ?? undefined,
            )}
          </Box>
        </Box>
      </Box>
    );
  };

  if (messages.length === 0) {
    return (
      <Box
        className={className}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          p: 4,
          color: 'fg.muted',
        }}
      >
        <AiAgentIcon colored size={48} />
        <Text sx={{ mt: 3, fontSize: 2 }}>Start a conversation</Text>
        <Text sx={{ mt: 1, fontSize: 1 }}>
          Send a message to begin chatting
        </Text>
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      className={className}
      sx={{
        flex: 1,
        overflow: 'auto',
      }}
    >
      {messages.map((message, index) =>
        renderMessage(message, index === messages.length - 1),
      )}
    </Box>
  );
}

/**
 * Render message content based on type
 */
function renderMessageContent(
  message: ChatMessage,
  activityRenderer?: (activity: {
    type: string;
    data: unknown;
  }) => React.ReactNode,
  extensionRegistry?: ExtensionRegistry,
): React.ReactNode {
  const { content } = message;

  // Simple string content
  if (typeof content === 'string') {
    return <Text sx={{ whiteSpace: 'pre-wrap' }}>{content}</Text>;
  }

  // Array of content parts
  if (Array.isArray(content)) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {content.map((part, index) =>
          renderContentPart(part, index, activityRenderer, extensionRegistry),
        )}
      </Box>
    );
  }

  return null;
}

/**
 * Render individual content part
 */
function renderContentPart(
  part: ContentPart,
  index: number,
  activityRenderer?: (activity: {
    type: string;
    data: unknown;
  }) => React.ReactNode,
  extensionRegistry?: ExtensionRegistry,
): React.ReactNode {
  switch (part.type) {
    case 'text':
      return (
        <Text key={index} sx={{ whiteSpace: 'pre-wrap' }}>
          {part.text}
        </Text>
      );

    case 'image':
      return (
        <Box key={index}>
          <img
            src={part.url}
            alt={part.alt || 'Image'}
            style={{ maxWidth: '100%', borderRadius: '8px' }}
          />
        </Box>
      );

    case 'tool-call':
      return (
        <Box
          key={index}
          sx={{
            p: 2,
            bg: 'canvas.subtle',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'border.default',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
            <ToolsIcon size={16} />
            <Text sx={{ fontWeight: 'semibold', fontSize: 0 }}>
              Tool: {part.toolName}
            </Text>
          </Box>
          <Box
            as="pre"
            sx={{
              fontSize: 0,
              overflow: 'auto',
              m: 0,
              p: 2,
              bg: 'canvas.inset',
              borderRadius: 1,
            }}
          >
            {JSON.stringify(part.args, null, 2)}
          </Box>
        </Box>
      );

    case 'tool-result': {
      const result = part.result as
        | { success?: boolean; error?: string; data?: unknown }
        | undefined;
      const isSuccess =
        result && typeof result === 'object' && 'success' in result
          ? result.success
          : true;
      return (
        <Box
          key={index}
          sx={{
            p: 2,
            bg: isSuccess ? 'success.subtle' : 'danger.subtle',
            borderRadius: 2,
            border: '1px solid',
            borderColor: isSuccess ? 'success.muted' : 'danger.muted',
          }}
        >
          <Text sx={{ fontWeight: 'semibold', fontSize: 0, mb: 1 }}>
            Result: {part.toolName}
          </Text>
          <Box
            as="pre"
            sx={{
              fontSize: 0,
              overflow: 'auto',
              m: 0,
            }}
          >
            {result?.error || JSON.stringify(result, null, 2)}
          </Box>
        </Box>
      );
    }

    case 'activity':
      // Check for custom renderer
      if (activityRenderer) {
        return (
          <Box key={index}>
            {activityRenderer({
              type: part.activityType || 'unknown',
              data: part.data,
            })}
          </Box>
        );
      }

      // Check extension registry
      if (extensionRegistry) {
        const renderer = extensionRegistry.getActivityRenderer(
          part.activityType || 'unknown',
        );
        if (renderer) {
          return (
            <Box key={index}>
              {renderer.render({
                activityType: part.activityType || 'unknown',
                data: part.data,
                message: {} as ChatMessage, // Placeholder - actual message would come from parent context
              })}
            </Box>
          );
        }
      }

      // Default activity rendering
      return (
        <Box
          key={index}
          sx={{
            p: 2,
            bg: 'accent.subtle',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'accent.muted',
          }}
        >
          <Text sx={{ fontWeight: 'semibold', fontSize: 0 }}>
            Activity: {part.activityType}
          </Text>
          {part.data != null && (
            <Box
              as="pre"
              sx={{
                fontSize: 0,
                overflow: 'auto',
                mt: 1,
                m: 0,
              }}
            >
              {String(
                typeof part.data === 'object'
                  ? JSON.stringify(part.data, null, 2)
                  : part.data,
              )}
            </Box>
          )}
        </Box>
      );

    default:
      return null;
  }
}

export default ChatMessages;
