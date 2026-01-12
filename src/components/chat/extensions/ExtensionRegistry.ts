/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Extension registry for chat component.
 * Manages custom renderers and extension points.
 *
 * @module components/chat/extensions/ExtensionRegistry
 */

import type {
  ChatExtension,
  MessageRendererExtension,
  ActivityRendererExtension,
  ToolUIExtension,
  ProtocolEventExtension,
  PanelExtension,
} from '../types/extension';

/** Internal extension type for registry organization */
type InternalExtensionType =
  | 'message-renderer'
  | 'activity-renderer'
  | 'tool-ui'
  | 'protocol-event'
  | 'panel';

/**
 * Get the internal type string from an extension
 */
function getExtensionType(ext: ChatExtension): InternalExtensionType {
  return ext.type as InternalExtensionType;
}

/**
 * Get the name from an extension
 */
function getExtensionName(ext: ChatExtension): string {
  return ext.name;
}

/**
 * Extension registry class
 */
export class ExtensionRegistry {
  private extensions: Map<string, ChatExtension> = new Map();
  private byType: Map<InternalExtensionType, Set<string>> = new Map();

  constructor() {
    // Initialize type maps
    const types: InternalExtensionType[] = [
      'message-renderer',
      'activity-renderer',
      'tool-ui',
      'protocol-event',
      'panel',
    ];
    for (const type of types) {
      this.byType.set(type, new Set());
    }
  }

  /**
   * Register an extension
   */
  register(extension: ChatExtension): void {
    const name = getExtensionName(extension);
    if (this.extensions.has(name)) {
      console.warn(
        `[ExtensionRegistry] Extension ${name} already registered, replacing`,
      );
    }

    this.extensions.set(name, extension);
    this.byType.get(getExtensionType(extension))?.add(name);
  }

  /**
   * Unregister an extension
   */
  unregister(extensionName: string): void {
    const extension = this.extensions.get(extensionName);
    if (extension) {
      this.byType.get(getExtensionType(extension))?.delete(extensionName);
      this.extensions.delete(extensionName);
    }
  }

  /**
   * Get an extension by name
   */
  get<T extends ChatExtension>(extensionName: string): T | undefined {
    return this.extensions.get(extensionName) as T | undefined;
  }

  /**
   * Get all extensions of a specific type
   */
  getByType<T extends ChatExtension>(type: InternalExtensionType): T[] {
    const names = this.byType.get(type) || new Set();
    return Array.from(names)
      .map(name => this.extensions.get(name) as T)
      .filter(ext => ext !== undefined);
  }

  /**
   * Get all registered extensions
   */
  getAll(): ChatExtension[] {
    return Array.from(this.extensions.values());
  }

  /**
   * Check if an extension is registered
   */
  has(extensionName: string): boolean {
    return this.extensions.has(extensionName);
  }

  /**
   * Get message renderers
   */
  getMessageRenderers(): MessageRendererExtension[] {
    return this.getByType<MessageRendererExtension>('message-renderer');
  }

  /**
   * Get activity renderer for a specific activity type
   */
  getActivityRenderer(
    activityType: string,
  ): ActivityRendererExtension | undefined {
    const renderers =
      this.getByType<ActivityRendererExtension>('activity-renderer');

    return renderers.find(r => r.activityTypes.includes(activityType));
  }

  /**
   * Get tool UI for a specific tool
   */
  getToolUI(toolName: string): ToolUIExtension | undefined {
    const toolUIs = this.getByType<ToolUIExtension>('tool-ui');

    return toolUIs.find(
      ui => ui.toolNames === '*' || ui.toolNames.includes(toolName),
    );
  }

  /**
   * Get all panels
   */
  getPanels(): PanelExtension[] {
    return this.getByType<PanelExtension>('panel');
  }

  /**
   * Get protocol event handlers for an event type
   */
  getProtocolEventHandlers(eventType: string): ProtocolEventExtension[] {
    const handlers = this.getByType<ProtocolEventExtension>('protocol-event');

    return handlers.filter(
      h => h.eventTypes.includes(eventType) || h.eventTypes.includes('*'),
    );
  }

  /**
   * Clear all extensions
   */
  clear(): void {
    this.extensions.clear();
    for (const set of this.byType.values()) {
      set.clear();
    }
  }
}

// Re-export the helper functions from types/extension
export {
  createMessageRenderer,
  createActivityRenderer,
} from '../types/extension';
