/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Extension exports for chat component.
 *
 * @module components/chat/extensions
 */

export {
  ExtensionRegistry,
  createMessageRenderer,
  createActivityRenderer,
} from './ExtensionRegistry';
export type { InternalExtensionType } from './ExtensionRegistry';

export {
  createA2UIRenderer,
  A2UIExtensionImpl,
  type A2UIMessage,
} from './A2UIExtension';

export {
  createMCPUIRenderer,
  MCPUIExtensionImpl,
  type MCPUIMessage,
  type MCPUIResource,
} from './MCPUIExtension';

// Re-export extension types
export type {
  ChatExtension,
  ExtensionType,
  MessageRendererExtension,
  ActivityRendererExtension,
  ToolUIExtension,
  ProtocolEventExtension,
  PanelExtension,
  A2UIExtension,
} from '../types/extension';
