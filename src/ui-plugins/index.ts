/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * UI plugin exports for the chat: how an agent's answer becomes an interface (A2UI, MCP UI).
 *
 * @module components/uiPlugins
 */

export { UIPluginRegistry } from './UIPluginRegistry';
export type { InternalUIPluginType } from './UIPluginRegistry';

export {
  createA2UIRenderer,
  A2UIPluginImpl,
  type A2UIMessage,
} from './A2UIPlugin';

export {
  createMCPUIRenderer,
  MCPUIPluginImpl,
  MCP_UI_NOT_DRAWN,
  type MCPUIMessage,
  type MCPUIResource,
} from './MCPUIPlugin';
