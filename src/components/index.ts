/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

// Primary exports from chat (next-gen chat component)
export * from './chat';
// Explicit re-exports for TypeDoc (can't follow deep export chains)
export type { ToolCallStatus } from './chat/types/message';
export type { ToolCallStatus as DisplayToolCallStatus } from './chat/components/base/ChatBase';

// Example/layout components
export { MockFileBrowser } from './MockFileBrowser';
export type { MockFileBrowserProps } from './MockFileBrowser';
export { MainContent } from './MainContent';
export type { MainContentProps } from './MainContent';
export { SessionTabs } from './SessionTabs';
export type { SessionTabsProps, Session } from './SessionTabs';
export { Header } from './Header';
export type { HeaderProps } from './Header';
export { HeaderControls } from './HeaderControls';
export type { HeaderControlsProps } from './HeaderControls';
export { FooterMetrics } from './FooterMetrics';
export type { FooterMetricsProps } from './FooterMetrics';
export { TimeTravel } from './TimeTravel';
export type { TimeTravelProps } from './TimeTravel';
export { LexicalEditor } from './LexicalEditor';
export type { LexicalEditorProps } from './LexicalEditor';
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
  MCPServerConfig,
  MCPServerTool,
  LibraryAgentSpec,
} from './AgentConfiguration';
export { McpServerManager } from './McpServerManager';
export type {
  McpServerSelection,
  McpServerManagerProps,
} from './McpServerManager';

// Example store types (for AgentConfiguration)
export type {
  Agent as ExampleAgent,
  AgentStatus as ExampleAgentStatus,
  AgentsState,
  Transport as ExampleTransport,
} from '../examples/stores/examplesStore';
