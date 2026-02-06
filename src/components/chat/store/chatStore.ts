/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Zustand store for chat state management.
 * Provides centralized state for messages, tools, config, and instances.
 * This is the primary state management - NO React Context/Provider needed.
 *
 * @module components/chat/store/chatStore
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type {
  ChatMessage,
  ChatThread,
  ToolRegistryEntry,
  ToolDefinition,
  ChatExtension,
  ExtensionRegistryEntry,
  ChatMiddleware,
  ToolCallStatus,
} from '../types';
import type { InferenceProvider } from '../types/inference';
import type { ProtocolAdapter } from '../types/protocol';
import type { ToolExecutor } from '../tools/ToolExecutor';
import type { MiddlewarePipeline } from '../middleware/MiddlewarePipeline';
import type { ExtensionRegistry } from '../extensions/ExtensionRegistry';

/**
 * Chat configuration options
 */
export interface ChatConfig {
  /** Default inference provider type */
  defaultProvider?: 'datalayer' | 'openai' | 'anthropic' | 'self-hosted';

  /** Default protocol type */
  defaultProtocol?: 'ag-ui' | 'a2a' | 'acp' | 'mcp-ui';

  /** API base URL for inference */
  apiBaseUrl?: string;

  /** API key for inference */
  apiKey?: string;

  /** Default model to use */
  defaultModel?: string;

  /** Enable tool approval by default */
  requireToolApproval?: boolean;

  /** Enable streaming by default */
  enableStreaming?: boolean;

  /** Enable debug logging */
  debug?: boolean;

  /** Session ID for persistence */
  sessionId?: string;

  /** Enable local storage persistence */
  persistToLocalStorage?: boolean;

  /** Custom headers for API requests */
  customHeaders?: Record<string, string>;
}

/**
 * Default configuration
 */
export const defaultChatConfig: ChatConfig = {
  defaultProvider: 'datalayer',
  defaultProtocol: 'ag-ui',
  enableStreaming: true,
  requireToolApproval: false,
  debug: false,
  persistToLocalStorage: false,
};

/**
 * Tool call tracking state
 */
export interface ToolCallState {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: ToolCallStatus;
  result?: unknown;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * Chat store state
 */
export interface ChatState {
  // === Configuration ===
  config: ChatConfig;
  ready: boolean;

  // === Instances (optional - for advanced use cases) ===
  inferenceProvider: InferenceProvider | null;
  protocolAdapter: ProtocolAdapter | null;
  toolExecutor: ToolExecutor | null;
  middlewarePipeline: MiddlewarePipeline | null;
  extensionRegistry: ExtensionRegistry | null;

  // === Messages ===
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  streamingMessageId: string | null;

  // === Thread management ===
  currentThreadId: string | null;
  threads: Map<string, ChatThread>;

  // === Tool registry ===
  tools: Map<string, ToolRegistryEntry>;
  pendingToolCalls: Map<string, ToolCallState>;

  // === Extension registry ===
  extensions: Map<string, ExtensionRegistryEntry>;

  // === Middleware ===
  middlewares: ChatMiddleware[];

  // === UI state ===
  isOpen: boolean;
  error: Error | null;
  suggestions: string[];
}

/**
 * Chat store actions
 */
export interface ChatActions {
  // === Configuration actions ===
  setConfig: (config: Partial<ChatConfig>) => void;
  setReady: (ready: boolean) => void;

  // === Instance actions ===
  setInferenceProvider: (provider: InferenceProvider | null) => void;
  setProtocolAdapter: (adapter: ProtocolAdapter | null) => void;
  setToolExecutor: (executor: ToolExecutor | null) => void;
  setMiddlewarePipeline: (pipeline: MiddlewarePipeline | null) => void;
  setExtensionRegistry: (registry: ExtensionRegistry | null) => void;

  // === Message actions ===
  addMessage: (message: ChatMessage) => void;
  updateMessage: (messageId: string, updates: Partial<ChatMessage>) => void;
  deleteMessage: (messageId: string) => void;
  setMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;

  // === Streaming actions ===
  startStreaming: (messageId: string) => void;
  appendToStream: (messageId: string, content: string) => void;
  stopStreaming: () => void;

  // === Loading state ===
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;

  // === Thread actions ===
  setCurrentThread: (threadId: string | null) => void;
  createThread: (title?: string) => string;
  deleteThread: (threadId: string) => void;

  // === Tool registry actions ===
  registerTool: (definition: ToolDefinition) => void;
  unregisterTool: (name: string) => void;
  getTool: (name: string) => ToolRegistryEntry | undefined;
  getTools: () => ToolDefinition[];

  // === Tool call tracking ===
  startToolCall: (
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) => void;
  updateToolCallStatus: (
    toolCallId: string,
    status: ToolCallStatus,
    result?: unknown,
    error?: string,
  ) => void;
  getPendingToolCalls: () => ToolCallState[];

  // === Extension registry actions ===
  registerExtension: (
    extension: ChatExtension,
    options?: { enabled?: boolean },
  ) => void;
  unregisterExtension: (name: string) => void;
  enableExtension: (name: string) => void;
  disableExtension: (name: string) => void;
  getExtensions: <T extends ChatExtension>(type?: T['type']) => T[];

