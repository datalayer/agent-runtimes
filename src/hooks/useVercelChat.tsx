/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useMemo } from 'react';
import { useChat, type UseChatHelpers, type UIMessage } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface UseVercelChatOptions {
  /**
   * Base URL for the Vercel AI endpoint (e.g., 'http://localhost:8000')
   */
  baseUrl?: string;
  /**
   * Agent ID to use (default: 'demo-agent')
   */
  agentId?: string;
  /**
   * Callback when a message is sent
   */
  onMessageSent?: (content: string) => void;
  /**
   * Callback when a message is received
   */
  onMessageReceived?: (message: Message) => void;
}

/**
 * Hook to manage chat state with Vercel AI protocol.
 *
 * This hook wraps the Vercel AI's useChat to connect to the
 * agent-runtimes Vercel AI endpoint at /api/v1/vercel-ai/chat.
 *
 * Features:
 * - Streaming responses via SSE
 * - Automatic message management
 * - Error handling
 * - Loading states
 *
 * Example:
 * ```tsx
 * const { messages, sendMessage, isLoading } = useVercelChat({
 *   baseUrl: 'http://localhost:8888',
 *   agentId: 'demo-agent',
 * });
 * ```
 */
export function useVercelChat(
  options: UseVercelChatOptions = {},
): UseChatHelpers<UIMessage> {
  const {
    baseUrl = 'http://localhost:8888',
    agentId = 'demo-agent',
    onMessageSent,
  } = options;

  // Construct the chat endpoint URL
  const apiEndpoint = `${baseUrl}/api/v1/vercel-ai/chat`;

  const chatResult = useChat({
    id: `vercel-chat-${agentId}`,
    transport: new DefaultChatTransport({
      api: apiEndpoint,
      body: {
        agent_id: agentId,
      },
    }),
  });

  const { sendMessage, setMessages } = chatResult;

  // Wrap original sendMessage to trigger callbacks
  const originalSendMessage = sendMessage;
  const wrappedSendMessage = useCallback(
    async (message?: any, options?: any) => {
      if (typeof message === 'string' && message.trim()) {
        onMessageSent?.(message);
      } else if (message?.parts?.[0]?.text) {
        onMessageSent?.(message.parts[0].text);
      }
      return originalSendMessage(message, options);
    },
    [originalSendMessage, onMessageSent],
  );

  // Clear chat history
  const clearChat = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  return useMemo(
    () => ({
      ...chatResult,
      sendMessage: wrappedSendMessage,
      clearChat,
    }),
    [chatResult, wrappedSendMessage, clearChat],
  );
}
