/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

// Re-export from new location for backward compatibility
export {
  MockFileBrowser,
  MainContent,
  SessionTabs,
  Header,
  HeaderControls,
  FooterMetrics,
  TimeTravel,
  LexicalEditor,
  AgentConfiguration,
  AGENT_LIBRARIES,
  TRANSPORTS,
  EXTENSIONS,
  McpServerManager,
} from '../../components';
export type {
  AgentLibrary,
  Transport,
  Extension,
  MCPServerConfig,
  MCPServerTool,
  McpServerSelection,
} from '../../components';
