# MCP-UI Protocol Integration Guide

## Overview

The MCP-UI protocol enables agents to return interactive UI resources in their responses. This guide covers how to use MCP-UI with agent-runtimes.

## What is MCP-UI?

MCP-UI (Model Context Protocol UI) is a standardized protocol for including interactive UI components in agent responses. It supports:

- **HTML Resources**: Direct HTML content rendered in sandboxed iframes
- **External URLs**: Display external applications and websites
- **Remote DOM**: JavaScript-defined UI using host-native components
- **Secure Execution**: All content runs in sandboxed iframes
- **Two-way Communication**: UI can trigger actions back to the host

## Quick Start

### Server-Side (Python)

```python
from agent_runtimes.adapters import MCPUIAdapter
from agent_runtimes.agents import PydanticAIAgent
from pydantic_ai import Agent

# Create your agent
pydantic_agent = Agent("openai:gpt-4o")
agent = PydanticAIAgent(pydantic_agent)

# Create MCP-UI adapter
mcp_ui_adapter = MCPUIAdapter(agent)

# Register with server
from agent_runtimes.server.routes import register_mcp_ui_agent
register_mcp_ui_agent("my-agent", mcp_ui_adapter)
```

### Client-Side (React)

```tsx
import { MCPUIChatComponent } from '@datalayer/agent-runtimes';

function MyApp() {
  return (
    <MCPUIChatComponent
      baseUrl="http://localhost:8000"
      agentId="my-agent"
      placeholder="Ask me anything..."
      height="600px"
    />
  );
}
```

Or use the Unified Chat Component:

```tsx
import { UnifiedChatComponent } from '@datalayer/agent-runtimes';

function MyApp() {
  return (
    <UnifiedChatComponent
      protocol="mcp-ui"
      baseUrl="http://localhost:8000"
      agentId="my-agent"
    />
  );
}
```

## Creating UI Resources

### HTML Resources

```python
from mcp_ui_server import create_ui_resource, UIMetadataKey

# Simple HTML
resource = create_ui_resource({
    "uri": "ui://my-component/1",
    "content": {
        "type": "rawHtml",
        "htmlString": "<h1>Hello World</h1>"
    },
    "encoding": "text",
    "uiMetadata": {
        UIMetadataKey.PREFERRED_FRAME_SIZE: ["800px", "600px"]
    }
})
```

### External URL Resources

```python
resource = create_ui_resource({
    "uri": "ui://dashboard/1",
    "content": {
        "type": "externalUrl",
        "iframeUrl": "https://example.com/dashboard"
    },
    "encoding": "text",
    "uiMetadata": {
        UIMetadataKey.PREFERRED_FRAME_SIZE: ["100%", "80vh"]
    }
})
```

### Remote DOM Resources

```python
remote_dom_script = """
const p = document.createElement('ui-text');
p.textContent = 'This is a remote DOM element';
root.appendChild(p);
"""

resource = create_ui_resource({
    "uri": "ui://remote/1",
    "content": {
        "type": "remoteDom",
        "script": remote_dom_script,
        "framework": "react"  # or "webcomponents"
    },
    "encoding": "text"
})
```

## Using the Adapter

### Direct Usage

```python
from agent_runtimes.adapters import MCPUIAdapter

# Create adapter with custom settings
adapter = MCPUIAdapter(
    agent,
    enable_ui_transforms=True,
    default_frame_size=("100%", "600px")
)

# Helper methods for creating resources
html_resource = adapter.create_html_resource(
    uri="ui://greeting",
    html="<h1>Hello!</h1>",
    frame_size=("800px", "400px")
)

url_resource = adapter.create_external_url_resource(
    uri="ui://dashboard",
    url="https://example.com",
    frame_size=("100%", "80vh")
)

remote_dom_resource = adapter.create_remote_dom_resource(
    uri="ui://widget",
    script="const div = document.createElement('div'); ...",
    framework="react"
)
```

### In Agent Tools

```python
from pydantic_ai import Agent, RunContext
from mcp_ui_server import create_ui_resource

agent = Agent("openai:gpt-4o")

@agent.tool
def show_chart(ctx: RunContext[dict], data: list[int]) -> dict:
    """Display a chart visualization."""

    # Create HTML chart
    html = f"""
    <div>
        <h2>Data Visualization</h2>
        <canvas id="chart"></canvas>
        <script>
            // Chart rendering code
            const data = {data};
            // ... render chart
        </script>
    </div>
    """

    resource = create_ui_resource({
        "uri": "ui://chart/1",
        "content": {"type": "rawHtml", "htmlString": html},
        "encoding": "text"
    })

    return resource
```

## API Endpoints

### Chat Endpoint (Non-Streaming)

**POST** `/api/v1/mcp-ui/chat/{agent_id}`

