/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Main chat hook for chat component.
 * Provides chat state, message sending, and streaming functionality.
 *
 * @module components/chat/hooks/useChat
 */

import { useCallback, useMemo } from 'react';
import { useChatStore } from '../components/chat/store';
import type { ChatMessage } from '../components/chat/types/message';
import type { InferenceRequestOptions } from '../components/chat/types/inference';
import {
  createUserMessage,
  createAssistantMessage,
  generateMessageId,
} from '../components/chat/types/message';

/**
 * Return type for useChat hook
 */
export interface UseChatReturn {
  /** All messages in the conversation */
  messages: ChatMessage[];

  /** Whether a request is in progress */
  isLoading: boolean;

  /** Whether currently streaming a response */
  isStreaming: boolean;

  /** Current error, if any */
  error: Error | null;

  /** Send a user message */
  sendMessage: (
    content: string,
    options?: InferenceRequestOptions,
  ) => Promise<void>;

  /** Append a message directly (useful for tool results) */
  appendMessage: (message: ChatMessage) => void;

  /** Update an existing message */
  updateMessage: (messageId: string, updates: Partial<ChatMessage>) => void;

  /** Delete a message */
  deleteMessage: (messageId: string) => void;

  /** Clear all messages */
  clearMessages: () => void;

  /** Stop current generation */
  stopGeneration: () => void;

  /** Reload/regenerate from a specific message */
  reloadMessages: (fromMessageId: string) => Promise<void>;

  /** Check if chat is available (provider configured) */
  isAvailable: boolean;

  /** Current suggestions */
  suggestions: string[];

  /** Set suggestions */
  setSuggestions: (suggestions: string[]) => void;
}

