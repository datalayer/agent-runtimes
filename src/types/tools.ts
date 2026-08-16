/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Runtime binding metadata for a tool implementation.
 */
export interface ToolRuntimeSpec {
  /** Implementation language */
  language: 'python' | 'typescript';
  /** Module/package containing the implementation */
  package: string;
  /** Callable/function name in the package */
  method: string;
}

/**
 * Specification for a runtime tool.
 */
export interface ToolSpec {
  /** Unique tool identifier */
  id: string;
  /** Version */
  version?: string;
  /** Display name for the tool */
  name: string;
  /** Tool description */
  description: string;
  /** Tags for categorization */
  tags: string[];
  /** Whether the tool is enabled */
  enabled: boolean;
  /** Approval policy for this tool */
  approval: 'auto' | 'manual';
  /** Approval timeout duration (e.g. 0h5m0s, 2d6h, 1mo2d3h4m5s) */
  timeout?: string;
  /** Whether tool requires human approval before execution */
  requiresApproval?: boolean;
  /** Runtime binding metadata */
  runtime: ToolRuntimeSpec;
  /** Icon identifier */
  icon?: string;
  /** Emoji identifier */
  emoji?: string;
}

/**
 * Binds a backend tool to a frontend renderer.
 *
 * Lets an agent declare, in its spec, which backend tool results should be
 * rendered inline by the frontend, which renderer to use, and an optional CSS
 * file to load. Frontend examples read this instead of hardcoding the tool
 * name or CSS filename.
 */
export interface FrontendRenderToolSpec {
  /** Name of the backend tool whose result is rendered inline */
  tool: string;
  /** Renderer key the frontend maps to a component */
  renderer: string;
  /** Optional CSS filename the frontend loads for this renderer */
  css?: string;
}

/**
 * Specification for a frontend tool set.
 */
export interface FrontendToolSpec {
  /** Unique frontend tool identifier */
  id: string;
  /** Version */
  version?: string;
  /** Display name for the frontend tool */
  name: string;
  /** Frontend tool description */
  description: string;
  /** Tags for categorization */
  tags: string[];
  /** Whether the frontend tool is enabled */
  enabled: boolean;
  /** Which tools from the toolset to include ('all' or specific list) */
  toolset: string;
  /** Icon identifier */
  icon?: string;
  /** Emoji identifier */
  emoji?: string;
}

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
  'inProgress' | 'executing' | 'complete' | 'failed';

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
  /**
   * Whether `args` is the complete argument set.
   *
   * Protocols that stream arguments (AG-UI) emit a first tool-call with
   * `{}` and the real args later — those mark `false`, and execution waits.
   * Protocols whose tool-call event is terminal (Vercel) mark `true`: an
   * empty `args` there means the model chose to pass nothing, which is
   * legal for a tool whose parameters are all optional — waiting on more
   * would wait forever. Absent, the executor falls back to heuristics.
   */
  argsComplete?: boolean;
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
