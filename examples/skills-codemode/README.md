[![Datalayer](https://assets.datalayer.tech/datalayer-25.svg)](https://datalayer.io)

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

# Skills + Codemode Integration Example

This example demonstrates how to integrate **agent-codemode** and **agent-skills** with **agent-runtimes** for powerful AI agent capabilities.

## Overview

The `CodemodeIntegration` class provides a unified interface to:

- **Code Mode**: Execute Python code in isolated sandboxes with tool composition
- **Skills**: Discover and run reusable skill patterns
- **MCP Servers**: Connect to Model Context Protocol servers for tool access

## Prerequisites

```bash
pip install agent-runtimes agent-codemode agent-skills
```

## Run

```bash
python skills_codemode_example.py
```

## What This Example Demonstrates

### 1. Integration Setup

```python
from agent_runtimes.integrations import CodemodeIntegration

# Create the integration
integration = CodemodeIntegration(
    skills_path="./skills",
    sandbox_variant="local-eval",  # or "datalayer" for cloud
)

# Set up (discovers tools and skills)
await integration.setup()

# Or use as context manager for automatic cleanup
async with CodemodeIntegration() as integration:
    # Use integration here
    pass
```

### 2. Code Execution

Execute Python code in an isolated sandbox:

```python
result = await integration.execute_code('''
import json

data = {"message": "Hello from sandbox!"}
print(json.dumps(data, indent=2))
''')

print(f"Success: {result['success']}")
print(f"Output: {result.get('output')}")
```

### 3. Tool Search

Search for tools using natural language:

```python
# Search for file-related tools
tools = await integration.search_tools("file operations")

for tool in tools:
    print(f"{tool['name']}: {tool['description']}")

# Call a specific tool
result = await integration.call_tool(
    "filesystem__read_file",
    {"path": "/tmp/data.txt"}
)
```

### 4. Skills Integration

Access skills through the integration layer:

```python
async with CodemodeIntegration(skills_path="./skills") as integration:
    # Search for skills
    skills = await integration.search_skills("data analysis")

    # Run a skill
    result = await integration.run_skill(
        "analyze_csv",
        arguments={"file_path": "data.csv"}
    )
```

### 5. MCP Server Integration

Connect with agent-runtimes' MCP infrastructure:

```python
from agent_runtimes import get_mcp_manager
from agent_runtimes.types import MCPServer

# Get the agent-runtimes MCP manager
mcp_manager = get_mcp_manager()

# Add MCP servers
mcp_manager.add_server(MCPServer(
    id="filesystem",
    name="Filesystem Tools",
    url="http://localhost:8080/mcp",
))

# Create integration with the MCP manager
integration = CodemodeIntegration(mcp_manager=mcp_manager)
await integration.setup()

# Tools from those servers are now available
tools = await integration.search_tools("list files")
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     agent-runtimes                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              CodemodeIntegration                      │  │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐ │  │
│  │  │  agent-codemode │  │      agent-skills           │ │  │
│  │  │  - execute_code │  │  - search_skills            │ │  │
│  │  │  - search_tools │  │  - run_skill                │ │  │
│  │  │  - call_tool    │  │  - skill discovery          │ │  │
│  │  └─────────────────┘  └─────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────┴────────────────────────────┐    │
│  │                   MCP Manager                        │    │
│  │          (MCP servers, tool discovery)               │    │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Related Documentation

- [agent-codemode](https://github.com/datalayer/agent-codemode) - Code-first tool composition
- [agent-skills](https://github.com/datalayer/agent-skills) - Reusable skill patterns
- [agent-runtimes docs](../../docs/) - Full agent-runtimes documentation