/**
 * Main hook for chat functionality
 *
 * @example
 * ```tsx
 * function ChatUI() {
 *   const {
 *     messages,
 *     sendMessage,
 *     isLoading,
 *     isStreaming
 *   } = useChat();
 *
 *   const handleSubmit = async (text: string) => {
 *     await sendMessage(text);
 *   };
 *
 *   return (
 *     <div>
 *       {messages.map(msg => <Message key={msg.id} message={msg} />)}
 *       <Input onSubmit={handleSubmit} disabled={isLoading} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useChat(): UseChatReturn {
  // Get instances from store (set via useChatStore.getState().setInferenceProvider())
  const inferenceProvider = useChatStore(state => state.inferenceProvider);
  const protocolAdapter = useChatStore(state => state.protocolAdapter);
  const toolExecutor = useChatStore(state => state.toolExecutor);

  // Get state from store
  const messages = useChatStore(state => state.messages);
  const isLoading = useChatStore(state => state.isLoading);
  const isStreaming = useChatStore(state => state.isStreaming);
  const error = useChatStore(state => state.error);
  const suggestions = useChatStore(state => state.suggestions);

  // Get actions from store
  const addMessage = useChatStore(state => state.addMessage);
  const updateMessage = useChatStore(state => state.updateMessage);
  const deleteMessage = useChatStore(state => state.deleteMessage);
  const clearMessages = useChatStore(state => state.clearMessages);
  const setLoading = useChatStore(state => state.setLoading);
  const setError = useChatStore(state => state.setError);
  const startStreaming = useChatStore(state => state.startStreaming);
  const appendToStream = useChatStore(state => state.appendToStream);
  const stopStreaming = useChatStore(state => state.stopStreaming);
  const setSuggestions = useChatStore(state => state.setSuggestions);
  const getTools = useChatStore(state => state.getTools);

  /**
   * Send a user message and get AI response
   */
  const sendMessage = useCallback(
    async (content: string, options?: InferenceRequestOptions) => {
      // Check if we have a way to send messages
      if (!inferenceProvider && !protocolAdapter) {
        setError(
          new Error('No inference provider or protocol adapter configured.'),
        );
        return;
      }

      // Create and add user message
      const userMessage = createUserMessage(content);
      addMessage(userMessage);

      // Clear error and set loading
      setError(null);
      setLoading(true);

      try {
        // Get registered tools
        const tools = getTools();

        // Merge options
        const requestOptions: InferenceRequestOptions = {
          ...options,
          tools: tools.length > 0 ? tools : undefined,
        };

        // Get all messages for context
        const allMessages = [...messages, userMessage];

        // Create placeholder for assistant message
        const assistantMessageId = generateMessageId();
        const assistantMessage = createAssistantMessage('');
        assistantMessage.id = assistantMessageId;
        addMessage(assistantMessage);

        // Stream the response
        startStreaming(assistantMessageId);

        // Use protocol adapter if available (for ag-ui, a2a, acp)
        // Otherwise fall back to inference provider (for vercel-ai, OpenAI-compatible)
        if (protocolAdapter) {
          // Track pending tool calls for this run
          const pendingToolCalls: Map<
            string,
            { toolName: string; args: Record<string, unknown> }
          > = new Map();
          let currentAssistantContent = '';

          // Subscribe to adapter events
          const unsubscribe = protocolAdapter.subscribe(event => {
            switch (event.type) {
              case 'message':
                // AG-UI sends incremental messages with accumulating content
                if (event.message) {
                  currentAssistantContent =
                    typeof event.message.content === 'string'
                      ? event.message.content
                      : '';
                  // Update the assistant message with the current content
                  updateMessage(assistantMessageId, {
                    content: currentAssistantContent,
                    toolCalls: event.message.toolCalls,
                  });
                }
                break;

              case 'tool-call':
                // Track tool call for execution after stream completes
                if (event.toolCall) {
                  console.log(
                    '[useChat] Tool call received:',
                    event.toolCall.toolCallId,
                    event.toolCall.toolName,
                  );
                  pendingToolCalls.set(event.toolCall.toolCallId, {
                    toolName: event.toolCall.toolName,
                    args: event.toolCall.args,
                  });
                }
                break;

              case 'error':
                if (event.error) {
                  setError(event.error);
                }
                break;
            }
          });

          try {
            // Send the initial message
            await protocolAdapter.sendMessage(userMessage, {
              tools: requestOptions.tools,
              messages: allMessages,
            });

            // After stream completes, execute any pending tool calls
            if (pendingToolCalls.size > 0 && toolExecutor) {
              console.log(
                '[useChat] Executing',
                pendingToolCalls.size,
                'tool calls',
              );

              // Execute tool calls and collect results
              const toolResults: Array<{
                toolCallId: string;
                toolName: string;
                result: unknown;
                isError: boolean;
              }> = [];

              for (const [toolCallId, { toolName, args }] of pendingToolCalls) {
                console.log(
                  '[useChat] Executing tool:',
                  toolName,
                  'with args:',
                  args,
                );
                const result = await toolExecutor.execute({
                  toolCallId,
                  toolName,
                  args,
                });
                console.log('[useChat] Tool result:', result);
                toolResults.push({
                  toolCallId,
                  toolName,
                  result: result.result,
                  isError: !result.success,
                });
              }

              // Build messages array with tool results for continuation
              // Include the assistant message with tool calls
              const assistantWithToolCalls: ChatMessage = {
                id: assistantMessageId,
                role: 'assistant',
                content: currentAssistantContent,
                createdAt: new Date(),
                toolCalls: Array.from(pendingToolCalls.entries()).map(
                  ([toolCallId, { toolName, args }]) => ({
                    type: 'tool-call' as const,
                    toolCallId,
                    toolName,
                    args,
                    status: 'completed' as const,
                  }),
                ),
              };

              // Create tool result messages
              const toolResultMessages: ChatMessage[] = toolResults.map(tr => ({
                id: generateMessageId(),
                role: 'tool' as const,
                content: JSON.stringify(tr.result),
                createdAt: new Date(),
                metadata: {
                  toolCallId: tr.toolCallId,
                  toolName: tr.toolName,
                  isError: tr.isError,
                },
              }));

              // Update stored messages
              updateMessage(assistantMessageId, assistantWithToolCalls);
              toolResultMessages.forEach(msg => addMessage(msg));

              // Create new assistant message for the continuation
              const continuationAssistantId = generateMessageId();
              const continuationMessage = createAssistantMessage('');
              continuationMessage.id = continuationAssistantId;
              addMessage(continuationMessage);
              startStreaming(continuationAssistantId);

              // Subscribe to continuation events
              const unsubscribeContinuation = protocolAdapter.subscribe(
                event => {
                  if (event.type === 'message' && event.message) {
                    const content =
                      typeof event.message.content === 'string'
                        ? event.message.content
                        : '';
                    updateMessage(continuationAssistantId, {
                      content,
                      toolCalls: event.message.toolCalls,
                    });
                  } else if (event.type === 'error' && event.error) {
                    setError(event.error);
                  }
                },
              );

              try {
                // Build the full message history for continuation
                const continuationMessages: ChatMessage[] = [
                  ...allMessages,
                  assistantWithToolCalls,
                  ...toolResultMessages,
                ];

                // Send continuation request with tool results
                // AG-UI expects tool results as messages with role: "tool"
                await protocolAdapter.sendMessage(
                  toolResultMessages[toolResultMessages.length - 1],
                  {
                    tools: requestOptions.tools,
                    messages: continuationMessages,
                  },
                );
              } finally {
                unsubscribeContinuation();
              }
            }
          } finally {
            unsubscribe();
          }
        } else if (inferenceProvider) {
          const response = await inferenceProvider.streamMessage(
            allMessages,
            requestOptions,
            event => {
              switch (event.type) {
                case 'content-delta':
                  if (event.delta?.delta.content) {
                    appendToStream(
                      assistantMessageId,
                      event.delta.delta.content,
                    );
                  }
                  break;

                case 'tool-call-start':
                  // Handle tool call UI update
                  if (event.toolCall) {
                    // Tool calls are handled by the tool executor
                    console.log('[useChat] Tool call started:', event.toolCall);
                  }
                  break;

                case 'error':
                  if (event.error) {
                    setError(event.error);
                  }
                  break;
              }
            },
          );

          // Update final message with complete content and tool calls
          updateMessage(assistantMessageId, {
            content: response.message.content,
            toolCalls: response.message.toolCalls,
          });

          // Handle tool calls if present
          if (
            response.message.toolCalls &&
            response.message.toolCalls.length > 0
          ) {
            // Tool calls are executed by the tool executor if configured
            if (toolExecutor) {
              for (const toolCall of response.message.toolCalls) {
                await toolExecutor.execute({
                  toolCallId: toolCall.toolCallId,
                  toolName: toolCall.toolName,
                  args: toolCall.args,
                });
              }
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
        stopStreaming();
      }
    },
    [
      inferenceProvider,
      protocolAdapter,
      toolExecutor,
      messages,
      addMessage,
      updateMessage,
      setLoading,
      setError,
      startStreaming,
      appendToStream,
      stopStreaming,
      getTools,
    ],
  );

  /**
   * Append a message directly
   */
  const appendMessage = useCallback(
    (message: ChatMessage) => {
      addMessage(message);
    },
    [addMessage],
  );

  /**
   * Stop current generation
   */
  const stopGeneration = useCallback(() => {
    inferenceProvider?.cancelRequest();
    protocolAdapter?.disconnect?.();
    stopStreaming();
    setLoading(false);
  }, [inferenceProvider, protocolAdapter, stopStreaming, setLoading]);

  /**
   * Reload/regenerate from a specific message
   */
  const reloadMessages = useCallback(
    async (fromMessageId: string) => {
      // Find the message index
      const messageIndex = messages.findIndex(m => m.id === fromMessageId);
      if (messageIndex === -1) return;

      // Find the last user message before this point
      let lastUserMessageIndex = messageIndex;
      for (let i = messageIndex; i >= 0; i--) {
        if (messages[i].role === 'user') {
          lastUserMessageIndex = i;
          break;
        }
      }

      // Get the user message content
      const userMessage = messages[lastUserMessageIndex];
      const userContent =
        typeof userMessage.content === 'string'
          ? userMessage.content
          : 'Regenerate response';

      // Remove messages from the found index onwards
      const previousMessages = messages.slice(0, lastUserMessageIndex);

      // Clear and restore messages
      clearMessages();
      previousMessages.forEach(msg => addMessage(msg));

      // Resend the user message
      await sendMessage(userContent);
    },
    [messages, clearMessages, addMessage, sendMessage],
  );

  /**
   * Check if chat is available
   */
  const isAvailable = useMemo(
    () =>
      (inferenceProvider?.isAvailable() ?? false) || protocolAdapter !== null,
    [inferenceProvider, protocolAdapter],
  );

  return {
    messages,
    isLoading,
    isStreaming,
    error,
    sendMessage,
    appendMessage,
    updateMessage,
    deleteMessage,
    clearMessages,
    stopGeneration,
    reloadMessages,
    isAvailable,
    suggestions,
    setSuggestions,
  };
}
