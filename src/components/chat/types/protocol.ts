/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Protocol adapter types for chat component.
 * Supports AG-UI (SSE), A2A (SSE), ACP (WebSocket), MCP-UI.
 *
 * @module components/chat/types/protocol
 */

import type { ChatMessage } from './message';
import type {
  ToolDefinition,
  ToolCallRequest,
  ToolExecutionResult,
} from './tool';

/**
 * Supported transport types (communication transports)
 */
export type TransportType = 'ag-ui' | 'a2a' | 'acp' | 'vercel-ai';

/**
 * UI format for interactive elements
 */
export type Extension = 'mcp-ui' | 'a2ui';

/**
 * Protocol transport mechanism
 */
export type ProtocolTransport = 'sse' | 'websocket' | 'http';

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
 * Transport adapter configuration
 */
export interface ProtocolAdapterConfig {
  /** Transport type */
  type: TransportType;

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
  | 'error';

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
 * Callback for handling protocol events
 */
export type ProtocolEventHandler = (event: ProtocolEvent) => void;

/**
 * Agent card for A2A protocol
 */
export interface AgentCard {
  name: string;
  description?: string;
  url: string;
  version?: string;
  capabilities?: {
    streaming?: boolean;
    extensions?: string[];
  };
  skills?: Array<{
    id: string;
    name: string;
    description?: string;
    examples?: string[];
  }>;
}

/**
 * Abstract protocol adapter interface
 */
export interface ProtocolAdapter {
  /** Transport type */
  readonly type: TransportType;

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

/**
 * AG-UI specific types
 */
export namespace AGUI {
  export interface RunAgentInput {
    threadId: string;
    runId: string;
    messages: ChatMessage[];
    state: Record<string, unknown> | null;
    tools: ToolDefinition[];
    context: Array<{ type: string; content: string }>;
    forwardedProps: Record<string, unknown> | null;
    /** Optional model override for per-request model selection */
    model?: string;
  }

  export interface Event {
    type: string;
    data?: unknown;
  }
}

/**
 * A2A specific types
 */
export namespace A2A {
  export interface Task {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    messages: ChatMessage[];
    result?: unknown;
  }

  export interface Message {
    role: string;
    parts: Array<{
      type: string;
      text?: string;
      data?: unknown;
    }>;
  }
}

/**
 * ACP specific types (WebSocket-based)
 */
export namespace ACP {
  export interface JsonRpcRequest {
    jsonrpc: '2.0';
    method: string;
    params?: unknown;
    id: string | number;
  }

  export interface JsonRpcResponse {
    jsonrpc: '2.0';
    result?: unknown;
    error?: {
      code: number;
      message: string;
      data?: unknown;
    };
    id: string | number;
  }
}
