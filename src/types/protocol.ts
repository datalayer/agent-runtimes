/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Protocol adapter types for chat component.
 * Supports AG-UI (SSE), A2A (SSE), ACP (WebSocket), MCP-UI.
 *
 * @module types/protocol
 */

import { AgentCard } from './a2a';
import type { ChatMessage } from './message';
import type {
  ToolDefinition,
  ToolCallRequest,
  ToolExecutionResult,
} from './tools';

/**
 * Supported protocol (communication protocols with agent backends)
 */
export type Protocol = 'ag-ui' | 'a2a' | 'acp' | 'vercel-ai';

/**
 * Protocol connection state
 */
export type ProtocolConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'reconnecting';

/**
 * Protocol transport mechanism
 */
export type ProtocolTransport = 'sse' | 'websocket' | 'http';

/**
 * UI format for interactive elements
 */
export type Extension = 'mcp-ui' | 'a2ui';

/**
 * Transport adapter configuration
 */
export interface ProtocolAdapterConfig {
  /** Transport type */
  protocol: Protocol;

  /** Base URL for the protocol endpoint */
  baseUrl: string;

  /** Authentication token/key */
  authToken?: string;

  /** Agent ID or name */
  agentId?: string;

  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;

  /** Reconnect delay in milliseconds */
  reconnectDelay?: number;

  /** Max reconnection attempts */
  maxReconnectAttempts?: number;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Additional protocol-specific options */
  options?: Record<string, unknown>;
}

/**
 * Token usage statistics from a protocol event
 */
export interface ProtocolUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
}

/**
 * Protocol event
 */
export interface ProtocolEvent {
  type: ProtocolEventType;
  data?: unknown;
  message?: ChatMessage;
  toolCall?: ToolCallRequest;
  toolResult?: ToolExecutionResult;
  activity?: {
    type: string;
    data: unknown;
  };
  /** Token usage for this event (emitted on finish/run-complete events) */
  usage?: ProtocolUsage;
  error?: Error;
  timestamp: Date;
}

/**
 * Protocol event types
 */
export type ProtocolEventType =
  | 'connected'
  | 'disconnected'
  | 'message'
  | 'tool-call'
  | 'tool-result'
  | 'activity'
  | 'state-update'
  | 'done'
  | 'error';

/**
 * Callback for handling protocol events
 */
export type ProtocolEventHandler = (event: ProtocolEvent) => void;

/**
 * Abstract protocol adapter interface
 */
export interface ProtocolAdapter {
  /** Transport type */
  readonly type: Protocol;

  /** Transport mechanism used */
  readonly transport: ProtocolTransport;

  /** Current connection state */
  readonly connectionState: ProtocolConnectionState;

  /**
   * Connect to the protocol endpoint
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the endpoint
   */
  disconnect(): void;

  /**
   * Send a message through the protocol
   */
  sendMessage(
    message: ChatMessage,
    options?: {
      tools?: ToolDefinition[];
      threadId?: string;
      metadata?: Record<string, unknown>;
      /** Full conversation history to send with the message */
      messages?: ChatMessage[];
      /** Model to use for this request (overrides agent default) */
      model?: string;
      /** Built-in MCP tool names to enable */
      builtinTools?: string[];
      /** Skill IDs to enable */
      skills?: string[];
      /** Connected identity tokens to pass to backend for tool execution */
      identities?: Array<{
        provider: string;
        accessToken: string;
      }>;
    },
  ): Promise<void>;

  /**
   * Send tool execution result back
   */
  sendToolResult(
    toolCallId: string,
    result: ToolExecutionResult,
  ): Promise<void>;

  /**
   * Subscribe to protocol events
   */
  subscribe(handler: ProtocolEventHandler): () => void;

  /**
   * Get agent card (for A2A protocol)
   */
  getAgentCard?(): Promise<AgentCard | null>;

  /**
   * Check if protocol supports a specific feature
   */
  supportsFeature(feature: string): boolean;
}

/**
 * Factory function type for creating protocol adapters
 */
export type ProtocolAdapterFactory = (
  config: ProtocolAdapterConfig,
) => ProtocolAdapter;

/**
 * Protocol-specific message format converters
 */
export interface ProtocolMessageConverter {
  /** Convert internal message to protocol format */
  toProtocol(message: ChatMessage): unknown;

  /** Convert protocol message to internal format */
  fromProtocol(data: unknown): ChatMessage | null;
}
