/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useEffect, useState } from 'react';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface UseAGUIOptions {
  /**
   * Base URL for the AG-UI endpoint (e.g., 'http://localhost:8000')
   */
  baseUrl?: string;
  /**
   * Agent ID to use (default: 'demo-agent')
   */
  agentId?: string;
  /**
   * Auto-connect on mount
   */
  autoConnect?: boolean;
  /**
   * Callback when a message is sent
   */
  onMessageSent?: (content: string) => void;
  /**
   * Callback when a message is received
   */
  onMessageReceived?: (message: Message) => void;
  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void;
}

/**
 * Hook to manage chat state with AG-UI protocol.
 *
 * This hook provides an interface to the AG-UI protocol endpoint
 * at /api/v1/ag-ui/{agent_id}/ which is powered by Pydantic AI's
 * native AGUIApp. The AG-UI protocol accepts POST requests with
 * prompts and streams back agent responses.
 *
 * Features:
 * - POST-based message sending
 * - Streaming response handling
 * - Message history tracking
 *
 * Example:
 * ```tsx
 * const { messages, sendMessage, isConnected } = useAGUI({
 *   baseUrl: 'http://localhost:8765',
 *   agentId: 'demo-agent',
 * });
 *
 * await sendMessage('Hello!');
 * ```
 */
export function useAGUI(options: UseAGUIOptions = {}) {
  const {
    baseUrl = 'http://localhost:8765',
    agentId = 'demo-agent',
    autoConnect = true,
    onMessageSent,
    onMessageReceived,
    onError,
  } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Construct the AG-UI endpoint URL
  const endpointUrl = `${baseUrl}/api/v1/ag-ui/${agentId}/`;

  // Connect to AG-UI (check health)
  const connect = useCallback(async () => {
    try {
      // AG-UI doesn't have a health endpoint, so we just mark as connected
      setIsConnected(true);
      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setIsConnected(false);
      onError?.(error);
    }
  }, [onError]);

  // Disconnect from AG-UI
  const disconnect = useCallback(() => {
    setIsConnected(false);
  }, []);

  // Send a message to the agent
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      setIsSending(true);
      setError(null);

      try {
        // Add user message to history
        const userMessage: Message = {
          role: 'user',
          content,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, userMessage]);
        onMessageSent?.(content);

        // Build AG-UI RunAgentInput format
        const requestBody = {
          thread_id: `thread-${Date.now()}`,
          run_id: `run-${Date.now()}`,
          parent_run_id: null,
          state: null,
          messages: [
            {
              id: `msg-${Date.now()}`,
              role: 'user',
              content,
              name: null,
            },
          ],
          tools: [],
          context: [],
          forwarded_props: {},
        };

        // Send POST request to AG-UI endpoint
        const response = await fetch(endpointUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error(
            `AG-UI request failed: ${response.status} ${response.statusText}`,
          );
        }

        // Handle streaming response
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let assistantContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });

          // Parse AG-UI event stream format (server-sent events)
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                // AG-UI sends TEXT_MESSAGE_CONTENT events with delta field
                if (data.type === 'TEXT_MESSAGE_CONTENT' && data.delta) {
                  assistantContent += data.delta;
                }
              } catch (e) {
                // Skip invalid JSON
                console.warn('Failed to parse AG-UI event:', e);
              }
            }
          }
        }

        // Add assistant message to history
        const assistantMessage: Message = {
          role: 'assistant',
          content: assistantContent || 'No response',
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMessage]);
        onMessageReceived?.(assistantMessage);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onError?.(error);
      } finally {
        setIsSending(false);
      }
    },
    [endpointUrl, onMessageSent, onMessageReceived, onError],
  );

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
  }, [autoConnect, connect]);

  return {
    messages,
    isConnected,
    isSending,
    error,
    sendMessage,
    connect,
    disconnect,
  };
}
