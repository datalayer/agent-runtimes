/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A2UI extension for chat component.
 * Renders A2UI protocol messages from A2A agents using @a2ui/react.
 *
 * @module components/chat/extensions/A2UIExtension
 */

import React from 'react';
import { A2UIViewer, initializeDefaultCatalog } from '@a2ui/react';
import type { ComponentInstance } from '@a2ui/react';
import type { ActivityRendererExtension } from '../types/extension';
import type { A2UIExtension as A2UIExtensionNamespace } from '../types/extension';
import type { ChatMessage } from '../types/message';

// Ensure the default component catalog is registered
initializeDefaultCatalog();

/**
 * A2UI message types (maps to Types.ServerToClientMessage)
 */
export interface A2UIMessage {
  /** Begin rendering command */
  beginRendering?: {
    surface: string;
    mimeType?: string;
    surfaceDefinition?: unknown;
  };

  /** Surface update */
  surfaceUpdate?: {
    surface: string;
    patch?: unknown;
    replace?: unknown;
  };

  /** Data model update */
  dataModelUpdate?: {
    dataModel: string;
    patch?: unknown;
    replace?: unknown;
  };

  /** Finish rendering */
  finishRendering?: {
    surface: string;
  };
}

/**
 * A2UI surface state
 */
interface SurfaceState {
  surface: string;
  mimeType?: string;
  components: ComponentInstance[];
  data: Record<string, unknown>;
  finished: boolean;
}

/**
 * A2UI extension context
 */
interface A2UIContext {
  surfaces: Map<string, SurfaceState>;
  dataModels: Map<string, unknown>;
}

/**
 * Create A2UI activity renderer.
 *
 * Uses @a2ui/react's A2UIViewer to render surfaces with full component support
 * (buttons, cards, text, interactive elements, etc.)
 */
export function createA2UIRenderer(
  _customRenderers?: Record<string, React.ComponentType<{ content: unknown }>>,
): ActivityRendererExtension {
  const contexts = new Map<string, A2UIContext>();

  const getContext = (sessionId: string): A2UIContext => {
    if (!contexts.has(sessionId)) {
      contexts.set(sessionId, {
        surfaces: new Map(),
        dataModels: new Map(),
      });
    }
    return contexts.get(sessionId)!;
  };

  return {
    name: 'a2ui-renderer',
    type: 'activity-renderer',
    activityTypes: ['a2ui'],

    render: ({ activityType: _activityType, data, message: _message }) => {
      const sessionId = 'default';
      const a2uiContext = getContext(sessionId);
      const a2uiData = data as A2UIMessage;

      // Process message to update surface state
      if (a2uiData.beginRendering) {
        a2uiContext.surfaces.set(a2uiData.beginRendering.surface, {
          surface: a2uiData.beginRendering.surface,
          mimeType: a2uiData.beginRendering.mimeType,
          components: [],
          data: {},
          finished: false,
        });
      }

      if (a2uiData.surfaceUpdate) {
        const surface = a2uiContext.surfaces.get(
          a2uiData.surfaceUpdate.surface,
        );
        if (surface) {
          if (a2uiData.surfaceUpdate.replace !== undefined) {
            const replaced = a2uiData.surfaceUpdate.replace as {
              components?: ComponentInstance[];
            };
            surface.components = replaced.components || [];
          } else if (a2uiData.surfaceUpdate.patch !== undefined) {
            surface.components = applyPatch(
              surface.components,
              a2uiData.surfaceUpdate.patch,
            ) as ComponentInstance[];
          }
        }
      }

      if (a2uiData.dataModelUpdate) {
        const existing = a2uiContext.dataModels.get(
          a2uiData.dataModelUpdate.dataModel,
        );
        if (a2uiData.dataModelUpdate.replace !== undefined) {
          a2uiContext.dataModels.set(
            a2uiData.dataModelUpdate.dataModel,
            a2uiData.dataModelUpdate.replace,
          );
        } else if (a2uiData.dataModelUpdate.patch !== undefined) {
          a2uiContext.dataModels.set(
            a2uiData.dataModelUpdate.dataModel,
            applyPatch(existing, a2uiData.dataModelUpdate.patch),
          );
        }
      }

      if (a2uiData.finishRendering) {
        const surface = a2uiContext.surfaces.get(
          a2uiData.finishRendering.surface,
        );
        if (surface) {
          surface.finished = true;
        }
      }

      // Render surfaces using A2UIViewer
      const surfacesToRender = Array.from(a2uiContext.surfaces.values());

      return React.createElement(
        'div',
        { className: 'chat-a2ui-container' },
        surfacesToRender.map(surface => {
          // Use A2UIViewer if we have structured components
          if (surface.components.length > 0) {
            return React.createElement(A2UIViewer, {
              key: surface.surface,
              root: surface.surface,
              components: surface.components,
              data: surface.data,
              onAction: action => {
                console.log('A2UI chat action:', action);
              },
            });
          }

          // Fallback for surfaces without structured components
          return React.createElement(
            'div',
            {
              key: surface.surface,
              className: `chat-a2ui-surface chat-a2ui-surface--${surface.mimeType?.replace('/', '-') || 'unknown'}`,
            },
            renderSurfaceContent(surface),
          );
        }),
      );
    },

    priority: 10,
  };
}

/**
 * Render surface content as fallback for non-component surfaces
 */
