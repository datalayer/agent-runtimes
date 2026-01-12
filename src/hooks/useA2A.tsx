/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * useA2A - React hook for A2A (Agent-to-Agent) protocol.
 *
 * This hook provides a client interface to A2A protocol endpoints,
 * supporting both synchronous message/send and streaming responses.
 *
 * Features:
 * - Agent card discovery
 * - Message sending with JSON-RPC
 * - Streaming support via SSE
 * - Task management
 * - Message history tracking
 *
 * @see https://github.com/a2aproject/a2a-js
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentCard, Task, TextPart, TaskState } from '@a2a-js/sdk';

// Re-export types for convenience
export type { AgentCard, Task, TaskState };

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  taskId?: string;
  contextId?: string;
}

export interface UseA2AOptions {
  /**
   * Base URL for the A2A endpoint (e.g., 'http://localhost:8000')
   */
  baseUrl?: string;
  /**
   * Agent ID to use (default: 'demo-agent')
   */
  agentId?: string;
  /**
   * Whether to use streaming (default: true)
   */
  streaming?: boolean;
  /**
   * Auto-connect on mount (default: true)
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
   * Callback when a task status changes
   */
  onTaskStatusChange?: (task: Task) => void;
  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void;
}

export interface UseA2AReturn {
  // Connection state
  isConnected: boolean;
  agentCard: AgentCard | null;

  // Messaging
  messages: Message[];
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;

  // Task state
  currentTask: Task | null;
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;

  // Utilities
  connect: () => Promise<void>;
  disconnect: () => void;
  error: Error | null;
}

/**
 * Hook to manage chat state with A2A protocol.
 *
 * This hook provides an interface to the A2A protocol endpoint
 * at /api/v1/a2a/agents/{agent_id} using JSON-RPC 2.0.
 *
 * Example:
 * ```tsx
 * const { messages, sendMessage, isConnected } = useA2A({
 *   baseUrl: 'http://localhost:8765',
 *   agentId: 'demo-agent',
 * });
 *
 * await sendMessage('Hello!');
 * ```
 */
