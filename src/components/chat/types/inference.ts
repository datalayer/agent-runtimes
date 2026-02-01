/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Inference provider types for chat component.
 * Supports multiple backends: Datalayer, OpenAI, Anthropic, self-hosted.
 *
 * @module components/chat/types/inference
 */

import type { ChatMessage, ChatMessageDelta } from './message';
import type {
  ToolDefinition,
  ToolCallRequest,
  ToolExecutionResult,
} from './tool';

/**
 * Type alias for MCP server identifier
 */
export type McpId = string;

/**
 * Type alias for MCP server origin
 */
export type McpOrigin = 'config' | 'catalog';

/**
 * MCP Server selection - identifies a specific MCP server by ID and origin
 */
export interface McpServerSelection {
  /** Unique identifier of the MCP server */
  id: McpId;
  /** Origin of the server (config from mcp.json, catalog from built-in) */
  origin: McpOrigin;
}

/**
 * Inference provider configuration
 */
export interface InferenceProviderConfig {
  /** API key for authentication */
  apiKey?: string;

  /** Base URL for API requests */
  baseUrl?: string;

  /** Model to use for inference */
  model?: string;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Additional provider-specific options */
  options?: Record<string, unknown>;
}

/**
 * Request options for sending messages
 */
export interface InferenceRequestOptions {
  /** System prompt / instructions */
  instructions?: string;

  /** Temperature for response generation */
  temperature?: number;

  /** Maximum tokens to generate */
  maxTokens?: number;

  /** Tools available for the LLM */
  tools?: ToolDefinition[];

  /** Abort signal for cancellation */
  signal?: AbortSignal;

  /** Thread/conversation ID */
  threadId?: string;

  /** Agent name for multi-agent scenarios */
  agentName?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Response from inference provider
 */
export interface InferenceResponse {
  /** Generated message */
  message: ChatMessage;

  /** Usage statistics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  /** Finish reason */
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
}

/**
 * Streaming event types
 */
export type StreamEventType =
  | 'message-start'
  | 'content-delta'
  | 'tool-call-start'
  | 'tool-call-delta'
  | 'tool-call-end'
  | 'message-end'
  | 'error';

/**
 * Streaming event
 */
export interface StreamEvent {
  type: StreamEventType;
  messageId?: string;
  delta?: ChatMessageDelta;
  toolCall?: ToolCallRequest;
  error?: Error;
  finishReason?: string;
}

/**
 * Callback for handling stream events
 */
export type StreamEventHandler = (event: StreamEvent) => void;

/**
 * Abstract inference provider interface
 */
export interface InferenceProvider {
  /** Provider name for identification */
  readonly name: string;

  /**
   * Send a message and get a response (non-streaming)
   */
  sendMessage(
    messages: ChatMessage[],
    options?: InferenceRequestOptions,
  ): Promise<InferenceResponse>;

  /**
   * Send a message with streaming response
   */
  streamMessage(
    messages: ChatMessage[],
    options?: InferenceRequestOptions,
    onEvent?: StreamEventHandler,
  ): Promise<InferenceResponse>;

  /**
   * Cancel an ongoing request
   */
  cancelRequest(requestId?: string): void;

  /**
   * Execute a backend tool (for hybrid execution)
   */
  executeBackendTool?(
    toolName: string,
    args: Record<string, unknown>,
    options?: InferenceRequestOptions,
  ): Promise<ToolExecutionResult>;

  /**
   * Check if provider is available/configured
   */
  isAvailable(): boolean;

  /**
   * Get provider configuration
   */
  getConfig(): InferenceProviderConfig;
}

/**
 * Factory function type for creating inference providers
 */
export type InferenceProviderFactory = (
  config: InferenceProviderConfig,
) => InferenceProvider;

/**
 * Provider type identifiers
 */
export type InferenceProviderType =
  | 'datalayer'
  | 'openai'
  | 'anthropic'
  | 'self-hosted'
  | 'copilotkit';
