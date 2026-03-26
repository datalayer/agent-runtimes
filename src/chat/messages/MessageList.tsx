/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * MessageList — Renders the scrollable list of chat messages, tool calls,
 * and the typing indicator.
 *
 * @module components/chat/elements/MessageList
 */

import { type ReactNode, type RefObject } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { Streamdown } from 'streamdown';
import {
  streamdownMarkdownStyles,
  streamdownCodeBlockStyles,
} from '../styles/streamdownStyles';
import { ToolCallDisplay } from '../tools/ToolCallDisplay';

import { isToolCallMessage, getMessageText } from '../../utils';
import type {
  DisplayItem,
  ToolCallMessage,
  AvatarConfig,
  RenderToolResult,
  RespondCallback,
} from '../../types/chat';
import type { ChatMessage } from '../../types/messges';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MessageListProps {
  /** All display items (messages + tool calls) */
  displayItems: DisplayItem[];
  /** Whether the agent is loading */
  isLoading: boolean;
  /** Whether the agent is currently streaming */
  isStreaming: boolean;
  /** Show the pulsing-dot typing indicator */
  showLoadingIndicator: boolean;
  /** Hide assistant messages that follow a rendered tool call UI */
  hideMessagesAfterToolUI: boolean;
  /** Resolved avatar configuration */
  avatarConfig: Required<
    Pick<
      AvatarConfig,
      | 'userAvatar'
      | 'assistantAvatar'
      | 'showAvatars'
      | 'avatarSize'
      | 'userAvatarBg'
      | 'assistantAvatarBg'
    >
  >;
  /** Layout padding */
  padding: number;
  /** Optional custom tool-result renderer */
  renderToolResult?: RenderToolResult;
  /** Content to render when there are no messages */
  emptyContent: ReactNode;
  /** Ref attached to the sentinel div at the bottom for auto-scrolling */
  messagesEndRef: RefObject<HTMLDivElement>;
  /**
   * Callback for human-in-the-loop tool responses.
   * Called when the user responds to an 'executing' tool.
   */
  onRespond: (toolCallId: string, result: unknown) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageList({
  displayItems,
  isLoading,
  isStreaming,
  showLoadingIndicator,
  hideMessagesAfterToolUI,
  avatarConfig,
  padding,
  renderToolResult,
  emptyContent,
  messagesEndRef,
  onRespond,
}: MessageListProps) {
  if (displayItems.length === 0) {
    return <>{emptyContent}</>;
  }

  // Create respond callback for a tool call (human-in-the-loop)
  const createRespondCallback = (toolCallId: string): RespondCallback => {
    return (result: unknown) => {
      onRespond(toolCallId, result);
    };
  };

  // Build set of rendered tool call IDs to support hideMessagesAfterToolUI
  const renderedToolCallIds = new Set<string>();
  displayItems.forEach(item => {
    if (isToolCallMessage(item)) {
      if (renderToolResult) {
        const rendered = renderToolResult({
          toolCallId: item.toolCallId,
          toolName: item.toolName,
          name: item.toolName,
          args: item.args,
          result: item.result,
          status: item.status,
          error: item.error,
        });
        if (rendered !== null && rendered !== undefined) {
          renderedToolCallIds.add(item.toolCallId);
        }
      } else {
        // Default display always renders tool calls
        renderedToolCallIds.add(item.toolCallId);
      }
    }
  });
  const hasRenderedToolCall = renderedToolCallIds.size > 0;

  return (
    <>
      {displayItems.map((item, index) => {
        // ---- Tool call item ----
        if (isToolCallMessage(item)) {
          const respond =
            item.status === 'executing'
              ? createRespondCallback(item.toolCallId)
              : undefined;

          const toolUI = renderToolResult ? (
            renderToolResult({
              toolCallId: item.toolCallId,
              toolName: item.toolName,
              name: item.toolName,
              args: item.args,
              result: item.result,
              status: item.status,
              error: item.error,
              respond,
            })
          ) : (
            <ToolCallDisplay
              toolCallId={item.toolCallId}
              toolName={item.toolName}
              args={item.args}
              result={item.result}
              status={item.status}
              error={item.error}
              executionError={item.executionError}
              codeError={item.codeError}
              exitCode={item.exitCode}
            />
          );

          if (toolUI === null || toolUI === undefined) return null;

          return (
            <Box
              key={item.id}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                maxWidth: '95%',
                px: padding,
                py: 1,
              }}
            >
              {toolUI}
            </Box>
          );
        }

        // ---- Chat message item ----
        const message = item as ChatMessage;
        const isUser = message.role === 'user';

        // Optionally hide assistant messages that follow a rendered tool call
        if (!isUser && hideMessagesAfterToolUI && hasRenderedToolCall) {
          const messageText = getMessageText(message);

          const prevIndex = index - 1;
          if (prevIndex >= 0) {
            const prevItem = displayItems[prevIndex];
            if (
              isToolCallMessage(prevItem) &&
              renderedToolCallIds.has(prevItem.toolCallId)
            ) {
              return null;
            }
          }

          // Check for HITL-specific patterns
          const hitlToolCall = displayItems.find(
            di =>
              isToolCallMessage(di) &&
              renderedToolCallIds.has(di.toolCallId) &&
              di.args &&
              'steps' in di.args &&
              Array.isArray(di.args.steps),
          ) as ToolCallMessage | undefined;

          if (hitlToolCall && messageText) {
            const steps = hitlToolCall.args.steps as Array<{
              description?: string;
            }>;
            const hasStepContent =
              steps.some(
                step =>
                  step.description &&
                  messageText
                    .toLowerCase()
                    .includes(step.description.toLowerCase().slice(0, 20)),
              ) ||
              /^\s*(\d+\.\s|[-*]\s|\*\*)/.test(messageText) ||
              messageText.includes('**Enabled**') ||
              messageText.includes('steps below');

            if (hasStepContent) {
              return null;
            }
          }
        }

        return (
          <Box
            key={message.id}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: isUser ? 'flex-end' : 'flex-start',
              px: padding,
              py: 1,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                gap: 2,
                flexDirection: isUser ? 'row-reverse' : 'row',
                alignItems: 'flex-start',
              }}
            >
              {/* Avatar */}
              {avatarConfig.showAvatars && (
                <Box
                  sx={{
                    width: avatarConfig.avatarSize,
                    height: avatarConfig.avatarSize,
                    borderRadius: '50%',
                    bg: isUser
                      ? avatarConfig.userAvatarBg
                      : avatarConfig.assistantAvatarBg,
                    color: isUser
                      ? 'fg.default'
                      : 'var(--button-primary-fgColor-rest, var(--fgColor-onEmphasis))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {isUser
                    ? avatarConfig.userAvatar
                    : avatarConfig.assistantAvatar}
                </Box>
              )}

              {/* Message bubble */}
              <Box
                sx={{
                  maxWidth: '85%',
                  p: 2,
                  borderRadius: 2,
                  backgroundColor: isUser ? 'accent.emphasis' : 'canvas.subtle',
                  // Use primary-button text token for better contrast when
                  // accent.emphasis is bright (e.g. Matrix dark theme).
                  color: isUser
                    ? 'var(--button-primary-fgColor-rest, var(--fgColor-onEmphasis))'
                    : 'fg.default',
                  ...streamdownCodeBlockStyles,
                }}
              >
                {isUser ? (
                  <Text
                    sx={{
                      fontSize: 1,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {getMessageText(message)}
                  </Text>
                ) : (
                  <Box sx={streamdownMarkdownStyles}>
                    <Streamdown>
                      {getMessageText(message) || (isStreaming ? '...' : '')}
                    </Streamdown>
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        );
      })}

      {/* Typing indicator cursor — shows when waiting for response */}
      {showLoadingIndicator && (isLoading || isStreaming) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            px: padding,
            py: 1,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              alignItems: 'flex-start',
            }}
          >
            {/* Avatar */}
            {avatarConfig.showAvatars && (
              <Box
                sx={{
                  width: avatarConfig.avatarSize,
                  height: avatarConfig.avatarSize,
                  borderRadius: '50%',
                  bg: avatarConfig.assistantAvatarBg,
                  color:
                    'var(--button-primary-fgColor-rest, var(--fgColor-onEmphasis))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {avatarConfig.assistantAvatar}
              </Box>
            )}
            {/* Pulsing cursor dots */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                p: 2,
                borderRadius: 2,
                bg: 'canvas.subtle',
                minHeight: '32px',
              }}
            >
              {[0, 0.2, 0.4].map((delay, i) => (
                <Box
                  key={i}
                  sx={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    bg: 'fg.muted',
                    animation: 'typingPulse 1.4s ease-in-out infinite',
                    animationDelay: `${delay}s`,
                    '@keyframes typingPulse': {
                      '0%, 60%, 100%': {
                        transform: 'scale(0.6)',
                        opacity: 0.4,
                      },
                      '30%': {
                        transform: 'scale(1)',
                        opacity: 1,
                      },
                    },
                  }}
                />
              ))}
            </Box>
          </Box>
        </Box>
      )}
      <div ref={messagesEndRef} />
    </>
  );
}
