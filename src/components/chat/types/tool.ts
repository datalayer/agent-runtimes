/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Tool types for chat component.
 * Supports hybrid execution (frontend + backend) with per-tool annotation.
 *
 * @module components/chat/types/tool
 */

import type { ReactNode } from 'react';

/**
 * Tool execution location
 * - 'frontend': Executes in browser (default if not specified)
 * - 'backend': Executes on server via inference provider
 */
export type ToolLocation = 'frontend' | 'backend';

/**
 * Tool parameter definition (CopilotKit-compatible format)
 */
export interface ToolParameter {
  name: string;
  type?:
    | 'string'
    | 'number'
    | 'boolean'
    | 'object'
    | 'object[]'
    | 'string[]'
    | 'number[]';
  description?: string;
  required?: boolean;
  attributes?: ToolParameter[];
  enum?: string[];
  default?: unknown;
}

/**
 * Tool call status for render props
 */
export type ToolRenderStatus =
  | 'inProgress'
  | 'executing'
  | 'complete'
  | 'failed';

/**
 * Props passed to tool render function
 */
export interface ToolRenderProps<
  TArgs = Record<string, unknown>,
  TResult = unknown,
> {
  /** Current execution status */
  status: ToolRenderStatus;

  /** Tool arguments from the LLM */
  args: TArgs;

  /** Result after execution (only when status is 'complete') */
  result?: TResult;

  /** Error message (only when status is 'failed') */
  error?: string;
}

/**
 * Props passed to renderAndWaitForResponse (HITL pattern)
 */
export interface ToolRenderAndWaitProps<
  TArgs = Record<string, unknown>,
  TResult = unknown,
> extends ToolRenderProps<TArgs, TResult> {
  /** Call this to respond with a result (for HITL approval) */
  respond: (result: TResult) => Promise<void>;
}

/**
 * Frontend tool definition (compatible with CopilotKit useFrontendTool)
 */
export interface FrontendToolDefinition<
  TArgs = Record<string, unknown>,
  TResult = unknown,
> {
  /** Unique tool name */
  name: string;

  /** Description for the LLM */
  description: string;

  /**
   * Parameter definitions.
   * Accepts either CopilotKit-style ToolParameter[] or JSON Schema format.
   */
  parameters: ToolParameter[] | Record<string, unknown>;

  /**
   * Execution location
   * @default 'frontend'
   */
  location?: ToolLocation;

  /**
   * Handler function for frontend execution
   * Required when location is 'frontend' (default)
   */
  handler?: (args: TArgs) => Promise<TResult>;

  /**
   * Optional render function for custom UI during execution
   */
  render?: (props: ToolRenderProps<TArgs, TResult>) => ReactNode;

  /**
   * Render function that waits for user response (HITL pattern)
   * Mutually exclusive with 'render'
   */
  renderAndWaitForResponse?: (
    props: ToolRenderAndWaitProps<TArgs, TResult>,
  ) => ReactNode;
}

/**
 * Backend tool definition (tool runs on server)
 */
export interface BackendToolDefinition {
  /** Unique tool name */
  name: string;

  /** Description for the LLM */
  description: string;

  /** Parameter definitions */
  parameters: ToolParameter[];

  /** Must be 'backend' */
  location: 'backend';

  /**
   * Optional render function for custom UI during execution
   */
  render?: (props: ToolRenderProps) => ReactNode;
}

/**
 * Union type for all tool definitions
 */
export type ToolDefinition = FrontendToolDefinition | BackendToolDefinition;

/**
 * Tool execution result
 */
export interface ToolExecutionResult<T = unknown> {
  /** Tool call ID from the original request */
  toolCallId?: string;
  success: boolean;
  result?: T;
  error?: string;
  executionTime?: number;
}

/**
 * Tool call request (from LLM)
 */
export interface ToolCallRequest {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * Tool registry entry (internal)
 */
export interface ToolRegistryEntry {
  definition: ToolDefinition;
  registeredAt: Date;
}

/**
 * Type guard to check if tool is frontend tool
 */
export function isFrontendTool(
  tool: ToolDefinition,
): tool is FrontendToolDefinition {
  return tool.location !== 'backend';
}

/**
 * Type guard to check if tool is backend tool
 */
export function isBackendTool(
  tool: ToolDefinition,
): tool is BackendToolDefinition {
  return tool.location === 'backend';
}

/**
 * Type guard to check if tool has HITL render
 */
export function hasHitlRender(
  tool: ToolDefinition,
): tool is FrontendToolDefinition & {
  renderAndWaitForResponse: NonNullable<
    FrontendToolDefinition['renderAndWaitForResponse']
  >;
} {
  return (
    'renderAndWaitForResponse' in tool &&
    tool.renderAndWaitForResponse !== undefined
  );
}
