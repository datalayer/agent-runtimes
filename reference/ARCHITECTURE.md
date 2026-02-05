# Agent Runtimes Architecture

## Overview

Agent Runtimes provides a flexible architecture for exposing different AI agent libraries through various communication protocols. The system uses an **adapter pattern** to decouple agent implementations from protocol implementations.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│  (Web UI, CLI, Other Agents, Jupyter Notebooks)             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Protocol Adapters                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │    ACP     │  │   AG-UI    │  │    A2A     │            │
│  │  Adapter   │  │   Adapter  │  │  Adapter   │            │
│  └────────────┘  └────────────┘  └────────────┘            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     Base Agent Interface                     │
│                      (BaseAgent ABC)                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     Agent Adapters                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Pydantic AI  │  │  LangChain   │  │  Jupyter AI  │      │
│  │   Adapter    │  │   Adapter    │  │   Adapter    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   Underlying AI Libraries                    │
│     pydantic-ai    │    langchain    │    jupyter-ai        │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Agent Adapters (`agent_runtimes/agents/`)

Agent adapters wrap different AI agent libraries to provide a consistent interface.

#### Base Agent Interface

All agent adapters implement the `BaseAgent` abstract base class:

```python
class BaseAgent(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        """Agent name"""

    @abstractmethod
    async def run(self, prompt: str, context: Optional[AgentContext]) -> AgentResponse:
        """Run the agent with a prompt"""

    @abstractmethod
    async def stream(self, prompt: str, context: Optional[AgentContext]) -> AsyncIterator[StreamEvent]:
        """Stream agent responses"""
```

#### Available Agent Adapters

| Adapter | Library | Status | Use Case |
|---------|---------|--------|----------|
| `PydanticAIAgent` | pydantic-ai | ✅ Implemented | Type-safe agents with Pydantic models |
| `LangChainAgent` | langchain | ✅ Implemented | Complex chains and agent workflows |
| `JupyterAIAgent` | jupyter-ai | ✅ Implemented | Jupyter notebook integration |

### 2. Protocol Adapters (`agent_runtimes/adapters/`)

Protocol adapters translate between external protocols and the internal `BaseAgent` interface.

#### Base Adapter Interface

All protocol adapters implement the `BaseAdapter` abstract base class:

```python
class BaseAdapter(ABC):
    def __init__(self, agent: BaseAgent):
        self.agent = agent

    @property
    @abstractmethod
    def protocol_name(self) -> str:
        """Protocol name"""

    @abstractmethod
    async def handle_request(self, request: dict[str, Any]) -> dict[str, Any]:
        """Handle a protocol request"""

    @abstractmethod
    async def handle_stream(self, request: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        """Handle a streaming protocol request"""
```

#### Available Protocol Adapters

| Adapter | Protocol | Status | Use Case |
|---------|----------|--------|----------|
| `ACPAdapter` | Agent Client Protocol | ✅ Implemented | Standard agent communication via WebSocket |
| `AGUIAdapter` | AG-UI | ✅ Implemented | Lightweight UI-focused protocol (Pydantic AI native) |
| `A2AAdapter` | Agent-to-Agent | ✅ Implemented | Inter-agent communication |
| `VercelAIAdapter` | Vercel AI SDK | ✅ Implemented | Vercel AI SDK compatible streaming (Pydantic AI native) |
| `MCPUIAdapter` | MCP-UI | ✅ Implemented | Interactive UI resources protocol |

## Protocol Specifications

### ACP (Agent Client Protocol)

- **Standard**: https://agentclientprotocol.com
- **Transport**: WebSocket
- **Format**: JSON-RPC 2.0
- **Features**: Session management, streaming, tool calls, permissions

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "session/prompt",
  "params": {
    "session_id": "session-123",
    "prompt": "Hello, agent!"
  },
  "id": 1
}
```

### AG-UI (Agent UI Protocol)

- **Purpose**: Lightweight protocol for web UI integration
- **Standard**: https://ai.pydantic.dev/ui/ag-ui/
- **Transport**: WebSocket or HTTP (ASGI/Starlette)
- **Format**: Simple JSON
- **Features**: Text streaming, thinking indicators, tool execution
- **Implementation**: Uses Pydantic AI's built-in `AGUIApp`

**Example Request:**
```json
{
  "message": "Hello, agent!",
  "session_id": "session-123",
  "context": {
    "history": []
  }
}
```

**Server Mount:**
```python
from agent_runtimes.adapters import AGUIAdapter

agui_adapter = AGUIAdapter(agent)
app = agui_adapter.get_app()  # Returns Starlette app

