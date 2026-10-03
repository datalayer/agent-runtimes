/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * UI plugin registry for the chat.
 * Manages custom renderers and plugin points.
 *
 * @module components/uiPlugins/UIPluginRegistry
 */

import type {
  ChatUIPlugin,
  MessageRendererUIPlugin,
  ActivityRendererUIPlugin,
  ToolUIPlugin,
  ProtocolEventUIPlugin,
  PanelUIPlugin,
} from '../types/uiPlugins';

/** Internal plugin type for registry organization */
export type InternalUIPluginType =
  | 'message-renderer'
  | 'activity-renderer'
  | 'tool-ui'
  | 'protocol-event'
  | 'panel';

/**
 * Get the internal type string from an plugin
 */
function getUIPluginType(ext: ChatUIPlugin): InternalUIPluginType {
  return ext.type as InternalUIPluginType;
}

/**
 * Get the name from an plugin
 */
function getUIPluginName(ext: ChatUIPlugin): string {
  return ext.name;
}

/**
 * UI plugin registry class
 */
export class UIPluginRegistry {
  private uiPlugins: Map<string, ChatUIPlugin> = new Map();
  private byType: Map<InternalUIPluginType, Set<string>> = new Map();

  constructor() {
    // Initialize type maps
    const types: InternalUIPluginType[] = [
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
   * Register an plugin
   */
  register(plugin: ChatUIPlugin): void {
    const name = getUIPluginName(plugin);
    if (this.uiPlugins.has(name)) {
      console.warn(
        `[UIPluginRegistry] UI plugin ${name} already registered, replacing`,
      );
    }

    this.uiPlugins.set(name, plugin);
    this.byType.get(getUIPluginType(plugin))?.add(name);
  }

  /**
   * Unregister an plugin
   */
  unregister(pluginName: string): void {
    const plugin = this.uiPlugins.get(pluginName);
    if (plugin) {
      this.byType.get(getUIPluginType(plugin))?.delete(pluginName);
      this.uiPlugins.delete(pluginName);
    }
  }

  /**
   * Get an plugin by name
   */
  get<T extends ChatUIPlugin>(pluginName: string): T | undefined {
    return this.uiPlugins.get(pluginName) as T | undefined;
  }

  /**
   * Get all uiPlugins of a specific type
   */
  getByType<T extends ChatUIPlugin>(type: InternalUIPluginType): T[] {
    const names = this.byType.get(type) || new Set();
    return Array.from(names)
      .map(name => this.uiPlugins.get(name) as T)
      .filter(ext => ext !== undefined);
  }

  /**
   * Get all registered uiPlugins
   */
  getAll(): ChatUIPlugin[] {
    return Array.from(this.uiPlugins.values());
  }

  /**
   * Check if an plugin is registered
   */
  has(pluginName: string): boolean {
    return this.uiPlugins.has(pluginName);
  }

  /**
   * Get message renderers
   */
  getMessageRenderers(): MessageRendererUIPlugin[] {
    return this.getByType<MessageRendererUIPlugin>('message-renderer');
  }

  /**
   * Get activity renderer for a specific activity type
   */
  getActivityRenderer(
    activityType: string,
  ): ActivityRendererUIPlugin | undefined {
    const renderers =
      this.getByType<ActivityRendererUIPlugin>('activity-renderer');

    return renderers.find(r => r.activityTypes.includes(activityType));
  }

  /**
   * Get tool UI for a specific tool
   */
  getToolUI(toolName: string): ToolUIPlugin | undefined {
    const toolUIs = this.getByType<ToolUIPlugin>('tool-ui');

    return toolUIs.find(
      ui => ui.toolNames === '*' || ui.toolNames.includes(toolName),
    );
  }

  /**
   * Get all panels
   */
  getPanels(): PanelUIPlugin[] {
    return this.getByType<PanelUIPlugin>('panel');
  }

  /**
   * Get protocol event handlers for an event type
   */
  getProtocolEventHandlers(eventType: string): ProtocolEventUIPlugin[] {
    const handlers = this.getByType<ProtocolEventUIPlugin>('protocol-event');

    return handlers.filter(
      h => h.eventTypes.includes(eventType) || h.eventTypes.includes('*'),
    );
  }

  /**
   * Clear all uiPlugins
   */
  clear(): void {
    this.uiPlugins.clear();
    for (const set of this.byType.values()) {
      set.clear();
    }
  }
}
