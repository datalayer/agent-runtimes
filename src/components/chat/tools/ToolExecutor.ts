/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Tool executor for hybrid tool execution (frontend + backend).
 * Handles routing tool calls to appropriate execution location.
 *
 * @module components/chat/tools/ToolExecutor
 */

import type {
  ToolDefinition,
  FrontendToolDefinition,
  ToolCallRequest,
  ToolExecutionResult,
  ToolRenderStatus,
} from '../types/tool';
import type { InferenceProvider } from '../types/inference';
import { hasHitlRender } from '../types/tool';

/**
 * Execution context for tool calls
 */
export interface ToolExecutionContext {
  /** Tool registry for looking up definitions */
  getToolDefinition: (name: string) => ToolDefinition | undefined;

  /** Inference provider for backend tool execution */
  inferenceProvider?: InferenceProvider;

  /** Callback for HITL approval (returns approved result or null if rejected) */
  onHitlRequired?: (
    toolCall: ToolCallRequest,
    definition: FrontendToolDefinition,
  ) => Promise<unknown | null>;

  /** Callback for status updates */
  onStatusChange?: (
    toolCallId: string,
    status: ToolRenderStatus,
    result?: unknown,
    error?: string,
  ) => void;
}

/**
 * Tool executor handles routing and executing tool calls
 */
export class ToolExecutor {
  private context: ToolExecutionContext;

  constructor(context: ToolExecutionContext) {
    this.context = context;
  }

  /**
   * Execute a tool call
   * Routes to frontend or backend based on tool definition
   */
  async execute(toolCall: ToolCallRequest): Promise<ToolExecutionResult> {
    const { toolCallId, toolName } = toolCall;
    const definition = this.context.getToolDefinition(toolName);

    if (!definition) {
      return {
        success: false,
        error: `Tool "${toolName}" not found in registry`,
      };
    }

    // Determine execution location (default to frontend if not specified)
    const location = definition.location || 'frontend';

    this.context.onStatusChange?.(toolCallId, 'executing');

    try {
      let result: ToolExecutionResult;

      if (location === 'backend') {
        result = await this.executeBackend(toolCall, definition);
      } else {
        result = await this.executeFrontend(
          toolCall,
          definition as FrontendToolDefinition,
        );
      }

      this.context.onStatusChange?.(
        toolCallId,
        result.success ? 'complete' : 'failed',
        result.result,
        result.error,
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.context.onStatusChange?.(
        toolCallId,
        'failed',
        undefined,
        errorMessage,
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute a frontend tool
   */
  private async executeFrontend(
    toolCall: ToolCallRequest,
    definition: FrontendToolDefinition,
  ): Promise<ToolExecutionResult> {
    const { args } = toolCall;
    const startTime = Date.now();

    // Check for HITL (Human-in-the-Loop) requirement
    if (hasHitlRender(definition) && this.context.onHitlRequired) {
      const hitlResult = await this.context.onHitlRequired(
        toolCall,
        definition,
      );

      if (hitlResult === null) {
        return {
          success: false,
          error: 'Tool call was rejected by user',
        };
      }

      return {
        success: true,
        result: hitlResult,
        executionTime: Date.now() - startTime,
      };
    }

    // Check if handler is defined
    if (!definition.handler) {
      return {
        success: false,
        error: `Frontend tool "${definition.name}" has no handler defined`,
      };
    }

    // Execute the handler
    try {
      const result = await definition.handler(args);
      return {
        success: true,
        result,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a backend tool
   */
  private async executeBackend(
    toolCall: ToolCallRequest,
    _definition: ToolDefinition,
  ): Promise<ToolExecutionResult> {
    const { toolName, args } = toolCall;

    if (!this.context.inferenceProvider) {
      return {
        success: false,
        error: 'No inference provider configured for backend tool execution',
      };
    }

    if (!this.context.inferenceProvider.executeBackendTool) {
      return {
        success: false,
        error: `Inference provider "${this.context.inferenceProvider.name}" does not support backend tool execution`,
      };
    }

    return this.context.inferenceProvider.executeBackendTool(toolName, args);
  }

  /**
   * Execute multiple tool calls in parallel
   */
  async executeMultiple(
    toolCalls: ToolCallRequest[],
  ): Promise<Map<string, ToolExecutionResult>> {
    const results = new Map<string, ToolExecutionResult>();

    // Group by execution location for optimization
    const frontendCalls: ToolCallRequest[] = [];
    const backendCalls: ToolCallRequest[] = [];

    for (const toolCall of toolCalls) {
      const definition = this.context.getToolDefinition(toolCall.toolName);
      const location = definition?.location || 'frontend';

      if (location === 'backend') {
        backendCalls.push(toolCall);
      } else {
        frontendCalls.push(toolCall);
      }
    }

    // Execute frontend calls in parallel
    const frontendPromises = frontendCalls.map(async tc => {
      const result = await this.execute(tc);
      results.set(tc.toolCallId, result);
    });

    // Execute backend calls (could be batched in future)
    const backendPromises = backendCalls.map(async tc => {
      const result = await this.execute(tc);
      results.set(tc.toolCallId, result);
    });

    await Promise.all([...frontendPromises, ...backendPromises]);

    return results;
  }
}

/**
 * Create a tool executor with the given context
 */
export function createToolExecutor(
  context: ToolExecutionContext,
): ToolExecutor {
  return new ToolExecutor(context);
}