# Mount in FastAPI
from starlette.routing import Mount
main_app.mount("/agentic_chat", app)
```

### Vercel AI SDK Protocol

- **Purpose**: Compatible with Vercel AI SDK for React/Next.js apps
- **Standard**: https://ai.pydantic.dev/ui/vercel-ai/
- **Transport**: HTTP POST with streaming
- **Format**: Vercel AI SDK message format
- **Features**: Streaming responses, tool calls, usage tracking
- **Implementation**: Uses Pydantic AI's built-in `VercelAIAdapter`

**Client Example (React):**
```javascript
import { useChat } from 'ai/react';

const { messages, input, handleSubmit } = useChat({
  api: '/api/v1/vercel-ai/chat',
});
```

**Server Endpoint:**
```python
from agent_runtimes.adapters import VercelAIAdapter
from fastapi import Request

vercel_adapter = VercelAIAdapter(agent)

@app.post("/api/chat")
async def chat(request: Request):
    return await vercel_adapter.handle_vercel_request(request)
```

### A2A (Agent-to-Agent Protocol)

- **Purpose**: Inter-agent communication and collaboration
- **Transport**: HTTP or direct function calls
- **Format**: JSON
- **Features**: Task delegation, capability negotiation, result aggregation
- **Limitations**: Does not support per-request model selection (see [A2A Protocol Limitations](#a2a-protocol-limitations))

**Example Request:**
```json
{
  "task": "analyze_data",
  "data": {"values": [1, 2, 3]},
  "sender_agent_id": "agent-456",
  "conversation_id": "conv-789"
}
```

### MCP-UI (Model Context Protocol UI)

- **Purpose**: Interactive UI resources in agent responses
- **Standard**: https://mcpui.dev
- **Transport**: HTTP POST with JSON
- **Format**: MCP-UI resource format
- **Features**: HTML content, external URLs, Remote DOM, secure sandboxing
- **Implementation**: Uses `mcp-ui-server` Python SDK

**Example Request:**
```json
{
  "message": "Show me a visualization",
  "session_id": "session-123",
  "ui_options": {}
}
```

**Example Response:**
```json
{
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Here's your visualization:"
    },
    {
      "type": "resource",
      "resource": {
        "uri": "ui://viz/chart",
        "mimeType": "text/html",
        "text": "<div>...</div>"
      }
    }
  ]
}
```

## Adding New Adapters

### Adding a New Agent Adapter

1. **Create a new file** in `agent_runtimes/agents/`:

```python
# agent_runtimes/agents/my_agent.py
from .base import BaseAgent, AgentContext, AgentResponse

class MyAgent(BaseAgent):
    def __init__(self, underlying_agent):
        self._agent = underlying_agent

    async def run(self, prompt: str, context: Optional[AgentContext]) -> AgentResponse:
        # Translate to your library's API
        result = await self._agent.execute(prompt)
        return AgentResponse(content=result)
```

2. **Export in** `agent_runtimes/agents/__init__.py`:

```python
from .my_agent import MyAgent

__all__ = [..., "MyAgent"]
```

### Adding a New Protocol Adapter

1. **Create a new file** in `agent_runtimes/adapters/`:

```python
# agent_runtimes/adapters/my_protocol.py
from .base import BaseAdapter

class MyProtocolAdapter(BaseAdapter):
    @property
    def protocol_name(self) -> str:
        return "my-protocol"

    async def handle_request(self, request: dict[str, Any]) -> dict[str, Any]:
        # Translate protocol request to agent call
        response = await self.agent.run(request["message"])
        # Translate response back to protocol format
        return {"result": response.content}
```

2. **Export in** `agent_runtimes/adapters/__init__.py`:

```python
from .my_protocol import MyProtocolAdapter

__all__ = [..., "MyProtocolAdapter"]
```

## Usage Examples

### Example 1: Pydantic AI with ACP

```python
from pydantic_ai import Agent
from agent_runtimes.agents import PydanticAIAgent
from agent_runtimes.adapters import ACPAdapter

# Create Pydantic AI agent
pydantic_agent = Agent("openai:gpt-4o")

# Wrap with agent adapter
agent = PydanticAIAgent(pydantic_agent)

# Wrap with protocol adapter
acp_adapter = ACPAdapter(agent)

# Use in server
# server.add_agent(acp_adapter)
```

### Example 2: LangChain with AG-UI

```python
from langchain.agents import AgentExecutor
from agent_runtimes.agents import LangChainAgent
from agent_runtimes.adapters import AGUIAdapter

# Create LangChain agent
lc_agent = AgentExecutor(...)

# Wrap with agent adapter
agent = LangChainAgent(lc_agent)

# Wrap with protocol adapter
agui_adapter = AGUIAdapter(agent)

# Use in server
# server.add_agent(agui_adapter)
```

### Example 3: Agent-to-Agent Communication

```python
from agent_runtimes.agents import PydanticAIAgent
from agent_runtimes.adapters import A2AAdapter