export function useA2A(options: UseA2AOptions = {}): UseA2AReturn {
  const {
    baseUrl = 'http://localhost:8765',
    agentId = 'demo-agent',
    streaming = true,
    autoConnect = true,
    onMessageSent,
    onMessageReceived,
    onTaskStatusChange,
    onError,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [agentCard, setAgentCard] = useState<AgentCard | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const contextIdRef = useRef<string | null>(null);

  // Construct the A2A endpoint URL
  const agentCardUrl = `${baseUrl}/api/v1/a2a/agents/${agentId}/.well-known/agent-card.json`;
  const endpointUrl = `${baseUrl}/api/v1/a2a/agents/${agentId}/`;
  const streamEndpointUrl = `${baseUrl}/api/v1/a2a/agents/${agentId}/stream`;

  // Generate unique request ID
  const generateRequestId = useCallback(() => {
    requestIdRef.current += 1;
    return requestIdRef.current;
  }, []);

  // Connect to agent (fetch agent card)
  const connect = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(agentCardUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch agent card: ${response.statusText}`);
      }
      const card = (await response.json()) as AgentCard;
      setAgentCard(card);
      setIsConnected(true);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      setIsConnected(false);
      onError?.(err);
    }
  }, [agentCardUrl, onError]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsConnected(false);
    setAgentCard(null);
    contextIdRef.current = null;
  }, []);

  // Send message using JSON-RPC
  const sendMessage = useCallback(
    async (content: string) => {
      if (!isConnected) {
        throw new Error('Not connected to agent');
      }

      setIsLoading(true);
      setError(null);

      // Add user message to history
      const userMessage: Message = {
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, userMessage]);
      onMessageSent?.(content);

      // Generate or use existing context ID
      if (!contextIdRef.current) {
        contextIdRef.current = crypto.randomUUID();
      }

      const requestId = generateRequestId();

      try {
        if (streaming && agentCard?.capabilities?.streaming) {
          // Use streaming endpoint
          await sendStreamingMessage(content, requestId);
        } else {
          // Use non-streaming endpoint
          await sendNonStreamingMessage(content, requestId);
        }
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        onError?.(err);
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
      }
    },
    [
      isConnected,
      streaming,
      agentCard,
      generateRequestId,
      onMessageSent,
      onError,
    ],
  );

  // Send non-streaming message
  const sendNonStreamingMessage = async (
    content: string,
    requestId: number,
  ) => {
    // Send the message
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        method: 'message/send',
        params: {
          message: {
            kind: 'message',
            messageId: crypto.randomUUID(),
            role: 'user',
            parts: [{ kind: 'text', text: content }],
            contextId: contextIdRef.current,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || 'Unknown error');
    }

    let task = data.result as Task;
    setCurrentTask(task);
    onTaskStatusChange?.(task);

    // Poll for task completion
    const maxAttempts = 60; // 60 seconds max
    let attempts = 0;

    while (
      task.status.state === 'submitted' ||
      task.status.state === 'working'
    ) {
      if (attempts >= maxAttempts) {
        throw new Error('Task polling timeout');
      }

      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      attempts++;

      // Poll task status
      const pollResponse = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: generateRequestId(),
          method: 'tasks/get',
          params: {
            id: task.id,
          },
        }),
      });

      if (!pollResponse.ok) {
        throw new Error(`Poll failed: ${pollResponse.statusText}`);
      }

      const pollData = await pollResponse.json();
      if (pollData.error) {
        throw new Error(pollData.error.message || 'Unknown error');
      }

      task = pollData.result as Task;
      setCurrentTask(task);
      onTaskStatusChange?.(task);
    }

    // Extract response from completed task
    if (task.status.state === 'completed') {
      // Check for artifacts
      if (task.artifacts && task.artifacts.length > 0) {
        const textParts = task.artifacts.flatMap(
          artifact =>
            artifact.parts?.filter((p): p is TextPart => p.kind === 'text') ||
            [],
        );
        const responseText = textParts.map(p => p.text).join('') || '';

        if (responseText) {
          const assistantMessage: Message = {
            role: 'assistant',
            content: responseText,
            timestamp: new Date().toISOString(),
            taskId: task.id,
            contextId: task.contextId,
          };

          setMessages(prev => [...prev, assistantMessage]);
          onMessageReceived?.(assistantMessage);
        }
      }

      // Also check status message
      if (task.status?.message) {
        const agentMessage = task.status.message;
        const textParts = agentMessage.parts?.filter(
          (p): p is TextPart => p.kind === 'text',
        );
        const responseText = textParts?.map(p => p.text).join('') || '';

        if (responseText) {
          const assistantMessage: Message = {
            role: 'assistant',
            content: responseText,
            timestamp: new Date().toISOString(),
            taskId: task.id,
            contextId: task.contextId,
          };

          setMessages(prev => [...prev, assistantMessage]);
          onMessageReceived?.(assistantMessage);
        }
      }
    } else if (task.status.state === 'failed') {
      throw new Error('Task failed');
    } else if (task.status.state === 'canceled') {
      throw new Error('Task was canceled');
    }
  };

  // Send streaming message
  const sendStreamingMessage = async (content: string, requestId: number) => {
    setIsStreaming(true);
    setStreamingContent('');

    abortControllerRef.current = new AbortController();

    const response = await fetch(streamEndpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        method: 'message/stream',
        params: {
          message: {
            kind: 'message',
            messageId: crypto.randomUUID(),
            role: 'user',
            parts: [{ kind: 'text', text: content }],
            contextId: contextIdRef.current,
          },
        },
      }),
      signal: abortControllerRef.current.signal,
    });

    if (!response.ok) {
      throw new Error(`Stream request failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let accumulatedContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              // Streaming complete
              const assistantMessage: Message = {
                role: 'assistant',
                content: accumulatedContent,
                timestamp: new Date().toISOString(),
              };
              setMessages(prev => [...prev, assistantMessage]);
              onMessageReceived?.(assistantMessage);
              setStreamingContent('');
              break;
            }

            try {
              const event = JSON.parse(data);

              if (event.type === 'task') {
                setCurrentTask(event.task);
                onTaskStatusChange?.(event.task);
              } else if (event.type === 'status') {
                // Update task status
              } else if (event.type === 'artifact') {
                if (event.artifact?.kind === 'text') {
                  accumulatedContent += event.artifact.text;
                  setStreamingContent(accumulatedContent);
                }
              } else if (event.type === 'error') {
                throw new Error(event.error);
              }
            } catch (parseError) {
              // Ignore JSON parse errors for incomplete chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  };

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentTask(null);
    setStreamingContent('');
    contextIdRef.current = null;
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]);

  return {
    isConnected,
    agentCard,
    messages,
    sendMessage,
    clearMessages,
    currentTask,
    isLoading,
    isStreaming,
    streamingContent,
    connect,
    disconnect,
    error,
  };
}

export default useA2A;
