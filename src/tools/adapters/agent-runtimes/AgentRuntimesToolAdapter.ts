/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Converts unified tool definitions to FrontendToolDefinition format
 * for use with Chat, ChatFloating, and ChatBase components.
 *
 * This adapter enables integration with the chat components' frontendTools prop
 * via the AG-UI protocol.
 *
 * @module tools/adapters/agent-runtimes/AgentRuntimesToolAdapter
 */

import type {
  ToolDefinition,
  ToolOperation,
  ToolExecutionContext,
} from '@datalayer/reactor/tools';
import { OperationRunner } from '@datalayer/reactor/tools';
import type {
  FrontendToolDefinition,
  ToolStreamEvent,
} from '../../../types/tools';
import { frontendToolName } from '../../frontendToolNames';

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
 * Process parameters to handle JSON strings that should be objects
 * LLMs sometimes generate JSON strings instead of objects for nested parameters
 */
function processParameters(params: unknown): unknown {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return params;
  }

  const processed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    // If value is a string that looks like JSON, try to parse it
    if (
      typeof value === 'string' &&
      (value.startsWith('{') || value.startsWith('['))
    ) {
      try {
        processed[key] = JSON.parse(value);
      } catch {
        // If parsing fails, keep the original string
        processed[key] = value;
      }
    } else {
      processed[key] = value;
    }
  }

  return processed;
}

/**
 * Converts unified tool definition to FrontendToolDefinition format
 *
 * @param definition - Tool definition
 * @param operation - Core operation
 * @param context - Execution context (documentId + executor)
 * @returns FrontendToolDefinition
 */
export function createAgentRuntimesTool(
  definition: ToolDefinition,
  operation: ToolOperation<unknown, unknown>,
  context: ToolExecutionContext,
  domain?: string,
): FrontendToolDefinition {
  // Create runner instance for this tool
  const runner = new OperationRunner();

  return {
    name: frontendToolName(
      definition.toolReferenceName || definition.name,
      domain,
    ),
    description: definition.description,
    parameters: definition.parameters,
    // A tool that streams: subscribed through its
    // operation, its events pushed to the harness until stopped.
    ...(definition.streams && operation.subscribe
      ? {
          streams: true,
          subscribe: (
            params: unknown,
            push: (event: ToolStreamEvent) => void,
          ) =>
            runner.subscribe(
              operation,
              processParameters(params),
              context,
              push,
            ),
        }
      : {}),

    handler: async (params: unknown): Promise<unknown> => {
      // Check for duplicate execution
      if (isRecentDuplicate(definition.name, params)) {
        return {
          success: false,
          message: 'Operation already executed recently (duplicate detected)',
        };
      }

      try {
        // Process parameters to handle JSON strings
        const processedParams = processParameters(params);

        // Use OperationRunner to execute operation with TOON format
        const result = await runner.execute(operation, processedParams, {
          ...context,
          format: 'toon', // Return human/LLM-readable string
        });

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
 * Creates FrontendToolDefinition[] from all tool definitions
 *
 * @param definitions - Tool definitions
 * @param operations - Core operations registry
 * @param context - Execution context (documentId + executor)
 * @returns FrontendToolDefinition array
 */
export function createAllAgentRuntimesTools(
  definitions: ToolDefinition[],
  operations: Record<string, ToolOperation<unknown, unknown>>,
  context: ToolExecutionContext,
  domain?: string,
): FrontendToolDefinition[] {
  const tools: FrontendToolDefinition[] = [];
  const references = siblingReferences(definitions, domain);

  for (const definition of definitions) {
    const operation = operations[definition.operation];

    if (!operation) {
      console.warn(
        `[agent-runtimes Tools] No operation found for ${definition.name} (operation: ${definition.operation})`,
      );
      continue;
    }

    const tool = createAgentRuntimesTool(
      definition,
      operation,
      context,
      domain,
    );
    tools.push({
      ...tool,
      description: renameReferences(tool.description, references),
    });
  }

  return tools;
}

/**
 * How the definitions name each other, and what they are called once named
 * for a domain: `readAllCells` → `notebookReadAllCells`. Empty without a
 * domain, where a tool keeps the name its siblings use.
 */
function siblingReferences(
  definitions: readonly ToolDefinition[],
  domain?: string,
): Map<string, string> {
  const references = new Map<string, string>();
  if (!domain) {
    return references;
  }
  for (const definition of definitions) {
    const reference = definition.toolReferenceName;
    if (!reference) {
      continue;
    }
    const named = frontendToolName(reference, domain);
    if (named !== reference) {
      references.set(reference, named);
    }
  }
  return references;
}

/**
 * A description that names a sibling (`Call readAllCells first`) by the name
 * the model is given (`Call notebookReadAllCells first`): the definitions
 * are written for their own package, where the tools are not prefixed.
 */
function renameReferences(
  description: string,
  references: ReadonlyMap<string, string>,
): string {
  if (references.size === 0) {
    return description;
  }
  const pattern = new RegExp(
    `\\b(${[...references.keys()].join('|')})\\b`,
    'g',
  );
  return description.replace(
    pattern,
    reference => references.get(reference) ?? reference,
  );
}
