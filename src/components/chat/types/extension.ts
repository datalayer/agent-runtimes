/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Extension types for chat component.
 * Extensions add pluggable UI and protocol capabilities.
 *
 * @module components/chat/types/extension
 */

import type { ReactNode } from 'react';
import type { ChatMessage } from './message';
import type { ToolRenderProps } from './tool';
import type { ProtocolEvent } from './protocol';

/**
 * Extension type identifiers
 */
export type ExtensionType =
  | 'a2ui' // A2UI message rendering
  | 'mcp-ui' // MCP UI resources
  | 'tool-approval' // Human-in-the-loop UI
  | 'dev-console' // Debug panel
  | 'activity' // Custom activity renderers
  | 'custom'; // User-defined extensions

/**
 * Extension lifecycle hooks
 */
export interface ExtensionLifecycle {
  /** Called when extension is registered */
  onRegister?: () => void;

  /** Called when extension is unregistered */
  onUnregister?: () => void;

  /** Called when chat context changes */
  onContextChange?: (context: unknown) => void;
}

/**
 * Message renderer extension
 * Used to render custom message types (A2UI, activity messages, etc.)
 */
export interface MessageRendererExtension {
  type: 'message-renderer';

  /** Unique extension name */
  name: string;

  /** Check if this extension can render the message */
  canRender: (message: ChatMessage) => boolean;

  /** Render the message */
  render: (props: { message: ChatMessage; isStreaming?: boolean }) => ReactNode;

  /** Priority (higher = checked first) */
  priority?: number;
}

/**
 * Activity renderer extension
 * Used to render protocol-specific activity messages
 */
export interface ActivityRendererExtension {
  type: 'activity-renderer';

  /** Unique extension name */
  name: string;

  /** Activity types this extension handles */
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
 * Tool UI extension
 * Used to provide custom UI for tool calls (beyond tool's own render)
 */
export interface ToolUIExtension {
  type: 'tool-ui';

  /** Unique extension name */
  name: string;

  /** Tool names this extension handles (or '*' for all) */
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
 * Protocol event extension
 * Used to handle custom protocol events
 */
export interface ProtocolEventExtension {
  type: 'protocol-event';

  /** Unique extension name */
  name: string;

  /** Event types this extension handles */
  eventTypes: string[];

  /** Handle the protocol event */
  handle: (event: ProtocolEvent) => void;

  /** Optionally render UI for the event */
  render?: (event: ProtocolEvent) => ReactNode;
}

/**
 * Panel extension
 * Used to add custom panels (dev console, settings, etc.)
 */
export interface PanelExtension {
  type: 'panel';

  /** Unique extension name */
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
 * Union type for all extensions
 */
export type ChatExtension =
  | MessageRendererExtension
  | ActivityRendererExtension
  | ToolUIExtension
  | ProtocolEventExtension
  | PanelExtension;

/**
 * Extension registration options
 */
export interface ExtensionRegistrationOptions {
  /** Replace existing extension with same name */
  replace?: boolean;

  /** Enable/disable extension */
  enabled?: boolean;
}

/**
 * Extension registry entry
 */
export interface ExtensionRegistryEntry {
  extension: ChatExtension;
  enabled: boolean;
  registeredAt: Date;
}

/**
 * A2UI specific extension types
 */
export namespace A2UIExtension {
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
    | 'beginRendering'
    | 'surfaceUpdate'
    | 'dataModelUpdate'
    | 'deleteSurface';

  /** A2UI renderer theme */
  export interface Theme {
    components?: Record<string, React.ComponentType<unknown>>;
    styles?: Record<string, unknown>;
  }
}

/**
 * Type guard to check extension type
 */
export function isMessageRendererExtension(
  ext: ChatExtension,
): ext is MessageRendererExtension {
  return ext.type === 'message-renderer';
}

export function isActivityRendererExtension(
  ext: ChatExtension,
): ext is ActivityRendererExtension {
  return ext.type === 'activity-renderer';
}

export function isToolUIExtension(ext: ChatExtension): ext is ToolUIExtension {
  return ext.type === 'tool-ui';
}

export function isProtocolEventExtension(
  ext: ChatExtension,
): ext is ProtocolEventExtension {
  return ext.type === 'protocol-event';
}

export function isPanelExtension(ext: ChatExtension): ext is PanelExtension {
  return ext.type === 'panel';
}

/**
 * Helper to create a message renderer extension
 */
export function createMessageRenderer(
  name: string,
  canRender: MessageRendererExtension['canRender'],
  render: MessageRendererExtension['render'],
  priority = 0,
): MessageRendererExtension {
  return {
    type: 'message-renderer',
    name,
    canRender,
    render,
    priority,
  };
}

/**
 * Helper to create an activity renderer extension
 */
export function createActivityRenderer(
  name: string,
  activityTypes: string[],
  render: ActivityRendererExtension['render'],
  priority = 0,
): ActivityRendererExtension {
  return {
    type: 'activity-renderer',
    name,
    activityTypes,
    render,
    priority,
  };
}
