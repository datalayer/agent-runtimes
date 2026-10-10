/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * MCP-UI plugin for chat component.
 * Renders MCP UI protocol messages and resources.
 *
 * What it never draws (STUDIO D-22): the markup of a resource (`text/html`)
 * and a UI element built from a tool's props. Either is markup a server or a
 * model supplies, and the chat may sit on the platform's origin, where people
 * are signed in: each is refused in a sentence, in place, with no fallback.
 * A host that holds an origin of its own for such pages registers its own
 * renderer for the type (`registerMimeTypeRenderer`).
 *
 * @module components/uiPlugins/MCPUIPlugin
 */

import React from 'react';
import type { ActivityRendererUIPlugin } from '../types/uiPlugins';

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
 * What the chat says in place of the MCP UI's markup (STUDIO D-22).
 */
export const MCP_UI_NOT_DRAWN = {
  html: 'This answer carries a page of HTML from its MCP server. It is not drawn here: no markup from a server or a model reaches this page.',
  element:
    'This answer carries an interface built by its MCP server. It is not drawn here: no markup from a server or a model reaches this page.',
} as const;

/** A sentence in place of what is not drawn. */
const NotDrawn: React.FC<{ children: string }> = ({ children }) => (
  <p
    className="mcp-ui-not-drawn"
    data-mcp-ui-not-drawn=""
    style={{
      padding: '8px 12px',
      margin: '4px 0',
      borderRadius: '6px',
      border: '1px solid var(--color-border-default)',
      color: 'var(--color-fg-muted)',
    }}
  >
    {children}
  </p>
);

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
): ActivityRendererUIPlugin {
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

      // A UI element is markup built from a tool's props: not drawn.
      if (mcpData.uiElement) {
        return <NotDrawn>{MCP_UI_NOT_DRAWN.element}</NotDrawn>;
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

    if (mimeType.split(';', 1)[0].trim().toLowerCase() === 'text/html') {
      return <NotDrawn>{MCP_UI_NOT_DRAWN.html}</NotDrawn>;
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
 * MCP-UI UI plugin implementation class
 */
export class MCPUIPluginImpl {
  private renderer: ActivityRendererUIPlugin;
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
   * Get the activity renderer plugin
   */
  getRenderer(): ActivityRendererUIPlugin {
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
   * Cleanup plugin state
   */
  cleanup(): void {
    // Context cleanup handled by renderer garbage collection
  }
}