  // === Middleware actions ===
  addMiddleware: (middleware: ChatMiddleware) => void;
  removeMiddleware: (name: string) => void;
  getMiddlewares: () => ChatMiddleware[];

  // === UI actions ===
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setSuggestions: (suggestions: string[]) => void;

  // === Reset ===
  reset: () => void;
}

/**
 * Combined store type
 */
export type ChatStore = ChatState & ChatActions;

/**
 * Initial state
 */
const initialState: ChatState = {
  config: defaultChatConfig,
  ready: true, // Ready by default - no provider initialization needed
  inferenceProvider: null,
  protocolAdapter: null,
  toolExecutor: null,
  middlewarePipeline: null,
  extensionRegistry: null,
  messages: [],
  isLoading: false,
  isStreaming: false,
  streamingMessageId: null,
  currentThreadId: null,
  threads: new Map(),
  tools: new Map(),
  pendingToolCalls: new Map(),
  extensions: new Map(),
  middlewares: [],
  isOpen: false,
  error: null,
  suggestions: [],
};

/**
 * Create the chat store
 */
export const useChatStore = create<ChatStore>()(
  devtools(
    subscribeWithSelector(
      // Note: persist middleware removed for now to avoid serialization issues with Map
      // Can be added back with custom serialization if needed
      (set, get) => ({
        ...initialState,

        // === Configuration actions ===
        setConfig: config => {
          set(
            state => ({
              config: { ...state.config, ...config },
            }),
            false,
            'setConfig',
          );
        },

        setReady: ready => {
          set({ ready }, false, 'setReady');
        },

        // === Instance actions ===
        setInferenceProvider: provider => {
          set({ inferenceProvider: provider }, false, 'setInferenceProvider');
        },

        setProtocolAdapter: adapter => {
          set({ protocolAdapter: adapter }, false, 'setProtocolAdapter');
        },

        setToolExecutor: executor => {
          set({ toolExecutor: executor }, false, 'setToolExecutor');
        },

        setMiddlewarePipeline: pipeline => {
          set({ middlewarePipeline: pipeline }, false, 'setMiddlewarePipeline');
        },

        setExtensionRegistry: registry => {
          set({ extensionRegistry: registry }, false, 'setExtensionRegistry');
        },

        // === Message actions ===
        addMessage: message => {
          set(
            state => ({
              messages: [...state.messages, message],
            }),
            false,
            'addMessage',
          );
        },

        updateMessage: (messageId, updates) => {
          set(
            state => ({
              messages: state.messages.map(msg =>
                msg.id === messageId ? { ...msg, ...updates } : msg,
              ),
            }),
            false,
            'updateMessage',
          );
        },

        deleteMessage: messageId => {
          set(
            state => ({
              messages: state.messages.filter(msg => msg.id !== messageId),
            }),
            false,
            'deleteMessage',
          );
        },

        setMessages: messages => {
          set({ messages }, false, 'setMessages');
        },

        clearMessages: () => {
          set({ messages: [] }, false, 'clearMessages');
        },

        // === Streaming actions ===
        startStreaming: messageId => {
          set(
            { isStreaming: true, streamingMessageId: messageId },
            false,
            'startStreaming',
          );
        },

        appendToStream: (messageId, content) => {
          set(
            state => ({
              messages: state.messages.map(msg =>
                msg.id === messageId
                  ? {
                      ...msg,
                      content:
                        typeof msg.content === 'string'
                          ? msg.content + content
                          : msg.content,
                    }
                  : msg,
              ),
            }),
            false,
            'appendToStream',
          );
        },

        stopStreaming: () => {
          set(
            { isStreaming: false, streamingMessageId: null },
            false,
            'stopStreaming',
          );
        },

        // === Loading state ===
        setLoading: loading => {
          set({ isLoading: loading }, false, 'setLoading');
        },

        setError: error => {
          set({ error }, false, 'setError');
        },

        // === Thread actions ===
        setCurrentThread: threadId => {
          set({ currentThreadId: threadId }, false, 'setCurrentThread');
        },

        createThread: title => {
          const threadId = `thread_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          const thread: ChatThread = {
            id: threadId,
            title: title || 'New Chat',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          set(
            state => {
              const newThreads = new Map(state.threads);
              newThreads.set(threadId, thread);
              return { threads: newThreads, currentThreadId: threadId };
            },
            false,
            'createThread',
          );
          return threadId;
        },

        deleteThread: threadId => {
          set(
            state => {
              const newThreads = new Map(state.threads);
              newThreads.delete(threadId);
              return {
                threads: newThreads,
                currentThreadId:
                  state.currentThreadId === threadId
                    ? null
                    : state.currentThreadId,
              };
            },
            false,
            'deleteThread',
          );
        },

        // === Tool registry actions ===
        registerTool: definition => {
          set(
            state => {
              const newTools = new Map(state.tools);
              newTools.set(definition.name, {
                definition,
                registeredAt: new Date(),
              });
              return { tools: newTools };
            },
            false,
            'registerTool',
          );
        },

        unregisterTool: name => {
          set(
            state => {
              const newTools = new Map(state.tools);
              newTools.delete(name);
              return { tools: newTools };
            },
            false,
            'unregisterTool',
          );
        },

        getTool: name => {
          return get().tools.get(name);
        },

        getTools: () => {
          return Array.from(get().tools.values()).map(
            entry => entry.definition,
          );
        },

        // === Tool call tracking ===
        startToolCall: (toolCallId, toolName, args) => {
          set(
            state => {
              const newPending = new Map(state.pendingToolCalls);
              newPending.set(toolCallId, {
                toolCallId,
                toolName,
                args,
                status: 'pending',
                startedAt: new Date(),
              });
              return { pendingToolCalls: newPending };
            },
            false,
            'startToolCall',
          );
        },

        updateToolCallStatus: (toolCallId, status, result, error) => {
          set(
            state => {
              const newPending = new Map(state.pendingToolCalls);
              const existing = newPending.get(toolCallId);
              if (existing) {
                newPending.set(toolCallId, {
                  ...existing,
                  status,
                  result,
                  error,
                  completedAt:
                    status === 'completed' || status === 'failed'
                      ? new Date()
                      : undefined,
                });
              }
              return { pendingToolCalls: newPending };
            },
            false,
            'updateToolCallStatus',
          );
        },

        getPendingToolCalls: () => {
          return Array.from(get().pendingToolCalls.values()).filter(
            tc => tc.status === 'pending' || tc.status === 'executing',
          );
        },

        // === Extension registry actions ===
        registerExtension: (extension, options) => {
          set(
            state => {
              const newExtensions = new Map(state.extensions);
              newExtensions.set(extension.name, {
                extension,
                enabled: options?.enabled ?? true,
                registeredAt: new Date(),
              });
              return { extensions: newExtensions };
            },
            false,
            'registerExtension',
          );
        },

        unregisterExtension: name => {
          set(
            state => {
              const newExtensions = new Map(state.extensions);
              newExtensions.delete(name);
              return { extensions: newExtensions };
            },
            false,
            'unregisterExtension',
          );
        },

        enableExtension: name => {
          set(
            state => {
              const newExtensions = new Map(state.extensions);
              const entry = newExtensions.get(name);
              if (entry) {
                newExtensions.set(name, { ...entry, enabled: true });
              }
              return { extensions: newExtensions };
            },
            false,
            'enableExtension',
          );
        },

        disableExtension: name => {
          set(
            state => {
              const newExtensions = new Map(state.extensions);
              const entry = newExtensions.get(name);
              if (entry) {
                newExtensions.set(name, { ...entry, enabled: false });
              }
              return { extensions: newExtensions };
            },
            false,
            'disableExtension',
          );
        },

        getExtensions: <T extends ChatExtension>(type?: T['type']): T[] => {
          const extensions = Array.from(get().extensions.values())
            .filter(entry => entry.enabled)
            .map(entry => entry.extension);

          if (type) {
            return extensions.filter(ext => ext.type === type) as T[];
          }
          return extensions as T[];
        },

        // === Middleware actions ===
        addMiddleware: middleware => {
          set(
            state => ({
              middlewares: [...state.middlewares, middleware].sort(
                (a, b) => (a.priority ?? 100) - (b.priority ?? 100),
              ),
            }),
            false,
            'addMiddleware',
          );
        },

        removeMiddleware: name => {
          set(
            state => ({
              middlewares: state.middlewares.filter(m => m.name !== name),
            }),
            false,
            'removeMiddleware',
          );
        },

        getMiddlewares: () => {
          return get().middlewares;
        },

        // === UI actions ===
        setOpen: open => {
          set({ isOpen: open }, false, 'setOpen');
        },

        toggleOpen: () => {
          set(state => ({ isOpen: !state.isOpen }), false, 'toggleOpen');
        },

        setSuggestions: suggestions => {
          set({ suggestions }, false, 'setSuggestions');
        },

        // === Reset ===
        reset: () => {
          set(initialState, false, 'reset');
        },
      }),
    ),
    { name: 'chat-store' },
  ),
);

/**
 * Selector hooks for specific state slices
 */
export const useChatMessages = () => useChatStore(state => state.messages);
export const useChatLoading = () => useChatStore(state => state.isLoading);
export const useChatStreaming = () =>
  useChatStore(state => ({
    isStreaming: state.isStreaming,
    streamingMessageId: state.streamingMessageId,
  }));
export const useChatError = () => useChatStore(state => state.error);
export const useChatTools = () => useChatStore(state => state.getTools());
export const useChatOpen = () => useChatStore(state => state.isOpen);
export const useChatConfig = () => useChatStore(state => state.config);
export const useChatReady = () => useChatStore(state => state.ready);
export const useChatInferenceProvider = () =>
  useChatStore(state => state.inferenceProvider);
export const useChatExtensionRegistry = () =>
  useChatStore(state => state.extensionRegistry);