# Create two agents
agent1 = PydanticAIAgent(...)
agent2 = PydanticAIAgent(...)

# Create A2A adapters
a2a_adapter1 = A2AAdapter(agent1)
a2a_adapter2 = A2AAdapter(agent2)

# Agent 1 sends task to Agent 2
request = {
    "task": "analyze_sentiment",
    "data": {"text": "This is great!"},
    "sender_agent_id": "agent-1",
}

response = await a2a_adapter2.handle_request(request)
```

## Protocol Feature Comparison

The following table compares features supported by each protocol:

| Feature | AG-UI | Vercel AI | ACP | A2A |
|---------|-------|-----------|-----|-----|
| Streaming | ✅ | ✅ | ✅ | ✅ |
| Tool Calling | ✅ | ✅ | ✅ | ✅ |
| Per-Request Model Selection | ✅ | ✅ | ✅ | ❌ |
| Bidirectional Communication | ❌ | ❌ | ✅ | ❌ |
| Human-in-the-Loop | ✅ | ❌ | ✅ | ❌ |
| Inter-Agent Communication | ❌ | ❌ | ❌ | ✅ |

### A2A Protocol Limitations

#### Per-Request Model Selection Not Supported

The **A2A (Agent-to-Agent) protocol does not support per-request model selection**. This is a fundamental architectural limitation:

**Why A2A Cannot Support Per-Request Model Override:**

1. **fasta2a Library Design**: A2A is implemented using pydantic-ai's `to_a2a()` method and the `fasta2a` library. The model is configured at agent creation time when calling `agent.to_a2a()`.

2. **Model Binding at Creation**: When an agent is converted to A2A format, the underlying pydantic-ai agent's model is fixed. The A2A protocol's `TaskSendParams` includes a `metadata` field, but `fasta2a`'s `AgentWorker` does not extract or forward model configuration to the agent's `run()` method.

3. **Protocol Architecture**: The A2A protocol is designed for agent-to-agent communication where agents are treated as independent services with fixed capabilities. The model is part of the agent's identity, not a per-request parameter.

**Frontend Behavior:**

When using the A2A protocol in the UI:
- The model selector is **disabled** (grayed out)
- A warning message is displayed: "A2A: Model set by agent config"
- The model shown is informational only - changing it has no effect

**Workarounds:**

1. **Deploy Multiple Agents**: Create separate A2A agents for each model you need, each configured with a different model at creation time.

2. **Use a Different Protocol**: If per-request model selection is required, use AG-UI, Vercel AI, or ACP protocols instead.

3. **Agent-Level Model Selection**: Configure the model in the agent's creation configuration rather than at request time.

**Example - Creating A2A Agents with Different Models:**

```python
from pydantic_ai import Agent
from agent_runtimes import PydanticAIAdapter
from agent_runtimes.routes.a2a import register_a2a_agent, A2AAgentCard

# Agent 1: GPT-4
gpt4_pydantic_agent = Agent("openai:gpt-4o", system_prompt="You are helpful.")
gpt4_agent = PydanticAIAdapter(gpt4_pydantic_agent, name="gpt4-agent")
register_a2a_agent(gpt4_agent, A2AAgentCard(
    id="gpt4-agent",
    name="GPT-4 Agent",
    description="Agent using GPT-4",
    url="/api/v1/a2a/agents/gpt4-agent"
))

# Agent 2: Claude
claude_pydantic_agent = Agent("anthropic:claude-3-5-sonnet-latest", system_prompt="You are helpful.")
claude_agent = PydanticAIAdapter(claude_pydantic_agent, name="claude-agent")
register_a2a_agent(claude_agent, A2AAgentCard(
    id="claude-agent",
    name="Claude Agent",
    description="Agent using Claude",
    url="/api/v1/a2a/agents/claude-agent"
))
```

## Extension Points

The architecture is designed for easy extension:

1. **New Agent Libraries**: Implement `BaseAgent` interface
2. **New Protocols**: Implement `BaseAdapter` interface
3. **Custom Tools**: Register tools via `ToolDefinition`
4. **Observability**: Hook into the tracer for monitoring
5. **Authentication**: Extend authentication services

## Best Practices

1. **Keep adapters thin**: Minimal translation logic only
2. **Use type hints**: Leverage Python's type system
3. **Handle errors gracefully**: Protocol-specific error formatting
4. **Document protocols**: Clear specification for each protocol
5. **Test thoroughly**: Unit tests for each adapter
6. **Version carefully**: Semver for breaking changes

## Future Roadmap

- [ ] OpenAI Assistants API adapter
- [ ] Anthropic Claude adapter
- [ ] MCP (Model Context Protocol) as a protocol adapter
- [ ] gRPC protocol support
- [ ] GraphQL protocol support
- [ ] Additional agent libraries (AutoGen, CrewAI, etc.)
