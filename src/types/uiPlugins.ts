/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * UI plugin types for the chat.
 * UI plugins add pluggable UI and protocol capabilities.
 *
 * @module types/plugin
 */

import type { ReactNode } from 'react';
import type { ChatMessage } from './messages';
import type { ToolRenderProps } from './tools';
import type { ProtocolEvent } from './protocol';

/**
 * UI plugin type identifiers
 */
export type UIPluginType =
  | 'a2ui' // A2UI message rendering
  | 'mcp-ui' // MCP UI resources
  | 'tool-approval' // Human-in-the-loop UI
  | 'dev-console' // Debug panel
  | 'activity' // Custom activity renderers
  | 'custom'; // User-defined uiPlugins

/**
 * UI plugin lifecycle hooks
 */
export interface UIPluginLifecycle {
  /** Called when plugin is registered */
  onRegister?: () => void;

  /** Called when plugin is unregistered */
  onUnregister?: () => void;

  /** Called when chat context changes */
  onContextChange?: (context: unknown) => void;
}

/**
 * Message renderer plugin
 * Used to render custom message types (A2UI, activity messages, etc.)
 */
export interface MessageRendererUIPlugin {
  type: 'message-renderer';

  /** Unique plugin name */
  name: string;

  /** Check if this plugin can render the message */
  canRender: (message: ChatMessage) => boolean;

  /** Render the message */
  render: (props: { message: ChatMessage; isStreaming?: boolean }) => ReactNode;

  /** Priority (higher = checked first) */
  priority?: number;
}

/**
 * Activity renderer plugin
 * Used to render protocol-specific activity messages
 */
export interface ActivityRendererUIPlugin {
  type: 'activity-renderer';

  /** Unique plugin name */
  name: string;

  /** Activity types this plugin handles */
  activityTypes: string[];

  /** Render the activity */
  render: (props: {
    activityType: string;
    data: unknown;
    message: ChatMessage;
  }) => ReactNode;

  /** Priority (higher = checked first) */
  priority?: number;
}

/**
 * Tool UI plugin
 * Used to provide custom UI for tool calls (beyond tool's own render)
 */
export interface ToolUIPlugin {
  type: 'tool-ui';

  /** Unique plugin name */
  name: string;

  /** Tool names this plugin handles (or '*' for all) */
  toolNames: string[] | '*';

  /** Render custom UI for tool */
  render: (
    props: ToolRenderProps & {
      toolName: string;
      defaultRender: () => ReactNode;
    },
  ) => ReactNode;

  /** Priority (higher = checked first) */
  priority?: number;
}

/**
 * Protocol event plugin
 * Used to handle custom protocol events
 */
export interface ProtocolEventUIPlugin {
  type: 'protocol-event';

  /** Unique plugin name */
  name: string;

  /** Event types this plugin handles */
  eventTypes: string[];

  /** Handle the protocol event */
  handle: (event: ProtocolEvent) => void;

  /** Optionally render UI for the event */
  render?: (event: ProtocolEvent) => ReactNode;
}

/**
 * Panel plugin
 * Used to add custom panels (dev console, settings, etc.)
 */
export interface PanelUIPlugin {
  type: 'panel';

  /** Unique plugin name */
  name: string;

  /** Panel title */
  title: string;

  /** Panel icon (optional) */
  icon?: ReactNode;

  /** Panel position */
  position: 'sidebar' | 'bottom' | 'floating';

  /** Render the panel content */
  render: () => ReactNode;

  /** Whether panel is initially visible */
  defaultVisible?: boolean;
}

/**
 * Union type for all uiPlugins
 */
export type ChatUIPlugin =
  | MessageRendererUIPlugin
  | ActivityRendererUIPlugin
  | ToolUIPlugin
  | ProtocolEventUIPlugin
  | PanelUIPlugin;

/**
 * UI plugin registration options
 */
export interface UIPluginRegistrationOptions {
  /** Replace existing plugin with same name */
  replace?: boolean;

  /** Enable/disable plugin */
  enabled?: boolean;
}

/**
 * UI plugin registry entry
 */
export interface UIPluginRegistryEntry {
  plugin: ChatUIPlugin;
  enabled: boolean;
  registeredAt: Date;
}

/**
 * A2UI specific plugin types
 */
export namespace A2UIPlugin {
  /** A2UI surface state */
  export interface Surface {
    id: string;
    root: string;
    styles?: {
      font?: string;
      primaryColor?: string;
    };
    components: Map<string, Component>;
    dataModel: Map<string, unknown>;
  }

  /** A2UI component definition */
  export interface Component {
    id: string;
    type: string;
    props: Record<string, unknown>;
    children?: string[];
  }

  /** A2UI message types */
  export type MessageType =
    'beginRendering' | 'surfaceUpdate' | 'dataModelUpdate' | 'deleteSurface';

  /** A2UI renderer theme */
  export interface Theme {
    components?: Record<string, React.ComponentType<unknown>>;
    styles?: Record<string, unknown>;
  }
}

/**
 * Type guard to check plugin type
 */
export function isMessageRendererUIPlugin(
  ext: ChatUIPlugin,
): ext is MessageRendererUIPlugin {
  return ext.type === 'message-renderer';
}

export function isActivityRendererUIPlugin(
  ext: ChatUIPlugin,
): ext is ActivityRendererUIPlugin {
  return ext.type === 'activity-renderer';
}

export function isToolUIPlugin(ext: ChatUIPlugin): ext is ToolUIPlugin {
  return ext.type === 'tool-ui';
}

export function isProtocolEventUIPlugin(
  ext: ChatUIPlugin,
): ext is ProtocolEventUIPlugin {
  return ext.type === 'protocol-event';
}

export function isPanelUIPlugin(ext: ChatUIPlugin): ext is PanelUIPlugin {
  return ext.type === 'panel';
}

/**
 * Helper to create a message renderer plugin
 */
export function createMessageRenderer(
  name: string,
  canRender: MessageRendererUIPlugin['canRender'],
  render: MessageRendererUIPlugin['render'],
  priority = 0,
): MessageRendererUIPlugin {
  return {
    type: 'message-renderer',
    name,
    canRender,
    render,
    priority,
  };
}

/**
 * Helper to create an activity renderer plugin
 */
export function createActivityRenderer(
  name: string,
  activityTypes: string[],
  render: ActivityRendererUIPlugin['render'],
  priority = 0,
): ActivityRendererUIPlugin {
  return {
    type: 'activity-renderer',
    name,
    activityTypes,
    render,
    priority,
  };
}
