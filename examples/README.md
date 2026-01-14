[![Datalayer](https://assets.datalayer.tech/datalayer-25.svg)](https://datalayer.io)

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

# Agent Runtimes Examples

This directory contains practical examples demonstrating how to use the Agent Runtimes functionality in various scenarios and frameworks.

## MCP Codemode and Agent Skills Examples

### Codemode Example (`codemode_example.py`)

Demonstrates the use of `mcp-codemode` for Code Mode - a pattern where agents write code to compose tools instead of calling them one by one.

```bash
python examples/codemode_example.py
```

Features demonstrated:
- Progressive tool discovery (Tool Search Tool pattern)
- Code-based tool composition in isolated sandboxes
- Creating and executing skills (reusable code compositions)
- Running the Codemode MCP server

### Skills Example (`skills_example.py`)

Demonstrates the use of `agent-skills` for managing reusable agent skills.

```bash
python examples/skills_example.py
```

Features demonstrated:
- Creating skills programmatically
- SKILL.md format (Claude Code compatible)
- Skill discovery and search
- Skill execution in sandboxes
- Skill versioning
- Running the Agent Skills MCP server

### Integration Example (`integration_example.py`)

Demonstrates how to integrate `mcp-codemode` and `agent-skills` with `agent-runtimes`.

```bash
python examples/integration_example.py
```

Features demonstrated:
- Setting up the CodemodeIntegration
- Code execution via integration
- Tool and skill search
- Complete agent workflows
- MCP server integration

## Key Concepts

### Code Mode

Instead of calling tools one-by-one through LLM inference, Code Mode allows agents to write Python code that orchestrates multiple tool calls. Benefits include:

- Reduced LLM calls for multi-step operations
- Better error handling with try/except
- Parallel execution with asyncio.gather
- Complex logic with loops and conditionals

Based on [Cloudflare's Code Mode](https://blog.cloudflare.com/introducing-code-mode).

### Skills

Skills are reusable, code-based tool compositions that agents can:

- Discover based on context
- Activate when needed
- Execute with parameters
- Share and version

Compatible with [Claude Code SKILL.md format](https://docs.anthropic.com/en/docs/claude-code/skills).

### Programmatic Tool Calling

Tools can be marked for programmatic calling with:
- `defer_loading: true` - Load tool definition on-demand
- `allowed_callers: ["code_execution"]` - Allow code-based invocation

Based on [Anthropic's Programmatic Tool Calling](https://www.anthropic.com/engineering/programmatic-tool-calling-beta).

## Installation

```bash
# Install agent-runtimes with optional dependencies
pip install agent-runtimes

# Install mcp-codemode and agent-skills
pip install mcp-codemode agent-skills
```
