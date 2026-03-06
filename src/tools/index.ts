/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Platform-agnostic tools for notebook and lexical integration with AI frameworks
 *
 * @module tools
 */

// Export adapters
export * from './adapters/copilotkit';

// Tool executor
export {
  ToolExecutor,
  createToolExecutor,
  type ToolExecutionContext,
} from './ToolExecutor';

// Re-export tool types
export type {
  ToolDefinition,
  FrontendToolDefinition,
  BackendToolDefinition,
  ToolLocation,
  ToolParameter,
  ToolRenderStatus,
  ToolRenderProps,
  ToolRenderAndWaitProps,
  ToolCallRequest,
  ToolExecutionResult,
  ToolRegistryEntry,
} from '../types/tool';

export { isFrontendTool, isBackendTool, hasHitlRender } from '../types/tool';
