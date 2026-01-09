/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Converts unified tool definitions to agent-runtimes ChatFloating tools format.
 *
 * This adapter enables integration with the ChatFloating component's built-in
 * tool handling via the AG-UI protocol.
 *
 * @module tools/adapters/agent-runtimes/AgentRuntimesToolAdapter
 */

import type {
  ToolDefinition,
  ToolOperation,
  ToolExecutionContext,
} from '@datalayer/jupyter-react';
import { OperationRunner } from '@datalayer/jupyter-react';

/**
 * Agent-runtimes tool definition (matches ChatFloating tools prop)
 */
export interface AgentRuntimesTool {
  /** Tool name */
  name: string;

  /** Description for AI model */
  description: string;

  /** Parameters (JSON Schema format) */
  parameters?: Record<string, unknown>;

  /** Handler function */
  handler: (args: unknown) => Promise<unknown>;
}

/**
 * Deduplication cache to prevent executing the same operation multiple times
 * Maps operation signature (hash of tool + params) to timestamp
 */
const executionCache = new Map<string, number>();
const CACHE_TTL_MS = 2000; // 2 seconds - operations within this window are considered duplicates

/**
 * Generate a unique signature for an operation call
 */
function getOperationSignature(toolName: string, params: unknown): string {
  return `${toolName}:${JSON.stringify(params)}`;
}

/**
 * Check if this operation was recently executed
 */
function isRecentDuplicate(toolName: string, params: unknown): boolean {
  const signature = getOperationSignature(toolName, params);
  const lastExecution = executionCache.get(signature);

  if (lastExecution) {
    const timeSinceExecution = Date.now() - lastExecution;
    if (timeSinceExecution < CACHE_TTL_MS) {
      console.log(
        `[agent-runtimes] 🚫 DUPLICATE DETECTED - Skipping execution (${timeSinceExecution}ms since last call)`,
      );
      return true;
    }
  }

  // Clean up old entries while we're here
  for (const [key, timestamp] of executionCache.entries()) {
    if (Date.now() - timestamp > CACHE_TTL_MS * 2) {
      executionCache.delete(key);
    }
  }

  // Mark this execution
  executionCache.set(signature, Date.now());
  return false;
}

/**
 * Converts unified tool definition to agent-runtimes tool format
 *
 * @param definition - Tool definition
 * @param operation - Core operation
 * @param context - Execution context (documentId + executor)
 * @returns Agent-runtimes tool
 */
export function createAgentRuntimesTool(
  definition: ToolDefinition,
  operation: ToolOperation<unknown, unknown>,
  context: ToolExecutionContext,
): AgentRuntimesTool {
  // Create runner instance for this tool
  const runner = new OperationRunner();

  return {
    name: definition.toolReferenceName || definition.name,
    description: definition.description,
    parameters: definition.parameters,

    handler: async (params: unknown): Promise<unknown> => {
      console.log(`[agent-runtimes] ========== HANDLER CALLED ==========`);
      console.log(`[agent-runtimes] Tool: ${definition.name}`);
      console.log(`[agent-runtimes] Operation: ${definition.operation}`);
      console.log(`[agent-runtimes] Params:`, params);

      // Check for duplicate execution
      if (isRecentDuplicate(definition.name, params)) {
        console.log(`[agent-runtimes] 🚫 DUPLICATE DETECTED - Returning early`);
        return {
          success: false,
          message: 'Operation already executed recently (duplicate detected)',
        };
      }

      try {
        // Use OperationRunner to execute operation with TOON format
        const result = await runner.execute(operation, params, {
          ...context,
          format: 'toon', // Return human/LLM-readable string
        });

        console.log(`[agent-runtimes] Operation result:`, result);
        return result;
      } catch (error) {
        console.error(`[agent-runtimes] ❌ ERROR in handler:`, error);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  };
}

/**
 * Creates agent-runtimes tools from all tool definitions
 *
 * @param definitions - Tool definitions
 * @param operations - Core operations registry
 * @param context - Execution context (documentId + executor)
 * @returns Agent-runtimes tools array
 */
export function createAllAgentRuntimesTools(
  definitions: ToolDefinition[],
  operations: Record<string, ToolOperation<unknown, unknown>>,
  context: ToolExecutionContext,
): AgentRuntimesTool[] {
  const tools: AgentRuntimesTool[] = [];

  for (const definition of definitions) {
    const operation = operations[definition.operation];

    if (!operation) {
      console.warn(
        `[agent-runtimes Tools] No operation found for ${definition.name} (operation: ${definition.operation})`,
      );
      continue;
    }

    const tool = createAgentRuntimesTool(definition, operation, context);
    tools.push(tool);
  }

  console.log(
    `[agent-runtimes Tools] Created ${tools.length} agent-runtimes tools`,
  );

  return tools;
}