function renderSurfaceContent(surface: SurfaceState): React.ReactNode {
  const { components, mimeType } = surface;

  if (!components || components.length === 0) {
    return null;
  }

  // For non-structured content, stringify
  switch (mimeType) {
    case 'text/plain':
      return React.createElement(
        'pre',
        null,
        JSON.stringify(components, null, 2),
      );
    case 'application/json':
      return React.createElement(
        'pre',
        { className: 'json' },
        JSON.stringify(components, null, 2),
      );
    default:
      return React.createElement(
        'pre',
        null,
        JSON.stringify(components, null, 2),
      );
  }
}

/**
 * Simple JSON patch application (RFC 6902 subset)
 */
function applyPatch(target: unknown, patch: unknown): unknown {
  if (!Array.isArray(patch)) {
    return patch;
  }

  const result = structuredClone(target) || {};

  for (const op of patch) {
    if (typeof op !== 'object' || !op) continue;

    const {
      op: operation,
      path,
      value,
    } = op as {
      op: string;
      path: string;
      value?: unknown;
    };

    const pathParts = path.split('/').filter(Boolean);

    switch (operation) {
      case 'add':
      case 'replace':
        setNestedValue(result, pathParts, value);
        break;

      case 'remove':
        removeNestedValue(result, pathParts);
        break;

      case 'copy':
      case 'move':
        break;
    }
  }

  return result;
}

function setNestedValue(obj: any, path: string[], value: unknown): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }
  if (path.length > 0) {
    current[path[path.length - 1]] = value;
  }
}

function removeNestedValue(obj: any, path: string[]): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in current)) return;
    current = current[key];
  }
  if (path.length > 0) {
    delete current[path[path.length - 1]];
  }
}

/**
 * A2UI Extension implementation class.
 * Uses @a2ui/react's A2UIViewer for rendering surfaces in chat.
 */
export class A2UIExtensionImpl implements ActivityRendererExtension {
  readonly name = 'a2ui';
  readonly type = 'activity-renderer' as const;
  readonly activityTypes = ['a2ui'];
  readonly priority = 10;

  private contexts = new Map<string, A2UIContext>();

  /**
   * Get the current surfaces for a session
   */
  getSurfaces(sessionId: string): Map<string, unknown> {
    const context = this.contexts.get(sessionId);
    if (!context) return new Map();

    const result = new Map<string, unknown>();
    for (const [key, surface] of context.surfaces) {
      result.set(key, surface.components);
    }
    return result;
  }

  /**
   * Get the current data models for a session
   */
  getDataModels(sessionId: string): Map<string, unknown> {
    return this.contexts.get(sessionId)?.dataModels || new Map();
  }

  /**
   * Process an A2UI message
   */
  processMessage(sessionId: string, message: A2UIMessage): void {
    if (!this.contexts.has(sessionId)) {
      this.contexts.set(sessionId, {
        surfaces: new Map(),
        dataModels: new Map(),
      });
    }

    const context = this.contexts.get(sessionId)!;

    if (message.beginRendering) {
      context.surfaces.set(message.beginRendering.surface, {
        surface: message.beginRendering.surface,
        mimeType: message.beginRendering.mimeType,
        components: [],
        data: {},
        finished: false,
      });
    }

    if (message.surfaceUpdate) {
      const surface = context.surfaces.get(message.surfaceUpdate.surface);
      if (surface) {
        if (message.surfaceUpdate.replace !== undefined) {
          const replaced = message.surfaceUpdate.replace as {
            components?: ComponentInstance[];
          };
          surface.components = replaced.components || [];
        } else if (message.surfaceUpdate.patch !== undefined) {
          surface.components = applyPatch(
            surface.components,
            message.surfaceUpdate.patch,
          ) as ComponentInstance[];
        }
      }
    }

    if (message.dataModelUpdate) {
      const existing = context.dataModels.get(
        message.dataModelUpdate.dataModel,
      );
      if (message.dataModelUpdate.replace !== undefined) {
        context.dataModels.set(
          message.dataModelUpdate.dataModel,
          message.dataModelUpdate.replace,
        );
      } else if (message.dataModelUpdate.patch !== undefined) {
        context.dataModels.set(
          message.dataModelUpdate.dataModel,
          applyPatch(existing, message.dataModelUpdate.patch),
        );
      }
    }

    if (message.finishRendering) {
      const surface = context.surfaces.get(message.finishRendering.surface);
      if (surface) {
        surface.finished = true;
      }
    }
  }

  /**
   * Clear a session's context
   */
  clearSession(sessionId: string): void {
    this.contexts.delete(sessionId);
  }

  /**
   * Render method — uses A2UIViewer for structured surfaces
   */
  render = ({
    activityType: _activityType,
    data,
    message: _message,
  }: {
    activityType: string;
    data: unknown;
    message: ChatMessage;
  }) => {
    const sessionId = 'default';
    this.processMessage(sessionId, data as A2UIMessage);

    const ctx = this.contexts.get(sessionId);
    if (!ctx) return null;

    const surfacesToRender = Array.from(ctx.surfaces.values());

    return React.createElement(
      'div',
      { className: 'chat-a2ui-container' },
      surfacesToRender.map(surface => {
        if (surface.components.length > 0) {
          return React.createElement(A2UIViewer, {
            key: surface.surface,
            root: surface.surface,
            components: surface.components,
            data: surface.data,
            onAction: action => {
              console.log('A2UI chat action:', action);
            },
          });
        }

        return React.createElement(
          'div',
          {
            key: surface.surface,
            className: 'chat-a2ui-surface',
          },
          renderSurfaceContent(surface),
        );
      }),
    );
  };
}

// Re-export namespace for external use
export type { A2UIExtensionNamespace };
