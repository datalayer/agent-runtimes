# Vercel AI and AG-UI Usage Guide

This guide shows how to use the Vercel AI SDK and AG-UI protocols with agent-runtimes.

## Overview

Agent-runtimes now supports **Pydantic AI's native UI protocols**:

- **Vercel AI SDK**: For React/Next.js applications using Vercel's AI SDK
- **AG-UI**: For simple, lightweight web interfaces

Both protocols use Pydantic AI's built-in adapters for optimal compatibility.

## Quick Start

### 1. Start the Server

```bash
# Development mode
python -m agent_runtimes.server

# Or with uvicorn
uvicorn agent_runtimes.server.app:app --reload
```

The server will automatically register a demo agent with all protocols:
- **ACP**: `ws://localhost:8000/api/v1/acp/ws`
- **Vercel AI**: `http://localhost:8000/api/v1/vercel-ai/chat`
- **AG-UI**: `http://localhost:8000/api/v1/ag-ui/demo-agent/`

### 2. Test the Endpoints

```bash
# List available agents
curl http://localhost:8000/api/v1/vercel-ai/agents
curl http://localhost:8000/api/v1/ag-ui/agents
```

## Vercel AI SDK Integration

### Server-Side Setup

The server is already configured! The demo agent is automatically available at:
```
POST /api/v1/vercel-ai/chat
```

### Client-Side (React)

1. **Install Vercel AI SDK**:
```bash
npm install ai
```

2. **Use the `useChat` hook**:

```tsx
'use client';

import { useChat } from 'ai/react';

export default function ChatComponent() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/v1/vercel-ai/chat',
  });

  return (
    <div>
      <div>
        {messages.map(m => (
          <div key={m.id}>
            <strong>{m.role}: </strong>
            {m.content}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          disabled={isLoading}
          placeholder="Type your message..."
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}
```

3. **With Tool Calls**:

```tsx
import { useChat } from 'ai/react';

export default function ChatWithTools() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/v1/vercel-ai/chat',
    onToolCall: ({ toolCall }) => {
      console.log('Tool called:', toolCall.toolName, toolCall.args);
    },
  });

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          <strong>{m.role}: </strong>
          {m.content}

          {/* Show tool calls */}
          {m.toolInvocations?.map((tool, i) => (
            <div key={i} style={{ background: '#f0f0f0', padding: '8px' }}>
              🛠️ {tool.toolName}({JSON.stringify(tool.args)})
              {tool.result && <div>→ {JSON.stringify(tool.result)}</div>}
            </div>
          ))}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

### Next.js API Route (Alternative)

If you prefer to proxy through Next.js:

```typescript
// app/api/chat/route.ts
export async function POST(req: Request) {
  const response = await fetch('http://localhost:8000/api/v1/vercel-ai/chat', {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify(await req.json()),
  });

  return new Response(response.body, {
    headers: response.headers,
  });
}
```

## AG-UI Integration

### Server-Side Setup

The server is already configured! Each agent is mounted at:
```
/api/v1/ag-ui/{agent_id}/
```

For the demo agent:
```
http://localhost:8000/api/v1/ag-ui/demo-agent/
```

### Access the UI

Simply open your browser to:
```
http://localhost:8000/api/v1/ag-ui/demo-agent/
```

AG-UI provides a complete web interface out of the box!

### Embedding AG-UI

You can embed the AG-UI interface in your app using an iframe:

```html
<iframe
  src="http://localhost:8000/api/v1/ag-ui/demo-agent/"
  width="100%"
  height="600"
  frameborder="0"
></iframe>
```

## Registering Custom Agents

### With Vercel AI

```python
from pydantic_ai import Agent
from agent_runtimes.agents import PydanticAIAgent
from agent_runtimes.adapters import VercelAIAdapter
from agent_runtimes.server.routes import register_vercel_agent

# Create your Pydantic AI agent
pydantic_agent = Agent(
    "openai:gpt-4o",
    system_prompt="You are a helpful assistant"
)

# Add tools
@pydantic_agent.tool_plain
def get_weather(city: str) -> str:
    """Get the weather for a city."""
    return f"The weather in {city} is sunny!"

