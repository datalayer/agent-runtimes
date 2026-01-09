/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Converts unified tool definitions to CopilotKit's useCopilotAction format.
 *
 * @see https://docs.copilotkit.ai/langgraph/frontend-actions
 * @module tools/adapters/copilotkit/CopilotKitToolAdapter
 */

import type {
  ToolDefinition,
  ToolOperation,
  ToolExecutionContext,
} from '@datalayer/jupyter-react';
import { OperationRunner } from '@datalayer/jupyter-react';

/**
 * Type signature for CopilotKit's useFrontendTool hook
 * This is shared across both notebook and lexical adapters
 */
export type UseFrontendToolFn = (
  tool: {
    name: string;
    description: string;
    parameters: any;
    handler: (params: any) => Promise<string>;
    render?: (props: any) => any;
  },
  dependencies?: any[],
) => void;

/**
 * Component to register a single action with CopilotKit
 * Must be used inside CopilotKit context
 */
export function ActionRegistrar({
  action,
  useFrontendTool,
}: {
  action: any;
  useFrontendTool: UseFrontendToolFn;
}) {
  useFrontendTool(action, [action]);
  return null;
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
        `[copilotkit] 🚫 DUPLICATE DETECTED - Skipping execution (${timeSinceExecution}ms since last call)`,
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
 * CopilotKit parameter definition (array format, not JSON Schema)
 */
export interface CopilotKitParameter {
  name: string;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'object[]';
  description?: string;
  required?: boolean;
  attributes?: CopilotKitParameter[];
}

/**
 * CopilotKit action definition (matches useCopilotAction interface)
 */
export interface CopilotKitAction {
  /** Action name */
  name: string;

  /** Description for AI model */
  description: string;

  /** Parameters array (NOT JSON Schema) */
  parameters: CopilotKitParameter[];

  /** Handler function */
  handler: (params: unknown) => Promise<string>;

  /** Optional custom UI renderer */
  render?: (props: {
    status: string;
    args: unknown;
    result: unknown;
  }) => React.ReactNode;
}

/**
 * Parses array parameters from CopilotKit's string format to actual arrays.
 *
 * CopilotKit doesn't have native support for primitive arrays, so it sends them
 * as JSON strings (e.g., "[1, 2, 3]"). This function parses those strings back
 * into actual arrays based on the schema definition.
 *
 * @param params - Raw parameters from CopilotKit
 * @param jsonSchema - JSON Schema definition to identify array parameters
 * @returns Parsed parameters with arrays converted from strings
 */
function parseArrayParameters(
  params: unknown,
  jsonSchema: ToolDefinition['parameters'],
): unknown {
  if (typeof params !== 'object' || params === null) {
    return params;
  }

  const parsedParams = { ...params } as Record<string, unknown>;

  // Iterate through schema properties to find array types
  for (const [name, schema] of Object.entries(jsonSchema.properties || {})) {
    const propSchema = schema as {
      type?: string;
      items?: { type?: string };
    };

    // If this property is an array type and the value is a string, parse it
    if (propSchema.type === 'array' && typeof parsedParams[name] === 'string') {
      try {
        const parsed = JSON.parse(parsedParams[name] as string);
        // Validate it's actually an array after parsing
        if (Array.isArray(parsed)) {
          parsedParams[name] = parsed;
        }
      } catch (error) {
        // If parsing fails, log warning but keep original value
        console.warn(
          `[copilotkit] Failed to parse array parameter "${name}":`,
          error,
        );
      }
    }
  }

  return parsedParams;
}

/**
 * Converts JSON Schema to CopilotKit parameter array format
 *
 * @param jsonSchema - JSON Schema parameters object
 * @returns CopilotKit parameters array
 */
function jsonSchemaToParameters(
  jsonSchema: ToolDefinition['parameters'],
): CopilotKitParameter[] {
  const parameters: CopilotKitParameter[] = [];
  const required = jsonSchema.required || [];

  for (const [name, schema] of Object.entries(jsonSchema.properties || {})) {
    const propSchema = schema as {
      type?: string;
      description?: string;
      properties?: Record<string, unknown>;
      required?: string[];
      items?: { type?: string }; // For array items
    };

    // Map JSON Schema type to CopilotKit type
    let copilotType: 'string' | 'number' | 'boolean' | 'object' | 'object[]' =
      'string';

    if (propSchema.type === 'array') {
      // Handle array types based on items type
      const itemsType = propSchema.items?.type;
      if (itemsType === 'object') {
        copilotType = 'object[]';
      } else {
        // For primitive arrays (number[], string[], etc.)
        // CopilotKit doesn't have explicit support, but we can use the description
        // to clarify and handle parsing in the handler
        copilotType = 'string'; // Will be parsed as JSON array string
        // Enhance description to clarify it's an array
        propSchema.description =
          `${propSchema.description || ''} (JSON array of ${itemsType || 'values'})`.trim();
      }
    } else {
      // Original logic for non-array types
      copilotType =
        (propSchema.type as
          | 'string'
          | 'number'
          | 'boolean'
          | 'object'
          | undefined) || 'string';
    }

    const param: CopilotKitParameter = {
      name,
      type: copilotType,
      description: propSchema.description,
      required: required.includes(name),
    };

    // Handle nested object properties (for object types)
    if (propSchema.type === 'object' && propSchema.properties) {
      // Cast to proper type for recursive call
      param.attributes = jsonSchemaToParameters({
        type: 'object',
        properties: propSchema.properties as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        required: propSchema.required || [],
      });
    }

    parameters.push(param);
  }

  console.log(
    '[copilotkit] Converted parameters:',
    JSON.stringify(parameters, null, 2),
  );
  return parameters;
}

/**
 * Converts unified tool definition to CopilotKit action format
 *
 * @param definition - Tool definition
 * @param operation - Core operation
 * @param context - Execution context (documentId + executor)
 * @returns CopilotKit action
 */
export function createCopilotKitAction(
  definition: ToolDefinition,
  operation: ToolOperation<unknown, unknown>,
  context: ToolExecutionContext,
): CopilotKitAction {
  // Create runner instance for this action
  const runner = new OperationRunner();

  const action: any = {
    name: definition.toolReferenceName || definition.name,
    description: definition.description,
    parameters: jsonSchemaToParameters(definition.parameters),
    // CRITICAL FIX: Set to true to enable CopilotKit's deduplication mechanism
    // See https://github.com/CopilotKit/CopilotKit/issues/2310
    // Without this, actions get re-executed cumulatively (A → A,B → A,B,C)
    _isRenderAndWait: true,

    handler: async (params: unknown): Promise<string> => {
      console.log(`[copilotkit] ========== HANDLER CALLED ==========`);
      console.log(`[copilotkit] Tool: ${definition.name}`);
      console.log(`[copilotkit] Operation: ${definition.operation}`);
      console.log(`[copilotkit] Params:`, params);
      console.log(`[copilotkit] Context:`, context);

      // Check for duplicate execution
      const signature = `${definition.name}:${JSON.stringify(params)}`;
      console.log(`[copilotkit] 🔍 Signature:`, signature.substring(0, 150));
      if (isRecentDuplicate(definition.name, params)) {
        console.log(`[copilotkit] 🚫 DUPLICATE DETECTED - Returning early`);
        return 'Operation already executed recently (duplicate detected and skipped)';
      }
      console.log(
        `[copilotkit] ✅ NOT a duplicate - Proceeding with execution`,
      );

      try {
        // Parse array parameters that CopilotKit sends as JSON strings
        // CopilotKit doesn't have native support for primitive arrays, so they're sent as strings
        const parsedParams = parseArrayParameters(
          params,
          definition.parameters,
        );
        console.log(`[copilotkit] Calling runner.execute with TOON format...`);
        console.log(`[copilotkit] Operation name:`, operation);
        console.log(
          `[copilotkit] Parsed params being passed:`,
          JSON.stringify(parsedParams, null, 2),
        );
        console.log(
          `[copilotkit] Context being passed:`,
          JSON.stringify(context, null, 2),
        );

        // Use OperationRunner to execute operation with TOON format
        // TOON format returns human/LLM-readable string (default)
        const result = await runner.execute(operation, parsedParams, {
          ...context,
          format: 'toon', // CopilotKit expects string responses
        });
        console.log(`[copilotkit] Operation result:`, result);

        // Result is already a string (TOON format)
        if (typeof result === 'string') {
          return result;
        }

        // Fallback: if somehow we got an object (shouldn't happen with format='toon')
        if (typeof result === 'object' && result !== null) {
          const resultObj = result as {
            message?: string;
            success?: boolean;
            error?: string;
          };

          // Return success message if available
          if (resultObj.message) {
            return resultObj.message;
          }

          // Return error if failed
          if (resultObj.success === false && resultObj.error) {
            return `❌ Error: ${resultObj.error}`;
          }

          // Otherwise format as JSON
          return JSON.stringify(result, null, 2);
        }

        return String(result);
      } catch (error) {
        console.error(`[copilotkit] ❌ ERROR in handler:`, error);
        console.error(
          `[copilotkit] Error stack:`,
          error instanceof Error ? error.stack : 'N/A',
        );
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return `❌ Error: ${errorMessage}`;
      }
    },

    // Optional: Custom render function for copilotkit
    // Note: config supports platform-specific extensions, cast to any for flexibility
    render: (definition.config as any)?.copilotkit?.renderingHints?.customRender
      ? ((definition.config as any).copilotkit.renderingHints
          .customRender as (props: {
          status: string;
          args: unknown;
          result: unknown;
        }) => React.ReactNode)
      : undefined,
  };

  return action;
}

/**
 * Creates CopilotKit actions from all tool definitions
 *
 * @param definitions - Tool definitions
 * @param operations - Core operations registry
 * @param context - Execution context (documentId + executor)
 * @returns CopilotKit actions
 */
export function createAllCopilotKitActions(
  definitions: ToolDefinition[],
  operations: Record<string, ToolOperation<unknown, unknown>>,
  context: ToolExecutionContext,
): CopilotKitAction[] {
  const actions: CopilotKitAction[] = [];

  for (const definition of definitions) {
    const operation = operations[definition.operation];

    if (!operation) {
      console.warn(
        `[copilotkit Tools] No operation found for ${definition.name} (operation: ${definition.operation})`,
      );
      continue;
    }

    const action = createCopilotKitAction(definition, operation, context);
    actions.push(action);
  }

  console.log(
    `[copilotkit Tools] Created ${actions.length} CopilotKit actions`,
  );

  return actions;
}
