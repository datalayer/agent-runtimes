/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A2UI extension for chat component.
 * Renders A2UI protocol messages from A2A agents.
 *
 * @module components/chat/extensions/A2UIExtension
 */

import React from 'react';
import type { ActivityRendererExtension } from '../types/extension';
import type { A2UIExtension as A2UIExtensionNamespace } from '../types/extension';
import type { ChatMessage } from '../types/message';

/**
 * A2UI message types
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
  content: unknown;
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
 * Create A2UI activity renderer
 */
export function createA2UIRenderer(
  customRenderers?: Record<string, React.ComponentType<{ content: unknown }>>,
): ActivityRendererExtension {
  // Track surfaces per session
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
      // Use default session for now
      const sessionId = 'default';
      const a2uiContext = getContext(sessionId);
      const a2uiData = data as A2UIMessage;

      // Handle begin rendering
      if (a2uiData.beginRendering) {
        a2uiContext.surfaces.set(a2uiData.beginRendering.surface, {
          surface: a2uiData.beginRendering.surface,
          mimeType: a2uiData.beginRendering.mimeType,
          content: null,
          finished: false,
        });
      }

      // Handle surface update
      if (a2uiData.surfaceUpdate) {
        const surface = a2uiContext.surfaces.get(
          a2uiData.surfaceUpdate.surface,
        );
        if (surface) {
          if (a2uiData.surfaceUpdate.replace !== undefined) {
            surface.content = a2uiData.surfaceUpdate.replace;
          } else if (a2uiData.surfaceUpdate.patch !== undefined) {
            // Apply JSON patch (simplified)
            surface.content = applyPatch(
              surface.content,
              a2uiData.surfaceUpdate.patch,
            );
          }
        }
      }

      // Handle data model update
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

      // Handle finish rendering
      if (a2uiData.finishRendering) {
        const surface = a2uiContext.surfaces.get(
          a2uiData.finishRendering.surface,
        );
        if (surface) {
          surface.finished = true;
        }
      }

      // Render surfaces
      const surfacesToRender = Array.from(a2uiContext.surfaces.values());

      return React.createElement(
        'div',
        { className: 'chat-a2ui-container' },
        surfacesToRender.map(surface => {
          // Check for custom renderer
          if (
            customRenderers &&
            surface.mimeType &&
            customRenderers[surface.mimeType]
          ) {
            const CustomRenderer = customRenderers[surface.mimeType];
            return React.createElement(CustomRenderer, {
              key: surface.surface,
              content: surface.content,
            });
          }

          // Default rendering based on mime type
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
 * Render surface content based on mime type
 */
function renderSurfaceContent(surface: SurfaceState): React.ReactNode {
  const { content, mimeType } = surface;

  if (content === null || content === undefined) {
    return null;
  }

  // Handle different mime types
  switch (mimeType) {
    case 'text/plain':
      return React.createElement('pre', null, String(content));

    case 'text/markdown':
      // Would need markdown renderer
      return React.createElement(
        'div',
        { className: 'markdown' },
        String(content),
      );

    case 'text/html':
      return React.createElement('div', {
        dangerouslySetInnerHTML: { __html: String(content) },
      });

    case 'application/json':
      return React.createElement(
        'pre',
        { className: 'json' },
        JSON.stringify(content, null, 2),
      );

    case 'image/png':
    case 'image/jpeg':
    case 'image/gif':
    case 'image/webp':
      if (typeof content === 'string') {
        return React.createElement('img', {
          src: content.startsWith('data:')
            ? content
            : `data:${mimeType};base64,${content}`,
          alt: surface.surface,
        });
      }
      break;

    default:
      // Try to render as string or JSON
      if (typeof content === 'string') {
        return React.createElement('pre', null, content);
      }
      return React.createElement('pre', null, JSON.stringify(content, null, 2));
  }

  return null;
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
        // Simplified - not fully implemented
        break;
    }
  }

  return result;
}

/**
 * Set a nested value in an object
 */
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

/**
 * Remove a nested value from an object
 */
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
 * A2UI Extension implementation class
 */
export class A2UIExtensionImpl implements ActivityRendererExtension {
  readonly name = 'a2ui';
  readonly type = 'activity-renderer' as const;
  readonly activityTypes = ['a2ui'];
  readonly priority = 10;

  private contexts = new Map<string, A2UIContext>();
  private customRenderers: Record<
    string,
    React.ComponentType<{ content: unknown }>
  > = {};

  /**
   * Register a custom renderer for a mime type
   */
  registerRenderer(
    mimeType: string,
    component: React.ComponentType<{ content: unknown }>,
  ): void {
    this.customRenderers[mimeType] = component;
  }

  /**
   * Get the current surfaces for a session
   */
  getSurfaces(sessionId: string): Map<string, unknown> {
    const context = this.contexts.get(sessionId);
    if (!context) return new Map();

    const result = new Map<string, unknown>();
    for (const [key, surface] of context.surfaces) {
      result.set(key, surface.content);
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
        content: null,
        finished: false,
      });
    }

    if (message.surfaceUpdate) {
      const surface = context.surfaces.get(message.surfaceUpdate.surface);
      if (surface) {
        if (message.surfaceUpdate.replace !== undefined) {
          surface.content = message.surfaceUpdate.replace;
        } else if (message.surfaceUpdate.patch !== undefined) {
          surface.content = applyPatch(
            surface.content,
            message.surfaceUpdate.patch,
          );
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
   * Render method for the extension
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
        if (this.customRenderers[surface.mimeType || '']) {
          const CustomRenderer = this.customRenderers[surface.mimeType || ''];
          return React.createElement(CustomRenderer, {
            key: surface.surface,
            content: surface.content,
          });
        }

        return React.createElement(
          'div',
          {
            key: surface.surface,
            className: `chat-a2ui-surface`,
          },
          renderSurfaceContent(surface),
        );
      }),
    );
  };
}

// Re-export namespace for external use
export type { A2UIExtensionNamespace };