# Wrap with agent adapter
agent = PydanticAIAgent(pydantic_agent)

# Create Vercel AI adapter
vercel_adapter = VercelAIAdapter(agent)

# Register with the server
register_vercel_agent("my-agent", vercel_adapter)
```

Now available at: `POST /api/v1/vercel-ai/chat/my-agent`

### With AG-UI

```python
from pydantic_ai import Agent
from agent_runtimes.agents import PydanticAIAgent
from agent_runtimes.adapters import AGUIAdapter
from agent_runtimes.server.routes import register_agui_agent

# Create your Pydantic AI agent
pydantic_agent = Agent(
    "openai:gpt-4o",
    system_prompt="You are a helpful assistant"
)

# Wrap with agent adapter
agent = PydanticAIAgent(pydantic_agent)

# Create AG-UI adapter
agui_adapter = AGUIAdapter(agent)

# Register with the server
register_agui_agent("my-agent", agui_adapter)
```

Now available at: `http://localhost:8000/api/v1/ag-ui/my-agent/`

## Advanced Configuration

### Usage Limits (Vercel AI)

```python
from pydantic_ai import UsageLimits

vercel_adapter = VercelAIAdapter(
    agent,
    usage_limits=UsageLimits(
        tool_calls_limit=10,
        output_tokens_limit=10000,
        total_tokens_limit=200000,
    )
)
```

### With MCP Tools (Vercel AI)

```python
from agent_runtimes.handlers.chat.tools import create_mcp_server

# Create MCP server
mcp_server = create_mcp_server(
    base_url="http://localhost:8888",
    token="your-token"
)

# Create adapter with MCP tools
vercel_adapter = VercelAIAdapter(
    agent,
    toolsets=[mcp_server],
)
```

## Complete Example

Here's a complete example combining everything:

```python
# server.py
from pydantic_ai import Agent, UsageLimits
from agent_runtimes.agents import PydanticAIAgent
from agent_runtimes.adapters import VercelAIAdapter, AGUIAdapter
from agent_runtimes.server.routes import register_vercel_agent, register_agui_agent
from agent_runtimes.server.app import create_app

# Create agent
pydantic_agent = Agent(
    "openai:gpt-4o",
    system_prompt="You are a helpful coding assistant"
)

@pydantic_agent.tool_plain
def execute_python(code: str) -> str:
    """Execute Python code safely."""
    # Implement safe execution
    return "Code executed successfully"

# Wrap agent
agent = PydanticAIAgent(pydantic_agent, name="code-assistant")

# Create adapters
vercel_adapter = VercelAIAdapter(
    agent,
    usage_limits=UsageLimits(tool_calls_limit=5)
)
agui_adapter = AGUIAdapter(agent)

# Create app
app = create_app()

# Register during startup (or in lifespan)
register_vercel_agent("code-assistant", vercel_adapter)
register_agui_agent("code-assistant", agui_adapter)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

## Troubleshooting

### Vercel AI: Stream Not Working

Make sure your client is using the streaming API:
```tsx
const { messages, input, handleSubmit } = useChat({
  api: '/api/v1/vercel-ai/chat',
  streamMode: 'stream-data', // or 'text'
});
```

### AG-UI: 404 Not Found

Check that:
1. The agent is registered: `GET /api/v1/ag-ui/agents`
2. You're using the correct URL: `/api/v1/ag-ui/{agent_id}/`
3. The trailing slash is included

### CORS Issues

If calling from a different origin, ensure CORS is configured:

```python
from agent_runtimes.server.app import ServerConfig, create_app

config = ServerConfig(
    cors_origins=["http://localhost:3000"],
)
app = create_app(config)
```

## See Also

- **Pydantic AI Vercel AI Docs**: https://ai.pydantic.dev/ui/vercel-ai/
- **Pydantic AI AG-UI Docs**: https://ai.pydantic.dev/ui/ag-ui/
- **Vercel AI SDK Docs**: https://sdk.vercel.ai/docs
- **Architecture Guide**: See `ARCHITECTURE.md`
- **Quick Reference**: See `QUICK_REFERENCE.md`
