/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

// Primary exports from chat (next-gen chat component)
export * from './chat';

// Explicit re-exports for TypeDoc (can't follow deep export chains)
export type { ToolCallStatus } from './chat/types/message';
export type { ToolCallStatus as DisplayToolCallStatus } from './chat/components/base/ChatBase';

export {
  AgentConfiguration,
  AGENT_LIBRARIES,
  TRANSPORTS,
  EXTENSIONS,
  isSpecSelection,
  getSpecId,
} from './AgentConfiguration';
export type {
  AgentLibrary,
  Transport,
  Extension,
  AgentConfigurationProps,
  SkillOption,
  MCPServerTool,
  LibraryAgentSpec,
} from './AgentConfiguration';
export { McpServerManager } from './McpServerManager';
export type {
  McpServerSelection,
  McpServerManagerProps,
} from './McpServerManager';
