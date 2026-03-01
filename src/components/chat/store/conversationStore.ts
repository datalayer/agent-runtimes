/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Zustand store for conversation history per agent runtime.
 * Stores messages per runtime ID in memory during the session.
 *
 * Key features:
 * - Messages are stored per runtime ID in memory
 * - On page reload, messages are fetched from the server API
 * - No browser storage persistence - server is the source of truth
 *
 * @module components/chat/store/conversationStore
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type { ChatMessage } from '../types/message';

/**
 * Conversation data for a single runtime
 */
export interface ConversationData {
  /** Agent runtime ID */
  runtimeId: string;
  /** Messages in this conversation */
  messages: ChatMessage[];
  /** When the conversation was last updated */
  updatedAt: number;
  /** Whether messages have been fetched from the server */
  fetchedFromServer: boolean;
  /** Whether a fetch is currently in progress */
  isFetching: boolean;
}

/**
 * Conversation store state
 */
interface ConversationState {
  /** Map of runtime ID to conversation data */
  conversations: Record<string, ConversationData>;
}

/**
 * Conversation store actions
 */
interface ConversationActions {
  /** Get messages for a specific runtime */
  getMessages: (runtimeId: string) => ChatMessage[];

  /** Set messages for a specific runtime */
  setMessages: (runtimeId: string, messages: ChatMessage[]) => void;

  /** Add a message to a specific runtime's conversation */
  addMessage: (runtimeId: string, message: ChatMessage) => void;

  /** Update a message in a specific runtime's conversation */
  updateMessage: (
    runtimeId: string,
    messageId: string,
    updates: Partial<ChatMessage>,
  ) => void;

  /** Clear messages for a specific runtime */
  clearMessages: (runtimeId: string) => void;

  /** Clear all conversations */
  clearAll: () => void;

  /** Mark a runtime as fetched from server */
  markFetched: (runtimeId: string) => void;

  /** Mark a runtime as currently fetching */
  setFetching: (runtimeId: string, isFetching: boolean) => void;

  /** Check if a runtime needs to fetch from server */
  needsFetch: (runtimeId: string) => boolean;

  /** Check if a runtime is currently fetching */
  isFetching: (runtimeId: string) => boolean;

  /** Delete a conversation for a specific runtime */
  deleteConversation: (runtimeId: string) => void;
}

/**
 * Combined store type
 */
export type ConversationStore = ConversationState & ConversationActions;

/**
 * Initial state
 */
const initialState: ConversationState = {
  conversations: {},
};

/**
 * Create the conversation store (in-memory only, no browser persistence)
 */
export const useConversationStore = create<ConversationStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...initialState,

      getMessages: (runtimeId: string) => {
        const conversation = get().conversations[runtimeId];
        return conversation?.messages || [];
      },

      setMessages: (runtimeId: string, messages: ChatMessage[]) => {
        set(
          state => ({
            conversations: {
              ...state.conversations,
              [runtimeId]: {
                runtimeId,
                messages,
                updatedAt: Date.now(),
                fetchedFromServer:
                  state.conversations[runtimeId]?.fetchedFromServer || false,
                isFetching: state.conversations[runtimeId]?.isFetching || false,
              },
            },
          }),
          false,
          'setMessages',
        );
      },

      addMessage: (runtimeId: string, message: ChatMessage) => {
        set(
          state => {
            const existing = state.conversations[runtimeId];
            const currentMessages = existing?.messages || [];
            return {
              conversations: {
                ...state.conversations,
                [runtimeId]: {
                  runtimeId,
                  messages: [...currentMessages, message],
                  updatedAt: Date.now(),
                  fetchedFromServer: existing?.fetchedFromServer || false,
                  isFetching: existing?.isFetching || false,
                },
              },
            };
          },
          false,
          'addMessage',
        );
      },

      updateMessage: (
        runtimeId: string,
        messageId: string,
        updates: Partial<ChatMessage>,
      ) => {
        set(
          state => {
            const existing = state.conversations[runtimeId];
            if (!existing) return state;

            return {
              conversations: {
                ...state.conversations,
                [runtimeId]: {
                  ...existing,
                  messages: existing.messages.map(msg =>
                    msg.id === messageId ? { ...msg, ...updates } : msg,
                  ),
                  updatedAt: Date.now(),
                },
              },
            };
          },
          false,
          'updateMessage',
        );
      },

      clearMessages: (runtimeId: string) => {
        set(
          state => {
            const existing = state.conversations[runtimeId];
            if (!existing) return state;

            return {
              conversations: {
                ...state.conversations,
                [runtimeId]: {
                  ...existing,
                  messages: [],
                  updatedAt: Date.now(),
                  // Reset fetch state so next mount will fetch fresh
                  fetchedFromServer: false,
                },
              },
            };
          },
          false,
          'clearMessages',
        );
      },

      clearAll: () => {
        set({ conversations: {} }, false, 'clearAll');
      },

      markFetched: (runtimeId: string) => {
        set(
          state => {
            const existing = state.conversations[runtimeId];
            return {
              conversations: {
                ...state.conversations,
                [runtimeId]: existing
                  ? { ...existing, fetchedFromServer: true, isFetching: false }
                  : {
                      runtimeId,
                      messages: [],
                      updatedAt: Date.now(),
                      fetchedFromServer: true,
                      isFetching: false,
                    },
              },
            };
          },
          false,
          'markFetched',
        );
      },

      setFetching: (runtimeId: string, isFetching: boolean) => {
        set(
          state => {
            const existing = state.conversations[runtimeId];
            return {
              conversations: {
                ...state.conversations,
                [runtimeId]: existing
                  ? { ...existing, isFetching }
                  : {
                      runtimeId,
                      messages: [],
                      updatedAt: Date.now(),
                      fetchedFromServer: false,
                      isFetching,
                    },
              },
            };
          },
          false,
          'setFetching',
        );
      },

      needsFetch: (runtimeId: string) => {
        const conversation = get().conversations[runtimeId];
        // Needs fetch if not yet fetched and not currently fetching
        return !conversation?.fetchedFromServer && !conversation?.isFetching;
      },

      isFetching: (runtimeId: string) => {
        return get().conversations[runtimeId]?.isFetching || false;
      },

      deleteConversation: (runtimeId: string) => {
        set(
          state => {
            const { [runtimeId]: _, ...remainingConversations } =
              state.conversations;
            return { conversations: remainingConversations };
          },
          false,
          'deleteConversation',
        );
      },
    })),
    { name: 'ConversationStore' },
  ),
);

/**
 * Hook to get messages for a specific runtime
 */
export const useConversationMessages = (runtimeId: string | undefined) => {
  return useConversationStore(state =>
    runtimeId ? state.conversations[runtimeId]?.messages || [] : [],
  );
};

/**
 * Hook to check if a runtime needs to fetch messages from server
 */
export const useNeedsFetch = (runtimeId: string | undefined) => {
  return useConversationStore(state =>
    runtimeId ? state.needsFetch(runtimeId) : false,
  );
};

/**
 * Hook to check if a runtime is currently fetching
 */
export const useIsFetching = (runtimeId: string | undefined) => {
  return useConversationStore(state =>
    runtimeId ? state.isFetching(runtimeId) : false,
  );
};
