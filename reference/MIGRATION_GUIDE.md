# Adapter Pattern Migration Guide

This guide helps you understand and use the new adapter architecture in agent-runtimes.

## What Changed?

### Before
- Direct coupling between agents and protocols
- Limited to Pydantic AI + ACP only
- Hard to add new agent libraries or protocols

### After
- Clean separation via adapter pattern
- Support for multiple agents (Pydantic AI, LangChain, Jupyter AI)
- Support for multiple protocols (ACP, AG-UI, A2A)
- Easy to extend with new agents and protocols

## Migration for Existing Code

### If you were using the demo agent directly:

**Before:**
```python
from agent_runtimes.server.demo_agent import create_demo_agent

agent = create_demo_agent()
# agent is tightly coupled to ACP
```

**After:**
```python
from agent_runtimes.agents import PydanticAIAgent
from agent_runtimes.adapters import ACPAdapter

# Create the agent
agent = PydanticAIAgent(...)

# Choose your protocol
acp_adapter = ACPAdapter(agent)  # For ACP
# or
agui_adapter = AGUIAdapter(agent)  # For AG-UI
# or
a2a_adapter = A2AAdapter(agent)  # For A2A
```

## Using Different Agent Libraries

### Pydantic AI (Type-Safe)
```python
from pydantic_ai import Agent
from agent_runtimes.agents import PydanticAIAgent
from agent_runtimes.adapters import ACPAdapter

# Create Pydantic AI agent
pydantic_agent = Agent(
    "openai:gpt-4o",
    instructions="You are a helpful assistant"
)

# Wrap with adapter
agent = PydanticAIAgent(pydantic_agent)
protocol = ACPAdapter(agent)
```

### LangChain (Workflows)
```python
from langchain.agents import AgentExecutor
from agent_runtimes.agents import LangChainAgent
from agent_runtimes.adapters import AGUIAdapter

# Create LangChain agent
lc_agent = AgentExecutor(...)

# Wrap with adapter
agent = LangChainAgent(lc_agent)
protocol = AGUIAdapter(agent)
```

### Jupyter AI (Notebooks)
```python
from jupyter_ai import ChatHandler
from agent_runtimes.agents import JupyterAIAgent
from agent_runtimes.adapters import ACPAdapter

# Create Jupyter AI handler
jupyter_handler = ChatHandler(...)

# Wrap with adapter
agent = JupyterAIAgent(jupyter_handler)
protocol = ACPAdapter(agent)
```

## Using Different Protocols

### ACP - Standard WebSocket Protocol
```python
from agent_runtimes.adapters import ACPAdapter

adapter = ACPAdapter(your_agent)

# Handle requests
response = await adapter.handle_request({
    "method": "session/prompt",
    "params": {
        "session_id": "session-123",
        "prompt": "Hello!"
    }
})
```

### AG-UI - Lightweight UI Protocol
```python
from agent_runtimes.adapters import AGUIAdapter

adapter = AGUIAdapter(your_agent)

# Handle requests
response = await adapter.handle_request({
    "message": "Hello!",
    "session_id": "session-123"
})
```

### A2A - Agent-to-Agent Protocol
```python
from agent_runtimes.adapters import A2AAdapter

adapter = A2AAdapter(your_agent)

# Handle agent requests
response = await adapter.handle_request({
    "task": "analyze_data",
    "data": {"values": [1, 2, 3]},
    "sender_agent_id": "agent-456"
})
```

## Server Integration

### Registering Agents with Different Protocols

```python
from fastapi import FastAPI
from agent_runtimes.agents import PydanticAIAgent, LangChainAgent
from agent_runtimes.adapters import ACPAdapter, AGUIAdapter

app = FastAPI()

# Create agents
pydantic_agent = PydanticAIAgent(...)
langchain_agent = LangChainAgent(...)

# Register with different protocols
acp_adapter = ACPAdapter(pydantic_agent)
agui_adapter = AGUIAdapter(langchain_agent)

# Add to your routes
# app.websocket("/acp")(acp_adapter.websocket_handler)
# app.post("/agui")(agui_adapter.http_handler)
```

## UI Changes

The example UI now supports selecting:
1. **Agent Library**: Choose between Pydantic AI, LangChain, or Jupyter AI
2. **Protocol**: Choose between ACP, AG-UI, or A2A

These selections are currently for display only - the actual implementation would need server-side support to route to the correct agent/protocol combination.

## Best Practices

### 1. Start with Pydantic AI + ACP
This is the most mature and tested combination.

### 2. Use Type Hints
Both agent and protocol adapters use type hints extensively.

```python
from typing import Optional
from agent_runtimes.agents.base import AgentContext

context: Optional[AgentContext] = None
```

### 3. Handle Errors Gracefully
All adapters return consistent error formats.

```python
try:
    response = await adapter.handle_request(request)
except Exception as e:
    # Handle protocol-specific error
    pass
```

### 4. Stream When Possible
Use streaming for better UX:

```python
async for event in adapter.handle_stream(request):
    # Process streaming events
    if event["type"] == "text":
        print(event["data"])
```

## Testing

### Test Agent Adapters
```python
from agent_runtimes.agents import PydanticAIAgent
from agent_runtimes.agents.base import AgentContext

agent = PydanticAIAgent(...)
context = AgentContext(session_id="test")

response = await agent.run("Hello", context)
assert response.content
```

### Test Protocol Adapters
```python
from agent_runtimes.adapters import ACPAdapter

adapter = ACPAdapter(agent)

response = await adapter.handle_request({
    "method": "session/prompt",
    "params": {"prompt": "Test"}
})

assert response["result"]
```

## Troubleshooting

### Agent not working?
- Check that the underlying library is installed
- Verify agent initialization
- Check agent.run() method directly

### Protocol not working?
- Verify request format matches protocol spec
- Check protocol adapter implementation
- Test with curl or similar tool

### Need help?
- See `ARCHITECTURE.md` for detailed docs
- Check examples in `src/examples/`
- Review test files for usage patterns

## Future Additions

The architecture makes it easy to add:
- New agent libraries (AutoGen, CrewAI, etc.)
- New protocols (gRPC, GraphQL, etc.)
- Custom middleware
- Protocol-specific optimizations

Just implement the appropriate adapter interface!
