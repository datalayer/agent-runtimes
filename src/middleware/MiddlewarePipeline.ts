/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Middleware pipeline for chat component.
 * Provides hooks for intercepting and modifying chat operations.
 *
 * @module components/chat/middleware/MiddlewarePipeline
 */

import type {
  ChatMiddleware,
  MiddlewareContext,
  BeforeRequestMiddleware,
  AfterRequestMiddleware,
  ToolCallMiddleware,
  ErrorMiddleware,
} from '../types/middleware';
import type { ChatMessage } from '../types/message';
import type {
  ToolDefinition,
  ToolCallRequest,
  ToolExecutionResult,
} from '../types/tool';
import type {
  InferenceRequestOptions,
  InferenceResponse,
} from '../types/inference';

/**
 * Request context for before-request middleware
 */
export interface RequestContext {
  /** Messages being sent */
  messages: ChatMessage[];

  /** Request options */
  requestOptions: InferenceRequestOptions;

  /** Middleware context */
  context: MiddlewareContext;

  /** Available tools */
  tools?: ToolDefinition[];

  /** Whether request should be aborted */
  abort?: boolean;

  /** Abort reason */
  abortReason?: string;
}

/**
 * Response context for after-request middleware
 */
export interface ResponseContext {
  /** Input messages */
  inputMessages: ChatMessage[];

  /** Output messages */
  outputMessages: ChatMessage[];

  /** Response from inference provider */
  response: InferenceResponse;

  /** Middleware context */
  context: MiddlewareContext;
}

/**
 * Middleware pipeline class
 */
export class MiddlewarePipeline {
  private middlewares: ChatMiddleware[] = [];

  /**
   * Add middleware to the pipeline
   */
  use(middleware: ChatMiddleware): void {
    this.middlewares.push(middleware);
    // Sort by priority (lower = first)
    this.middlewares.sort((a, b) => (a.priority || 0) - (b.priority || 0));
  }

  /**
   * Remove middleware from the pipeline
   */
  remove(middlewareName: string): void {
    this.middlewares = this.middlewares.filter(m => m.name !== middlewareName);
  }

  /**
   * Get all registered middlewares
   */
  getAll(): ChatMiddleware[] {
    return [...this.middlewares];
  }

  /**
   * Run before-request hooks
   */
  async runBeforeRequest(
    messages: ChatMessage[],
    requestOptions: InferenceRequestOptions,
    context: MiddlewareContext,
  ): Promise<{
    messages: ChatMessage[];
    requestOptions: InferenceRequestOptions;
    abort?: boolean;
    abortReason?: string;
  }> {
    let currentMessages = messages;
    let currentOptions = requestOptions;

    for (const middleware of this.middlewares) {
      if (!middleware.beforeRequest) {
        continue;
      }

      try {
        const result = await middleware.beforeRequest({
          messages: currentMessages,
          requestOptions: currentOptions,
          context,
        });

        currentMessages = result.messages;
        currentOptions = result.requestOptions;

        if (result.abort) {
          return {
            messages: currentMessages,
            requestOptions: currentOptions,
            abort: true,
            abortReason:
              result.abortReason || `Aborted by middleware: ${middleware.name}`,
          };
        }
      } catch (error) {
        console.error(
          `[Middleware:${middleware.name}] beforeRequest error:`,
          error,
        );

        // Run error hooks
        await this.runOnError(
          error instanceof Error ? error : new Error(String(error)),
          'request',
          context,
        );
      }
    }

    return { messages: currentMessages, requestOptions: currentOptions };
  }

  /**
   * Run after-request hooks
   */
  async runAfterRequest(
    inputMessages: ChatMessage[],
    outputMessages: ChatMessage[],
    response: InferenceResponse,
    context: MiddlewareContext,
  ): Promise<{
    outputMessages: ChatMessage[];
    response: InferenceResponse;
  }> {
    let currentOutputMessages = outputMessages;
    let currentResponse = response;

    for (const middleware of this.middlewares) {
      if (!middleware.afterRequest) {
        continue;
      }

      try {
        const result = await middleware.afterRequest({
          inputMessages,
          outputMessages: currentOutputMessages,
          response: currentResponse,
          context,
        });

        currentOutputMessages = result.outputMessages;
        currentResponse = result.response;
      } catch (error) {
        console.error(
          `[Middleware:${middleware.name}] afterRequest error:`,
          error,
        );

        await this.runOnError(
          error instanceof Error ? error : new Error(String(error)),
          'response',
          context,
        );
      }
    }

    return { outputMessages: currentOutputMessages, response: currentResponse };
  }

