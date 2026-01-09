/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * MCP-UI extension for chat component.
 * Renders MCP UI protocol messages and resources.
 *
 * @module components/chat/extensions/MCPUIExtension
 */

import React from 'react';
import type { ActivityRendererExtension } from '../types/extension';

/**
 * MCP-UI resource types
 */
export interface MCPUIResource {
  /** Resource URI */
  uri: string;
  /** Resource name */
  name?: string;
  /** Resource description */
  description?: string;
  /** MIME type */
  mimeType?: string;
  /** Resource content */
  content?: unknown;
  /** Text content */
  text?: string;
  /** Blob content */
  blob?: string;
}

/**
 * MCP-UI message types
 */
export interface MCPUIMessage {
  /** Resource list update */
  resourceList?: {
    resources: MCPUIResource[];
  };

  /** Resource content */
  resourceContent?: {
    uri: string;
    content: MCPUIResource;
  };

  /** UI element */
  uiElement?: {
    type: string;
    props?: Record<string, unknown>;
    children?: MCPUIMessage[];
  };
}

/**
 * MCP-UI context for tracking state
 */
interface MCPUIContext {
  resources: Map<string, MCPUIResource>;
}

/**
 * Create MCP-UI activity renderer
 */
export function createMCPUIRenderer(
  customRenderers?: Record<
    string,
    React.ComponentType<{ resource: MCPUIResource }>
  >,
): ActivityRendererExtension {
  // Track resources per session
  const contexts = new Map<string, MCPUIContext>();

  const getContext = (sessionId: string): MCPUIContext => {
    if (!contexts.has(sessionId)) {
      contexts.set(sessionId, {
        resources: new Map(),
      });
    }
    return contexts.get(sessionId)!;
  };

  return {
    name: 'mcp-ui-renderer',
    type: 'activity-renderer',
    activityTypes: ['mcp-ui'],

    render: ({ activityType: _activityType, data, message: _message }) => {
      // Use default session for now
      const sessionId = 'default';
      const mcpContext = getContext(sessionId);
      const mcpData = data as MCPUIMessage;

      // Handle resource list
      if (mcpData.resourceList) {
        for (const resource of mcpData.resourceList.resources) {
          mcpContext.resources.set(resource.uri, resource);
        }

        return (
          <div className="mcp-ui-resource-list">
            {mcpData.resourceList.resources.map((resource, index) => (
              <ResourceItem key={resource.uri || index} resource={resource} />
            ))}
          </div>
        );
      }

      // Handle resource content
      if (mcpData.resourceContent) {
        const { uri, content } = mcpData.resourceContent;
        mcpContext.resources.set(uri, content);

        // Check for custom renderer
        if (customRenderers && content.mimeType) {
          const CustomRenderer = customRenderers[content.mimeType];
          if (CustomRenderer) {
            return <CustomRenderer resource={content} />;
          }
        }

        return <ResourceContent resource={content} />;
      }

      // Handle UI element
      if (mcpData.uiElement) {
        return <UIElement element={mcpData.uiElement} />;
      }

      // Fallback: render raw data
      return <pre className="mcp-ui-raw">{JSON.stringify(data, null, 2)}</pre>;
    },
  };
}

/**
 * Resource item component
 */
const ResourceItem: React.FC<{ resource: MCPUIResource }> = ({ resource }) => {
  return (
    <div
      style={{
        padding: '8px 12px',
        margin: '4px 0',
        backgroundColor: 'var(--color-canvas-subtle)',
        borderRadius: '6px',
        border: '1px solid var(--color-border-default)',
      }}
    >
      <div style={{ fontWeight: 500, marginBottom: '4px' }}>
        {resource.name || resource.uri}
      </div>
      {resource.description && (
        <div style={{ fontSize: '12px', color: 'var(--color-fg-muted)' }}>
          {resource.description}
        </div>
      )}
      {resource.mimeType && (
        <div
          style={{
            fontSize: '11px',
            color: 'var(--color-fg-subtle)',
            marginTop: '4px',
          }}
        >
          {resource.mimeType}
        </div>
      )}
    </div>
  );
};

/**
 * Resource content component
 */
