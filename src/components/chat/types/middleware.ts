/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Middleware types for chat component.
 * Supports request/response interception and tool call middleware.
 *
 * @module components/chat/types/middleware
 */

import type { ChatMessage } from './message';
import type { ToolCallRequest, ToolExecutionResult } from './tool';
import type { InferenceRequestOptions, InferenceResponse } from './inference';

/**
 * Context passed to middleware functions
 */
export interface MiddlewareContext {
  /** Thread/conversation ID */
  threadId?: string;

  /** Run/request ID */
  runId?: string;

  /** Request URL */
  url?: string;

  /** Additional properties */
  properties?: Record<string, unknown>;
}

/**
 * Middleware for intercepting requests before they're sent
 */
export interface BeforeRequestMiddleware {
  name: string;

  /**
   * Called before a request is sent to the inference provider
   * Can modify messages, options, or abort the request
   */
  onBeforeRequest: (options: {
    messages: ChatMessage[];
    requestOptions: InferenceRequestOptions;
    context: MiddlewareContext;
  }) => Promise<{
    messages: ChatMessage[];
    requestOptions: InferenceRequestOptions;
    abort?: boolean;
    abortReason?: string;
  }>;
}

/**
 * Middleware for intercepting responses after they're received
 */
export interface AfterRequestMiddleware {
  name: string;

  /**
   * Called after a response is received from the inference provider
   * Can modify the response or perform side effects
   */
  onAfterRequest: (options: {
    inputMessages: ChatMessage[];
    outputMessages: ChatMessage[];
    response: InferenceResponse;
    context: MiddlewareContext;
  }) => Promise<{
    outputMessages: ChatMessage[];
    response: InferenceResponse;
  }>;
}

/**
 * Middleware for intercepting tool calls
 */
export interface ToolCallMiddleware {
  name: string;

  /**
   * Called before a tool is executed
   * Can modify args, approve/reject, or skip execution
   */
  onToolCall: (options: {
    toolCall: ToolCallRequest;
    context: MiddlewareContext;
  }) => Promise<{
    toolCall: ToolCallRequest;
    /** If true, proceed with execution */
    proceed: boolean;
    /** If false, use this result instead of executing */
    overrideResult?: ToolExecutionResult;
    /** Reason for rejection/override */
    reason?: string;
  }>;

  /**
   * Called after a tool is executed (optional)
   */
  onToolResult?: (options: {
    toolCall: ToolCallRequest;
    result: ToolExecutionResult;
    context: MiddlewareContext;
  }) => Promise<{
    result: ToolExecutionResult;
  }>;
}

/**
 * Error handling middleware
 */
export interface ErrorMiddleware {
  name: string;

  /**
   * Called when an error occurs during request/response cycle
   */
  onError: (options: {
    error: Error;
    phase: 'request' | 'response' | 'tool-execution' | 'stream';
    context: MiddlewareContext;
  }) => Promise<{
    /** If true, error is handled and should not propagate */
    handled: boolean;
    /** Optional replacement error */
    error?: Error;
    /** Optional recovery message to show user */
    recoveryMessage?: string;
  }>;
}

/**
 * Combined middleware definition
 */
export interface ChatMiddleware {
  name: string;
  priority?: number; // Lower numbers run first

  beforeRequest?: BeforeRequestMiddleware['onBeforeRequest'];
  afterRequest?: AfterRequestMiddleware['onAfterRequest'];
  onToolCall?: ToolCallMiddleware['onToolCall'];
  onToolResult?: ToolCallMiddleware['onToolResult'];
  onError?: ErrorMiddleware['onError'];
}

/**
 * Middleware pipeline configuration
 */
export interface MiddlewarePipelineConfig {
  /** Middlewares to use */
  middlewares: ChatMiddleware[];

  /** Whether to continue on middleware error */
  continueOnError?: boolean;

  /** Enable middleware logging */
  debug?: boolean;
}

/**
 * Built-in middleware names
 */
export type BuiltInMiddlewareName =
  | 'auth' // Add authentication headers
  | 'logging' // Log requests/responses
  | 'rate-limit' // Rate limiting
  | 'retry' // Retry failed requests
  | 'cache' // Cache responses
  | 'tool-approval' // Human-in-the-loop approval
  | 'analytics'; // Track usage analytics

/**
 * Helper to create a simple before-request middleware
 */
export function createBeforeRequestMiddleware(
  name: string,
  handler: BeforeRequestMiddleware['onBeforeRequest'],
): ChatMiddleware {
  return {
    name,
    beforeRequest: handler,
  };
}

/**
 * Helper to create a simple after-request middleware
 */
export function createAfterRequestMiddleware(
  name: string,
  handler: AfterRequestMiddleware['onAfterRequest'],
): ChatMiddleware {
  return {
    name,
    afterRequest: handler,
  };
}

/**
 * Helper to create a tool call middleware
 */
export function createToolCallMiddleware(
  name: string,
  onToolCall: ToolCallMiddleware['onToolCall'],
  onToolResult?: ToolCallMiddleware['onToolResult'],
): ChatMiddleware {
  return {
    name,
    onToolCall,
    onToolResult,
  };
}
