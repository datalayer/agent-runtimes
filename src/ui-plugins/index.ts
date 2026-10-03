/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Extension exports for chat component.
 *
 * @module components/extensions
 */

export { ExtensionRegistry } from './ExtensionRegistry';
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