const ResourceContent: React.FC<{ resource: MCPUIResource }> = ({
  resource,
}) => {
  const mimeType = resource.mimeType || 'text/plain';

  // Handle text content
  if (
    resource.text ||
    (mimeType.startsWith('text/') && typeof resource.content === 'string')
  ) {
    const text = resource.text || (resource.content as string);

    if (mimeType === 'text/html') {
      return (
        <div
          className="mcp-ui-html"
          dangerouslySetInnerHTML={{ __html: text }}
          style={{
            padding: '12px',
            backgroundColor: 'var(--color-canvas-subtle)',
            borderRadius: '6px',
          }}
        />
      );
    }

    if (mimeType === 'text/markdown') {
      // For markdown, we'd ideally use a markdown renderer
      // For now, just show as preformatted text
      return (
        <pre
          style={{
            padding: '12px',
            backgroundColor: 'var(--color-canvas-subtle)',
            borderRadius: '6px',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {text}
        </pre>
      );
    }

    // Plain text or code
    return (
      <pre
        style={{
          padding: '12px',
          backgroundColor: 'var(--color-canvas-subtle)',
          borderRadius: '6px',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
        }}
      >
        {text}
      </pre>
    );
  }

  // Handle blob content (base64 encoded)
  if (resource.blob) {
    if (mimeType.startsWith('image/')) {
      return (
        <img
          src={`data:${mimeType};base64,${resource.blob}`}
          alt={resource.name || 'MCP Resource'}
          style={{ maxWidth: '100%', borderRadius: '6px' }}
        />
      );
    }

    // For other blob types, show download link
    return (
      <a
        href={`data:${mimeType};base64,${resource.blob}`}
        download={resource.name || 'resource'}
        style={{
          display: 'inline-block',
          padding: '8px 16px',
          backgroundColor: 'var(--color-accent-emphasis)',
          color: 'var(--color-fg-on-emphasis)',
          borderRadius: '6px',
          textDecoration: 'none',
        }}
      >
        Download {resource.name || 'resource'}
      </a>
    );
  }

  // Handle JSON content
  if (mimeType === 'application/json' || typeof resource.content === 'object') {
    return (
      <pre
        style={{
          padding: '12px',
          backgroundColor: 'var(--color-canvas-subtle)',
          borderRadius: '6px',
          overflow: 'auto',
          fontFamily: 'monospace',
        }}
      >
        {JSON.stringify(resource.content, null, 2)}
      </pre>
    );
  }

  // Fallback
  return (
    <div
      style={{
        padding: '12px',
        backgroundColor: 'var(--color-canvas-subtle)',
        borderRadius: '6px',
        color: 'var(--color-fg-muted)',
      }}
    >
      Resource: {resource.uri}
    </div>
  );
};

/**
 * UI Element component for rendering MCP UI elements
 */
const UIElement: React.FC<{ element: MCPUIMessage['uiElement'] }> = ({
  element,
}) => {
  if (!element) return null;

  const { type, props = {}, children } = element;

  // Map MCP UI element types to HTML elements
  const elementMap: Record<string, string> = {
    container: 'div',
    text: 'span',
    button: 'button',
    input: 'input',
    form: 'form',
    list: 'ul',
    listItem: 'li',
    heading: 'h3',
    paragraph: 'p',
    link: 'a',
    image: 'img',
    code: 'code',
    pre: 'pre',
  };

  const htmlTag = elementMap[type] || 'div';

  return React.createElement(
    htmlTag,
    {
      ...props,
      style: {
        ...((props.style as React.CSSProperties) || {}),
      },
    },
    children?.map((child, index) => (
      <UIElement key={index} element={child.uiElement} />
    )),
  );
};

/**
 * MCP-UI Extension implementation class
 */
export class MCPUIExtensionImpl {
  private renderer: ActivityRendererExtension;
  private customRenderers: Record<
    string,
    React.ComponentType<{ resource: MCPUIResource }>
  >;

  constructor(
    customRenderers?: Record<
      string,
      React.ComponentType<{ resource: MCPUIResource }>
    >,
  ) {
    this.customRenderers = customRenderers || {};
    this.renderer = createMCPUIRenderer(this.customRenderers);
  }

  /**
   * Get the activity renderer extension
   */
  getRenderer(): ActivityRendererExtension {
    return this.renderer;
  }

  /**
   * Register a custom renderer for a MIME type
   */
  registerMimeTypeRenderer(
    mimeType: string,
    renderer: React.ComponentType<{ resource: MCPUIResource }>,
  ): void {
    this.customRenderers[mimeType] = renderer;
    // Recreate renderer with updated custom renderers
    this.renderer = createMCPUIRenderer(this.customRenderers);
  }

  /**
   * Cleanup extension state
   */
  cleanup(): void {
    // Context cleanup handled by renderer garbage collection
  }
}
