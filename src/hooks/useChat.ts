/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Main chat hook for chat component.
 * Provides chat state, message sending, and streaming functionality.
 *
 * @module chat/hooks/useChat
 */

import { useCallback, useMemo } from 'react';
import { useChatStore } from '../stores';
import type { ChatMessage } from '../types/messages';
import type { InferenceRequestOptions } from '../types/inference';
import type { ProtocolEvent } from '../types/protocol';
import { createUserMessage, generateMessageId } from '../types/messages';
import { isToolCallMessage } from '../utils';
import {
  BROWSER_LIMITS,
  emptyConversation,
  reduceConversation,
  withPrompt,
  type ConversationState,
} from '../portable/conversation';
import {
  conversationEventsOf,
  snapshotOfMessages,
} from '../portable/adapterEvents';
import type { AgUiEvent } from '../portable/agui';
import {
  conversationDrawer,
  emptyChatLayer,
} from '../chat/base/conversationItems';

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
  const setMessages = useChatStore(state => state.setMessages);
  const startStreaming = useChatStore(state => state.startStreaming);
  const stopStreaming = useChatStore(state => state.stopStreaming);
  const setSuggestions = useChatStore(state => state.setSuggestions);
  const getTools = useChatStore(state => state.getTools);

  /**
   * Send a user message and get the AI's response. The conversation is
   * `reduceConversation`'s (MOBILE M-030), as in ChatBase and on the phone:
   * every adapter event read by `conversationEventsOf`, an inference
   * provider's deltas as AG-UI text events, and the store's messages drawn
   * from it.
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

      const userMessage = createUserMessage(content);
      const draw = conversationDrawer(words => words);
      let conversation: ConversationState = withPrompt(
        reduceConversation(
          emptyConversation(BROWSER_LIMITS),
          snapshotOfMessages(messages),
        ),
        userMessage.id,
        content,
      );
      const show = (next: ConversationState) => {
        conversation = next;
        setMessages(
          draw(conversation, emptyChatLayer()).filter(
            (item): item is ChatMessage => !isToolCallMessage(item),
          ),
        );
      };
      const reduce = (events: AgUiEvent[]) => {
        if (events.length) {
          show(
            events.reduce(
              (kept, event) => reduceConversation(kept, event),
              conversation,
            ),
          );
        }
      };
      /** An adapter's event, as the conversation reads it; its failure is the chat's error. */
      const read = (event: ProtocolEvent) => {
        if (event.type === 'error') {
          if (event.error) {
            setError(event.error);
          }
          return;
        }
        try {
          reduce(conversationEventsOf(event, conversation));
        } catch (failure) {
          setError(
            failure instanceof Error ? failure : new Error(String(failure)),
          );
        }
      };

      show(conversation);
      setError(null);
      setLoading(true);
      startStreaming(generateMessageId());

      try {
        const tools = getTools();
        const requestOptions: InferenceRequestOptions = {
          ...options,
          tools: tools.length > 0 ? tools : undefined,
        };
        // Every message so far, for context.
        const allMessages = [...messages, userMessage];

        // A protocol adapter (ag-ui, a2a, acp) when there is one; else the
        // inference provider (vercel-ai, OpenAI-compatible).
        if (protocolAdapter) {
          // The calls this run asks the page's tools for, run once it ends.
          const pendingToolCalls: Map<
            string,
            { toolName: string; args: Record<string, unknown> }
          > = new Map();
          const unsubscribe = protocolAdapter.subscribe(event => {
            if (event.type === 'tool-call' && event.toolCall) {
              pendingToolCalls.set(event.toolCall.toolCallId, {
                toolName: event.toolCall.toolName,
                args: event.toolCall.args,
              });
            }
            read(event);
          });

          try {
            await protocolAdapter.sendMessage(userMessage, {
              tools: requestOptions.tools,
              messages: allMessages,
            });

            if (pendingToolCalls.size > 0 && toolExecutor) {
              const toolResults: Array<{
                toolCallId: string;
                toolName: string;
                result: unknown;
                isError: boolean;
              }> = [];
              for (const [toolCallId, { toolName, args }] of pendingToolCalls) {
                const result = await toolExecutor.execute({
                  toolCallId,
                  toolName,
                  args,
                });
                toolResults.push({
                  toolCallId,
                  toolName,
                  result: result.result,
                  isError: !result.success,
                });
                // The call answered, in the conversation.
                reduce(
                  conversationEventsOf(
                    {
                      type: 'tool-result',
                      toolResult: {
                        toolCallId,
                        success: result.success,
                        result: result.result,
                        ...(result.success ? {} : { error: result.error }),
                      },
                    },
                    conversation,
                  ),
                );
              }

              // The run continued with the results: the assistant's calls,
              // then one `tool` message per result (AG-UI).
              const assistantWithToolCalls: ChatMessage = {
                id: generateMessageId(),
                role: 'assistant',
                content: '',
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
              await protocolAdapter.sendMessage(
                toolResultMessages[toolResultMessages.length - 1],
                {
                  tools: requestOptions.tools,
                  messages: [
                    ...allMessages,
                    assistantWithToolCalls,
                    ...toolResultMessages,
                  ],
                },
              );
            }
          } finally {
            unsubscribe();
          }
        } else if (inferenceProvider) {
          const answerId = generateMessageId();
          reduce([
            { type: 'RUN_STARTED' },
            {
              type: 'TEXT_MESSAGE_START',
              messageId: answerId,
              role: 'assistant',
            },
          ]);
          const response = await inferenceProvider.streamMessage(
            allMessages,
            requestOptions,
            event => {
              if (
                event.type === 'content-delta' &&
                event.delta?.delta.content
              ) {
                reduce([
                  {
                    type: 'TEXT_MESSAGE_CONTENT',
                    messageId: answerId,
                    delta: event.delta.delta.content,
                  },
                ]);
              } else if (event.type === 'error' && event.error) {
                setError(event.error);
              }
            },
          );
          // The answer as the provider gave it whole, then the run's end.
          const said = conversationEventsOf(
            {
              type: 'message',
              message: {
                id: answerId,
                role: 'assistant',
                content:
                  typeof response.message.content === 'string'
                    ? response.message.content
                    : '',
              },
            },
            conversation,
          );
          reduce([...said, { type: 'RUN_FINISHED' }]);

          // The page's tools run the calls it asked for.
          if (toolExecutor && response.message.toolCalls?.length) {
            for (const toolCall of response.message.toolCalls) {
              await toolExecutor.execute({
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                args: toolCall.args,
              });
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
      setMessages,
      setLoading,
      setError,
      startStreaming,
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
