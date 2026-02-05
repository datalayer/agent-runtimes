# Testing MCP-UI Integration

## Quick Start

### 1. Install Dependencies

The MCP-UI dependencies should already be installed. If not:

```bash
# Python (from agent-runtimes directory)
pip install mcp-ui-server

# TypeScript (from agent-runtimes directory)
npm install @mcp-ui/client @mcp-ui/server
```

### 2. Start the Server

```bash
cd agent-runtimes
python -m agent_runtimes.server
```

The server will start on `http://localhost:8000` with the demo agent registered for all protocols including MCP-UI.

### 3. Access the Frontend

```bash
# In another terminal
npm run dev
```

Open your browser to the URL shown (typically `http://localhost:5173`).

### 4. Test MCP-UI Protocol

1. In the web interface, select **"MCP-UI"** from the protocol dropdown
2. Enter the base URL: `http://localhost:8000`
3. Enter agent ID: `demo-agent` (or leave default)
4. Click **"Connect to Agent"**
5. Send a message to the agent
6. Verify that responses appear correctly

## Testing UI Resources

### Create a Custom Tool with UI Resources

Add this to your agent configuration:

```python
from pydantic_ai import Agent
from mcp_ui_server import create_ui_resource, UIMetadataKey

agent = Agent("openai:gpt-4o")

@agent.tool
def show_dashboard(ctx) -> dict:
    """Display an interactive dashboard."""

    html = """
    <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h1>Interactive Dashboard</h1>
        <p>Welcome to the MCP-UI demo!</p>

        <button
            onclick="sendIntent('refresh', {action: 'refresh_data'})"
            style="background: #007cba; color: white; padding: 10px 20px;
                   border: none; border-radius: 4px; cursor: pointer;">
            Refresh Data
        </button>

        <div style="margin-top: 20px; padding: 15px;
                    background: #f6f8fa; border-radius: 6px;">
            <h3>Data Visualization</h3>
            <p>Chart would go here...</p>
        </div>
    </div>
    """

    return create_ui_resource({
        "uri": "ui://dashboard/main",
        "content": {
            "type": "rawHtml",
            "htmlString": html
        },
        "encoding": "text",
        "uiMetadata": {
            UIMetadataKey.PREFERRED_FRAME_SIZE: ["800px", "600px"]
        }
    })

@agent.tool
def show_external_app(ctx) -> dict:
    """Display an external application."""

    return create_ui_resource({
        "uri": "ui://external/example",
        "content": {
            "type": "externalUrl",
            "iframeUrl": "https://example.com"
        },
        "encoding": "text",
        "uiMetadata": {
            UIMetadataKey.PREFERRED_FRAME_SIZE: ["100%", "600px"]
        }
    })
```

### Test Messages

Try these prompts with the agent:

1. **"Show me a dashboard"** - Should trigger the `show_dashboard` tool
2. **"Display an external app"** - Should trigger the `show_external_app` tool
3. Any custom prompt that would use your tools

## Verifying the Implementation

### Backend Verification

1. Check server logs for MCP-UI registration:
   ```
   INFO: Registered demo agent with MCP-UI: demo-agent
   ```

2. Test the API directly:
   ```bash
   curl -X POST http://localhost:8000/api/v1/mcp-ui/chat/demo-agent \
     -H "Content-Type: application/json" \
     -d '{
       "message": "Hello",
       "session_id": "test-123"
     }'
   ```

3. Check available endpoints:
   ```bash
   curl http://localhost:8000/api/v1/mcp-ui/
   curl http://localhost:8000/api/v1/mcp-ui/agents
   ```

### Frontend Verification

1. **Protocol Selector**: MCP-UI should appear in the dropdown
2. **Connection**: Should connect without errors
3. **Messages**: Should send and receive correctly
4. **UI Resources**: Should render in the chat interface
5. **Actions**: Interactive elements should work

### Browser Console

Check for:
- ✅ No React errors
- ✅ Successful API calls
- ✅ UIResourceRenderer loading correctly
- ✅ Iframe sandboxing working

## Troubleshooting

### Import Errors

If you get `ImportError: No module named 'mcp_ui_server'`:

```bash
pip install mcp-ui-server
# or
cd ext/mcp-ui/sdks/python/server
pip install -e .
```

### TypeScript Errors

If you get `Cannot find module '@mcp-ui/client'`:

```bash
npm install @mcp-ui/client
# or build from source
cd ext/mcp-ui
pnpm install
pnpm build
```

### UI Resources Not Rendering

1. Check browser console for errors
2. Verify the resource URI starts with `ui://`
3. Check the mimeType is correct
4. Ensure iframe is not blocked by CSP

### Connection Issues

1. Verify server is running on `http://localhost:8000`
2. Check CORS settings in server
3. Verify agent is registered: `curl http://localhost:8000/api/v1/mcp-ui/agents`

## Expected Output

### Successful Connection
```
Protocol: MCP-UI
Endpoint: http://localhost:8000/api/v1/mcp-ui/chat/demo-agent
Status: Connected
```

### Message Flow
```
You: Show me a dashboard
Assistant: Here's your dashboard:
[UI Resource renders below with interactive elements]
```

### API Response
```json
{
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Here's your dashboard:"
    },
    {
      "type": "resource",
      "resource": {
        "uri": "ui://dashboard/main",
        "mimeType": "text/html",
        "text": "<div>...</div>"
      }
    }
  ],
  "session_id": "session-123"
}
```

## Next Steps

1. **Create Custom Tools**: Add tools that return UI resources
2. **Test Different Resource Types**: HTML, URLs, Remote DOM
3. **Test Interactive Features**: Buttons, forms, intents
4. **Performance Testing**: Large UIs, multiple resources
5. **Error Handling**: Invalid URIs, malformed content

## Resources

- [MCP-UI Documentation](https://mcpui.dev)
- [Integration Guide](./MCP_UI_GUIDE.md)
- [Architecture](./ARCHITECTURE.md)
- [Implementation Summary](./MCP_UI_IMPLEMENTATION.md)
