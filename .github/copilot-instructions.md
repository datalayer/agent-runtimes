# Agent Runtimes - Copilot Instructions

## Architecture Overview

**Agent Runtimes** is a unified platform with three layers:

1. **Python Server** (`agent_runtimes/`) - FastAPI backend hosting AI agents
2. **React Components** (`src/components/`) - Chat UI components with Zustand state
3. **Runtime Management** (`src/runtime/`) - Cloud runtime lifecycle with hooks

### Key Architectural Patterns

- **Adapters** (`agent_runtimes/adapters/`) - Unify agent frameworks (Pydantic AI, LangChain, Jupyter AI) via `BaseAgent`
- **Transports** (`agent_runtimes/transports/`) - Protocol translations (ACP, AG-UI, Vercel AI, A2A, MCP-UI) via `BaseTransport`
- **Routes** (`agent_runtimes/routes/`) - FastAPI endpoints for each protocol
- **Zustand Stores** (`src/components/chat/store/`, `src/runtime/`) - NO React providers needed, use `useChatStore.getState()` directly

## Development Commands

```bash
# Start both Python server + Vite dev server
npm run examples

# Run specific example (see examples.html for EXAMPLE values)
EXAMPLE=AgentCodemodeMcpExample npm run dev

# Build TypeScript + Vite
npm run build

# Tests
npm test                    # Unit tests
npm run test:coverage       # With coverage
npm run test:integration    # Integration tests

# Python server only
python -m agent_runtimes --port 8765 --debug
```

## Code Patterns

### Adding a New Agent (Python)
```python
# agent_runtimes/agents/my_agent/agent.py
from pydantic_ai import Agent
from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter

agent = Agent(model='anthropic:claude-sonnet-4-5', system_prompt='...')
adapter = PydanticAIAdapter(agent)
```

### Registering Frontend Tools (React)
```tsx
// Use the CopilotKit-compatible pattern
import { useFrontendTool } from '@datalayer/agent-runtimes';

useFrontendTool({
  name: 'tool_name',
  description: 'Tool description',
  parameters: [{ name: 'param', type: 'string', required: true }],
  handler: async (args) => { /* execute */ },
}, [dependencies]);
```

### Chat Components
- `ChatBase` - Core chat interface (use directly or extend)
- `ChatSidebar` - Collapsible sidebar with keyboard shortcuts
- `ChatFloating` - Floating widget for non-intrusive access

All components connect to agents via the chat store without providers:
```tsx
import { useChatStore } from '@datalayer/agent-runtimes';
useChatStore.getState().setInferenceProvider(provider);
```

### Runtime Management
```tsx
import { useAgentRuntime } from '@datalayer/agent-runtimes/lib/runtime';
const { launchRuntime, isReady, endpoint } = useAgentRuntime({ autoCreateAgent: true });
```

## File Organization

| Directory | Purpose |
|-----------|---------|
| `agent_runtimes/adapters/` | Agent framework adapters |
| `agent_runtimes/transports/` | Protocol adapters |
| `agent_runtimes/routes/` | FastAPI route handlers |
| `agent_runtimes/mcp/` | MCP tool integration |
| `src/components/chat/` | Chat UI (store, components, types) |
| `src/runtime/` | Cloud runtime Zustand store + hooks |
| `src/hooks/` | React hooks (useChat, useFrontendTool, etc.) |

## Conventions

- **TypeScript**: Use strict types, export from index files
- **Python**: Follow Pydantic patterns, use dataclasses for internal types
- **Protocols**: New protocols need both a transport (`transports/`) and route (`routes/`)
- **Tools**: Include `output_schema` and `input_examples` for Code Mode compatibility
- **Copyrights**: BSD 3-Clause, 2025-2026 Datalayer, Inc.
