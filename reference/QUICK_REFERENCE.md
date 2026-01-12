# Agent Runtimes - Quick Reference

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────┐
│                   Client Layer                      │
│   Web UI │ CLI │ Other Agents │ Notebooks          │
└─────────────────────────────────────────────────────┘
                        ↕
┌─────────────────────────────────────────────────────┐
│              Protocol Adapters                      │
│   ACP   │   AG-UI   │   A2A   │   (extensible)     │
└─────────────────────────────────────────────────────┘
                        ↕
┌─────────────────────────────────────────────────────┐
│            BaseAgent Interface (ABC)                │
│   - run()  - stream()  - tools  - cancel()         │
└─────────────────────────────────────────────────────┘
                        ↕
┌─────────────────────────────────────────────────────┐
│               Agent Adapters                        │
│  Pydantic AI │ LangChain │ Jupyter AI │ (more...)  │
└─────────────────────────────────────────────────────┘
                        ↕
┌─────────────────────────────────────────────────────┐
│          Underlying AI Libraries                    │
└─────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Choose Your Agent Library

| Library | Best For | Status |
|---------|----------|--------|
| **Pydantic AI** | Type-safe agents, validation | ✅ Ready |
| **LangChain** | Complex workflows, chains | ✅ Ready |
| **Jupyter AI** | Notebook integration | ✅ Ready |

### 2. Choose Your Protocol

| Protocol | Best For | Status |
|----------|----------|--------|
| **ACP** | Standard agent communication | ✅ Ready |
| **AG-UI** | Lightweight web UIs (Pydantic AI native) | ✅ Ready |
| **Vercel AI** | React/Next.js apps with Vercel AI SDK | ✅ Ready |
| **A2A** | Agent-to-agent collaboration | ✅ Ready |

### 3. Connect and Use

```python
# Create your agent
from agent_runtimes.agents import PydanticAIAgent
agent = PydanticAIAgent(...)

# Wrap with protocol
from agent_runtimes.adapters import ACPAdapter
adapter = ACPAdapter(agent)

# Use in your application
response = await adapter.handle_request({...})
```

## Protocol Comparison

### ACP (Agent Client Protocol)
- **Transport**: WebSocket
- **Format**: JSON-RPC 2.0
- **Use Case**: Standard agent communication
- **Features**: Sessions, streaming, tools, permissions
- **Best For**: Production deployments, complex interactions

### AG-UI (Agent UI)
- **Transport**: ASGI/Starlette app
- **Format**: Simple JSON
- **Use Case**: Web UI integration
- **Features**: Text streaming, thinking indicators
- **Best For**: Quick prototypes, simple UIs
- **Native Support**: Uses Pydantic AI's `AGUIApp`

### Vercel AI SDK
- **Transport**: HTTP POST with streaming
- **Format**: Vercel AI SDK messages
- **Use Case**: React/Next.js applications
- **Features**: Streaming, tool calls, usage tracking
- **Best For**: Modern web apps using Vercel AI SDK
- **Native Support**: Uses Pydantic AI's `VercelAIAdapter`

### A2A (Agent-to-Agent)
- **Transport**: HTTP/Function calls
- **Format**: JSON
- **Use Case**: Multi-agent systems
- **Features**: Task delegation, capability negotiation
- **Best For**: Agent collaboration, distributed systems

## Adding New Components

### New Agent Adapter (5 minutes)

1. Create file: `agent_runtimes/agents/my_agent.py`
2. Implement `BaseAgent` interface
3. Export in `__init__.py`

```python
from .base import BaseAgent

class MyAgent(BaseAgent):
    async def run(self, prompt, context):
        # Your implementation
        pass
```

### New Protocol Adapter (5 minutes)

1. Create file: `agent_runtimes/adapters/my_protocol.py`
2. Implement `BaseAdapter` interface
3. Export in `__init__.py`

```python
from .base import BaseAdapter

class MyProtocolAdapter(BaseAdapter):
    async def handle_request(self, request):
        # Your implementation
        pass
```

## Example Combinations

| Agent | Protocol | Use Case |
|-------|----------|----------|
| Pydantic AI + ACP | Production chat applications |
| LangChain + AG-UI | Interactive workflow builders |
| Jupyter AI + ACP | Notebook-based assistants |
| Any Agent + A2A | Multi-agent collaboration |

## Resources

- **Architecture**: See `ARCHITECTURE.md` for detailed documentation
- **API Reference**: Check individual adapter docstrings
- **Examples**: See `src/examples/AgentProtocolExample.tsx`
- **Protocol Specs**: Links in `ARCHITECTURE.md`