Request:
```json
{
  "message": "Show me a visualization",
  "session_id": "session-123",
  "ui_options": {}
}
```

Response:
```json
{
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Here's the visualization:"
    },
    {
      "type": "resource",
      "resource": {
        "uri": "ui://viz/chart",
        "mimeType": "text/html",
        "text": "<div>...</div>"
      }
    }
  ],
  "session_id": "session-123"
}
```

### Stream Endpoint

**POST** `/api/v1/mcp-ui/stream/{agent_id}`

Streams responses as JSON lines (NDJSON):

```json
{"type": "start", "session_id": "session-123"}
{"type": "delta", "delta": "Here's "}
{"type": "delta", "delta": "the visualization:"}
{"type": "resource", "resource": {...}}
{"type": "complete", "session_id": "session-123"}
```

## UI Metadata

Use `UIMetadataKey` constants for type-safe metadata:

```python
from mcp_ui_server import UIMetadataKey

ui_metadata = {
    # Preferred iframe dimensions
    UIMetadataKey.PREFERRED_FRAME_SIZE: ["800px", "600px"],

    # Initial data for the UI
    UIMetadataKey.INITIAL_RENDER_DATA: {
        "user": {"id": "123", "name": "John"},
        "config": {"theme": "dark"}
    }
}
```

## Handling UI Actions

UI resources can trigger actions back to the host:

```tsx
import { UIResourceRenderer } from '@mcp-ui/client';
import type { UIActionResult } from '@mcp-ui/client';

function MyComponent({ resource }) {
  const handleUIAction = async (result: UIActionResult) => {
    if (result.type === 'tool') {
      console.log('Tool call:', result.payload.toolName);
      // Send back to server for execution
    } else if (result.type === 'prompt') {
      console.log('Prompt:', result.payload.prompt);
      // Fill input with the prompt
    } else if (result.type === 'link') {
      console.log('Link:', result.payload.url);
      // Open URL
      window.open(result.payload.url, '_blank');
    } else if (result.type === 'intent') {
      console.log('Intent:', result.payload.intent);
      // Handle custom intent
    } else if (result.type === 'notify') {
      console.log('Notification:', result.payload.message);
      // Show notification
    }

    return { status: 'handled' };
  };

  return (
    <UIResourceRenderer
      resource={resource}
      onUIAction={handleUIAction}
    />
  );
}
```

## Protocol Details

### Resource URI Format

All UI resources must use the `ui://` scheme:

```
ui://component-name/instance-id
ui://dashboard/user-123
ui://chart/visualization-456
```

### MIME Types

- `text/html` - Raw HTML content
- `text/uri-list` - External URL
- `application/vnd.mcp-ui.remote-dom+javascript; framework=react` - Remote DOM (React)
- `application/vnd.mcp-ui.remote-dom+javascript; framework=webcomponents` - Remote DOM (Web Components)

### Content Encoding

- `text` - Plain text (default)
- `blob` - Base64 encoded

## Best Practices

1. **Security**: Always validate and sanitize user input before including in HTML
2. **Performance**: Use appropriate frame sizes to avoid excessive memory usage
3. **Accessibility**: Include proper ARIA labels and semantic HTML
4. **Responsiveness**: Use CSS units like `%`, `vh`, `vw` for flexible layouts
5. **Error Handling**: Provide fallback content when UI resources fail to load

## Example: Complete Integration

```python
# server.py
from pydantic_ai import Agent
from agent_runtimes.agents import PydanticAIAgent
from agent_runtimes.adapters import MCPUIAdapter
from agent_runtimes.server import create_app
from agent_runtimes.server.routes import register_mcp_ui_agent
from mcp_ui_server import create_ui_resource

# Create agent with tools
pydantic_agent = Agent("openai:gpt-4o")

@pydantic_agent.tool
def create_dashboard(ctx, user_id: str):
    """Create an interactive dashboard."""
    html = f"""
    <div style="padding: 20px;">
        <h1>Dashboard for User {user_id}</h1>
        <button onclick="sendIntent('refresh', {{userId: '{user_id}'}})">
            Refresh Data
        </button>
    </div>
    """
    return create_ui_resource({
        "uri": f"ui://dashboard/{user_id}",
        "content": {"type": "rawHtml", "htmlString": html},
        "encoding": "text"
    })

# Wrap and register
agent = PydanticAIAgent(pydantic_agent)
adapter = MCPUIAdapter(agent)
register_mcp_ui_agent("dashboard-agent", adapter)

# Create app
app = create_app()
```

## References

- [MCP-UI Documentation](https://mcpui.dev)
- [MCP-UI GitHub](https://github.com/idosal/mcp-ui)
- [Agent Runtimes Architecture](./ARCHITECTURE.md)
- [Protocol Specifications](./ARCHITECTURE.md#protocol-specifications)
