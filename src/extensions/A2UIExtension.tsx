/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A2UI extension for chat component.
 * Renders A2UI protocol messages from A2A agents using @a2ui/react v0.8.
 *
 * @module components/extensions/A2UIExtension
 */

import React from 'react';
import { A2UIViewer, initializeDefaultCatalog } from '@a2ui/react';
import type { ComponentInstance } from '@a2ui/react';
import type { ChatMessage } from '../types/messges';
import type {
  ActivityRendererExtension,
  A2UIExtension as A2UIExtensionNamespace,
} from '../types/extensions';

initializeDefaultCatalog();

interface ValueMap {
  key: string;
  valueString?: string;
  valueNumber?: number;
  valueBoolean?: boolean;
  valueMap?: ValueMap[];
}

/**
 * A2UI v0.8 message shape (latest only).
 */
export interface A2UIMessage {
  beginRendering?: {
    surfaceId: string;
    root: string;
    mimeType?: string;
  };

  surfaceUpdate?: {
    surfaceId: string;
    components: ComponentInstance[];
  };

  dataModelUpdate?: {
    surfaceId: string;
    path?: string;
    contents: ValueMap[];
  };

  finishRendering?: {
    surfaceId: string;
  };
}

interface SurfaceState {
  surfaceId: string;
  root: string;
  mimeType?: string;
  components: ComponentInstance[];
  data: Record<string, unknown>;
  finished: boolean;
}

interface A2UIContext {
  surfaces: Map<string, SurfaceState>;
  dataModels: Map<string, unknown>;
}

function valueMapToObject(valueMap: ValueMap[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const item of valueMap) {
    if (item.valueString !== undefined) {
      result[item.key] = item.valueString;
      continue;
    }
    if (item.valueNumber !== undefined) {
      result[item.key] = item.valueNumber;
      continue;
    }
    if (item.valueBoolean !== undefined) {
      result[item.key] = item.valueBoolean;
      continue;
    }
    if (item.valueMap !== undefined) {
      result[item.key] = valueMapToObject(item.valueMap);
      continue;
    }
    result[item.key] = null;
  }
  return result;
}

function setNestedValue(
  obj: Record<string, unknown>,
  path: string[],
  value: unknown,
): void {
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const next = current[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  if (path.length > 0) {
    current[path[path.length - 1]] = value;
  }
}

function processA2UIMessage(context: A2UIContext, message: A2UIMessage): void {
  if (message.beginRendering) {
    context.surfaces.set(message.beginRendering.surfaceId, {
      surfaceId: message.beginRendering.surfaceId,
      root: message.beginRendering.root,
      mimeType: message.beginRendering.mimeType,
      components: [],
      data: {},
      finished: false,
    });
  }

  if (message.surfaceUpdate) {
    const surface = context.surfaces.get(message.surfaceUpdate.surfaceId);
    if (surface) {
      surface.components = message.surfaceUpdate.components;
    }
  }

  if (message.dataModelUpdate) {
    const surface = context.surfaces.get(message.dataModelUpdate.surfaceId);
    const nextData = valueMapToObject(message.dataModelUpdate.contents);

    if (surface) {
      if (
        message.dataModelUpdate.path &&
        message.dataModelUpdate.path !== '/'
      ) {
        const pathParts = message.dataModelUpdate.path
          .split('/')
          .filter(Boolean);
        setNestedValue(surface.data, pathParts, nextData);
      } else {
        surface.data = {
          ...surface.data,
          ...nextData,
        };
      }
      context.dataModels.set(message.dataModelUpdate.surfaceId, surface.data);
    } else {
      context.dataModels.set(message.dataModelUpdate.surfaceId, nextData);
    }
  }

  if (message.finishRendering) {
    const surface = context.surfaces.get(message.finishRendering.surfaceId);
    if (surface) {
      surface.finished = true;
    }
  }
}

function renderSurfaceContent(surface: SurfaceState): React.ReactNode {
  const { components, mimeType } = surface;

  if (components.length === 0) {
    return null;
  }

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

function renderSurfaces(context: A2UIContext): React.ReactElement {
  const surfacesToRender = Array.from(context.surfaces.values());

  return React.createElement(
    'div',
    { className: 'chat-a2ui-container' },
    surfacesToRender.map(surface => {
      if (surface.components.length > 0) {
        return React.createElement(A2UIViewer, {
          key: surface.surfaceId,
          root: surface.root,
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
          key: surface.surfaceId,
          className: `chat-a2ui-surface chat-a2ui-surface--${surface.mimeType?.replace('/', '-') || 'unknown'}`,
        },
        renderSurfaceContent(surface),
      );
    }),
  );
}

/**
 * Create A2UI activity renderer.
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
    render: ({ data }) => {
      const sessionId = 'default';
      const context = getContext(sessionId);
      processA2UIMessage(context, data as A2UIMessage);
      return renderSurfaces(context);
    },
    priority: 10,
  };
}

/**
 * A2UI Extension implementation class.
 */
export class A2UIExtensionImpl implements ActivityRendererExtension {
  readonly name = 'a2ui';
  readonly type = 'activity-renderer' as const;
  readonly activityTypes = ['a2ui'];
  readonly priority = 10;

  private contexts = new Map<string, A2UIContext>();

  getSurfaces(sessionId: string): Map<string, unknown> {
    const context = this.contexts.get(sessionId);
    if (!context) return new Map();

    const result = new Map<string, unknown>();
    for (const [key, surface] of context.surfaces) {
      result.set(key, surface.components);
    }
    return result;
  }

  getDataModels(sessionId: string): Map<string, unknown> {
    return this.contexts.get(sessionId)?.dataModels || new Map();
  }

  processMessage(sessionId: string, message: A2UIMessage): void {
    if (!this.contexts.has(sessionId)) {
      this.contexts.set(sessionId, {
        surfaces: new Map(),
        dataModels: new Map(),
      });
    }

    const context = this.contexts.get(sessionId)!;
    processA2UIMessage(context, message);
  }

  clearSession(sessionId: string): void {
    this.contexts.delete(sessionId);
  }

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

    return renderSurfaces(ctx);
  };
}

export type { A2UIExtensionNamespace };