  /**
   * Run tool call hooks
   */
  async runOnToolCall(
    toolCall: ToolCallRequest,
    context: MiddlewareContext,
  ): Promise<{
    toolCall: ToolCallRequest;
    proceed: boolean;
    overrideResult?: ToolExecutionResult;
    reason?: string;
  }> {
    let currentToolCall = toolCall;

    for (const middleware of this.middlewares) {
      if (!middleware.onToolCall) {
        continue;
      }

      try {
        const result = await middleware.onToolCall({
          toolCall: currentToolCall,
          context,
        });

        currentToolCall = result.toolCall;

        if (!result.proceed) {
          return {
            toolCall: currentToolCall,
            proceed: false,
            overrideResult: result.overrideResult,
            reason: result.reason || `Denied by middleware: ${middleware.name}`,
          };
        }
      } catch (error) {
        console.error(
          `[Middleware:${middleware.name}] onToolCall error:`,
          error,
        );
        return {
          toolCall: currentToolCall,
          proceed: false,
          reason: `Error in middleware: ${middleware.name}`,
        };
      }
    }

    return { toolCall: currentToolCall, proceed: true };
  }

  /**
   * Run tool result hooks
   */
  async runOnToolResult(
    toolCall: ToolCallRequest,
    result: ToolExecutionResult,
    context: MiddlewareContext,
  ): Promise<ToolExecutionResult> {
    let currentResult = result;

    for (const middleware of this.middlewares) {
      if (!middleware.onToolResult) {
        continue;
      }

      try {
        const middlewareResult = await middleware.onToolResult({
          toolCall,
          result: currentResult,
          context,
        });

        currentResult = middlewareResult.result;
      } catch (error) {
        console.error(
          `[Middleware:${middleware.name}] onToolResult error:`,
          error,
        );
      }
    }

    return currentResult;
  }

  /**
   * Run error hooks
   */
  async runOnError(
    error: Error,
    phase: 'request' | 'response' | 'tool-execution' | 'stream',
    context: MiddlewareContext,
  ): Promise<{
    handled: boolean;
    error?: Error;
    recoveryMessage?: string;
  }> {
    let handled = false;
    let modifiedError: Error | undefined;
    let recoveryMessage: string | undefined;

    for (const middleware of this.middlewares) {
      if (!middleware.onError) {
        continue;
      }

      try {
        const result = await middleware.onError({
          error: modifiedError || error,
          phase,
          context,
        });

        if (result.handled) {
          handled = true;
          modifiedError = result.error;
          recoveryMessage = result.recoveryMessage;
          break;
        }

        if (result.error) {
          modifiedError = result.error;
        }
      } catch (middlewareError) {
        console.error(
          `[Middleware:${middleware.name}] onError error:`,
          middlewareError,
        );
      }
    }

    return { handled, error: modifiedError, recoveryMessage };
  }
}

/**
 * Create a middleware with convenience defaults
 */
export function createMiddleware(
  name: string,
  handlers: {
    beforeRequest?: BeforeRequestMiddleware['onBeforeRequest'];
    afterRequest?: AfterRequestMiddleware['onAfterRequest'];
    onToolCall?: ToolCallMiddleware['onToolCall'];
    onToolResult?: ToolCallMiddleware['onToolResult'];
    onError?: ErrorMiddleware['onError'];
  },
  options?: {
    priority?: number;
  },
): ChatMiddleware {
  return {
    name,
    priority: options?.priority ?? 0,
    ...handlers,
  };
}

/**
 * Logging middleware - logs all chat operations (use console.warn for logging)
 */
export const loggingMiddleware = createMiddleware(
  'logging',
  {
    beforeRequest: async ({ messages, requestOptions, context }) => {
      console.warn('[Chat] Request:', {
        messageCount: messages.length,
        threadId: context.threadId,
      });
      return { messages, requestOptions };
    },
    afterRequest: async ({
      inputMessages,
      outputMessages,
      response,
      context,
    }) => {
      console.warn('[Chat] Response:', {
        inputCount: inputMessages.length,
        outputCount: outputMessages.length,
        threadId: context.threadId,
      });
      return { outputMessages, response };
    },
    onToolCall: async ({ toolCall, context }) => {
      console.warn('[Chat] Tool call:', {
        toolName: toolCall.toolName,
        threadId: context.threadId,
      });
      return { toolCall, proceed: true };
    },
    onToolResult: async ({ toolCall, result }) => {
      console.warn('[Chat] Tool result:', {
        toolName: toolCall.toolName,
        success: result.success,
      });
      return { result };
    },
    onError: async ({ error, phase }) => {
      console.error('[Chat] Error:', {
        phase,
        error: error.message,
      });
      return { handled: false };
    },
  },
  { priority: 100 }, // Run last (higher number = later)
);

/**
 * HITL (Human-in-the-Loop) middleware - requires approval for dangerous tools
 */
export function createHITLMiddleware(
  dangerousTools: string[],
  onApprovalRequired: (context: {
    toolName: string;
    args: Record<string, unknown>;
  }) => Promise<boolean>,
): ChatMiddleware {
  return createMiddleware(
    'hitl',
    {
      onToolCall: async ({ toolCall, context: _context }) => {
        if (dangerousTools.includes(toolCall.toolName)) {
          const approved = await onApprovalRequired({
            toolName: toolCall.toolName,
            args: toolCall.args,
          });

          return {
            toolCall,
            proceed: approved,
            reason: approved ? undefined : 'User denied tool execution',
          };
        }

        return { toolCall, proceed: true };
      },
    },
    { priority: 0 }, // Run early (lower number = earlier)
  );
}
