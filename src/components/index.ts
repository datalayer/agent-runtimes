/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

// Primary exports from chat (next-gen chat component)
export * from './chat';

// Example/layout components
export { MockFileBrowser } from './MockFileBrowser';
export { MainContent } from './MainContent';
export { SessionTabs } from './SessionTabs';
export { Header } from './Header';
export { HeaderControls } from './HeaderControls';
export { FooterMetrics } from './FooterMetrics';
export { TimeTravel } from './TimeTravel';
export { LexicalEditor } from './LexicalEditor';
export {
  AgentConfiguration,
  AGENT_LIBRARIES,
  TRANSPORTS,
  EXTENSIONS,
} from './AgentConfiguration';
export type {
  AgentLibrary,
  Transport,
  Extension,
  MCPServerConfig,
  MCPServerTool,
} from './AgentConfiguration';
export { McpServerManager } from './McpServerManager';
export type { McpServerSelection } from './McpServerManager';
